
import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import next from "next";
import fs from "fs";
import path from "path";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const port = process.env.PORT || 9002;

// --- TYPES ---
type Player = {
  id: string; // socket.id
  name: string;
  score: number;
  isDrawing: boolean;
  hasGuessed: boolean;
};

type Message = {
  playerName: string;
  text: string;
  isCorrect: boolean;
};

type DrawingPoint = { x: number; y: number };
type DrawingPath = {
  color: string;
  lineWidth: number;
  path: DrawingPoint[];
};

type GameState = {
  players: Player[];
  messages: Message[];
  drawingHistory: DrawingPath[];
  isRoundActive: boolean;
  currentWord: string;
  maskedWord: string;
  revealedIndices: number[];
  roundTimer: number;
  drawerId: string | null;
};

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // Allow all for dev
      methods: ["GET", "POST"],
    },
  });

  // --- GAME STATE ---
  let words: string[] = [];
  try {
    const wordsPath = path.join(process.cwd(), "public", "words.txt");
    words = fs.readFileSync(wordsPath, "utf8").split("\n").filter(Boolean);
  } catch (error) {
    console.error("Could not load words.txt:", error);
    words = ["default", "word", "list"];
  }

  const gameState: GameState = {
    players: [],
    messages: [],
    drawingHistory: [],
    isRoundActive: false,
    currentWord: "",
    maskedWord: "",
    revealedIndices: [],
    roundTimer: 90,
    drawerId: null,
  };

  let roundInterval: NodeJS.Timeout | null = null;
  let hintInterval: NodeJS.Timeout | null = null;

  const getMaskedWord = (word: string, revealedIndices: number[]) => {
    return word.split("").map((letter, index) => (revealedIndices.includes(index) || letter === ' ' ? letter : "_")).join(" ");
  };

  const broadcastGameState = () => {
    io.emit("gameStateUpdate", {
      ...gameState,
      currentWord: gameState.isRoundActive && gameState.drawerId !== null ? getMaskedWord(gameState.currentWord, gameState.revealedIndices) : ""
    });
  };

  const broadcastFullWordToDrawer = () => {
    if (gameState.drawerId) {
        io.to(gameState.drawerId).emit("drawerWord", gameState.currentWord);
    }
  };

  const startRound = () => {
    if (gameState.players.length < 2) {
      io.emit("error", "Not enough players to start a round.");
      return;
    }
    
    // Rotate drawer
    const currentDrawerIndex = gameState.players.findIndex(p => p.id === gameState.drawerId);
    const nextDrawerIndex = (currentDrawerIndex + 1) % gameState.players.length;
    const newDrawer = gameState.players[nextDrawerIndex];
    
    if (!newDrawer) return;

    // Reset for new round
    if (roundInterval) clearInterval(roundInterval);
    if (hintInterval) clearInterval(hintInterval);

    gameState.drawingHistory = [];
    gameState.messages = [{ playerName: "System", text: `${newDrawer.name} is now drawing!`, isCorrect: false }];
    gameState.currentWord = words[Math.floor(Math.random() * words.length)];
    gameState.revealedIndices = [];
    gameState.roundTimer = 90;
    gameState.isRoundActive = true;
    gameState.drawerId = newDrawer.id;
    gameState.players = gameState.players.map(p => ({
        ...p,
        isDrawing: p.id === newDrawer.id,
        hasGuessed: p.id === newDrawer.id,
    }));
    
    // Start timers
    roundInterval = setInterval(gameTick, 1000);

    broadcastGameState();
    broadcastFullWordToDrawer();
  };
  
  const gameTick = () => {
    gameState.roundTimer--;

    // Reveal hints
    if (gameState.roundTimer === 45) {
        revealHint();
        hintInterval = setInterval(revealHint, 10000);
    }

    if (gameState.roundTimer <= 0) {
      endRound(false);
    } else {
      io.emit("timerUpdate", gameState.roundTimer);
    }
  };

  const revealHint = () => {
    const unrevealed = gameState.currentWord.split('').map((_, i) => i).filter(i => !gameState.revealedIndices.includes(i) && gameState.currentWord[i] !== ' ');
    if (unrevealed.length > 2) { // Keep at least 2 letters hidden
        const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        gameState.revealedIndices.push(randomIndex);
        broadcastGameState();
    }
  }

  const endRound = (wordGuessed: boolean) => {
    if (roundInterval) clearInterval(roundInterval);
    if (hintInterval) clearInterval(hintInterval);
    roundInterval = null;
    hintInterval = null;

    gameState.isRoundActive = false;
    const message = wordGuessed ? "All players guessed the word!" : "Time's up!";
    gameState.messages.push({ playerName: "System", text: `${message} The word was: ${gameState.currentWord}`, isCorrect: false });
    
    io.emit("roundEnd", { word: gameState.currentWord });
    broadcastGameState();

    // Start next round after a delay
    setTimeout(startRound, 5000);
  };


  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join", (name: string, sessionId?: string) => {
        let player: Player | undefined = gameState.players.find(p => p.id === sessionId);

        if (player) {
            player.id = socket.id; // Update socket id on reconnect
        } else {
             player = { id: socket.id, name, score: 0, isDrawing: false, hasGuessed: false };
             gameState.players.push(player);
        }
        
        socket.emit("session", player.id);
        
        // Make first player the drawer
        if (gameState.players.length === 1) {
            player.isDrawing = true;
            player.hasGuessed = true;
            gameState.drawerId = player.id;
        }

        gameState.messages.push({ playerName: "System", text: `${player.name} has joined the game.`, isCorrect: false });
        broadcastGameState();
    });

    socket.on("startGame", () => {
        if (socket.id === gameState.drawerId && !gameState.isRoundActive) {
            startRound();
        }
    });

    socket.on("sendMessage", (text: string) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player || player.isDrawing || player.hasGuessed) return;

        const isCorrect = text.toLowerCase() === gameState.currentWord.toLowerCase();
        gameState.messages.push({ playerName: player.name, text, isCorrect });

        if(isCorrect) {
            player.hasGuessed = true;
            const guesserPoints = Math.max(10, Math.floor(gameState.roundTimer * 0.5));
            player.score += guesserPoints;

            const drawer = gameState.players.find(p => p.isDrawing);
            if (drawer) {
                drawer.score += 20;
            }

            // Check if round is over
            const allGuessed = gameState.players.filter(p => !p.isDrawing).every(p => p.hasGuessed);
            if (allGuessed) {
                endRound(true);
            }
        }
        broadcastGameState();
    });

    socket.on("startPath", (path: DrawingPath) => {
        if (socket.id === gameState.drawerId) {
            gameState.drawingHistory.push(path);
            io.emit("drawingUpdate", gameState.drawingHistory);
        }
    });

    socket.on("drawPath", (path: DrawingPath) => {
        if (socket.id === gameState.drawerId && gameState.drawingHistory.length > 0) {
            gameState.drawingHistory[gameState.drawingHistory.length - 1] = path;
            io.emit("drawingUpdate", gameState.drawingHistory);
        }
    });
    
    socket.on("undo", () => {
        if (socket.id === gameState.drawerId) {
            gameState.drawingHistory.pop();
            io.emit("drawingUpdate", gameState.drawingHistory);
        }
    });

    socket.on("clearCanvas", () => {
        if (socket.id === gameState.drawerId) {
            gameState.drawingHistory = [];
            io.emit("drawingUpdate", gameState.drawingHistory);
        }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      const player = gameState.players.find(p => p.id === socket.id);
      if(player) {
          gameState.messages.push({ playerName: "System", text: `${player.name} has left the game.`, isCorrect: false });
      }
      gameState.players = gameState.players.filter(p => p.id !== socket.id);
      if (socket.id === gameState.drawerId) {
        endRound(false);
      }
      broadcastGameState();
    });
  });

  expressApp.all("*", (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
