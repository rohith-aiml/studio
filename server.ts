
import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import next from "next";
import fs from "fs";
import path from "path";
import { analyzeDrawingHistory } from "@/ai/flows/skip-vote-trigger";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const port = process.env.PORT || 9002;

// --- TYPES ---
type Player = {
  id: string; // socket.id
  name: string;
  avatarUrl: string;
  score: number;
  isDrawing: boolean;
  hasGuessed: boolean;
  disconnected?: boolean;
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
  revealedIndices: number[];
  roundTimer: number;
  drawerId: string | null;
};

type RoomState = {
    gameState: GameState;
    roundInterval: NodeJS.Timeout | null;
    hintInterval: NodeJS.Timeout | null;
}

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // Allow all for dev
      methods: ["GET", "POST"],
    },
  });

  // --- GAME STATE MANAGEMENT ---
  const gameRooms = new Map<string, RoomState>();
  let words: string[] = [];
  try {
    const wordsPath = path.join(process.cwd(), "public", "words.txt");
    words = fs.readFileSync(wordsPath, "utf8").split("\n").filter(Boolean);
  } catch (error) {
    console.error("Could not load words.txt:", error);
    words = ["default", "word", "list"];
  }

  // --- HELPER FUNCTIONS ---
  const generateRoomId = () => {
    let newId;
    do {
      newId = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (gameRooms.has(newId));
    return newId;
  };

  const getMaskedWord = (word: string, revealedIndices: number[]) => {
    return word.split("").map((letter, index) => (revealedIndices.includes(index) || letter === ' ' ? letter : "_")).join(" ");
  };

  const broadcastGameState = (roomId: string) => {
    const room = gameRooms.get(roomId);
    if (!room) return;

    const maskedState = {
      ...room.gameState,
      currentWord: room.gameState.isRoundActive && room.gameState.drawerId !== null 
          ? getMaskedWord(room.gameState.currentWord, room.gameState.revealedIndices) 
          : ""
    };
    io.to(roomId).emit("gameStateUpdate", maskedState);
  };

  const broadcastFullWordToDrawer = (roomId: string) => {
    const room = gameRooms.get(roomId);
    if (!room || !room.gameState.drawerId) return;
    io.to(room.gameState.drawerId).emit("drawerWord", room.gameState.currentWord);
  };

  // --- GAME LOGIC (PER ROOM) ---
  const startRound = (roomId: string) => {
    const room = gameRooms.get(roomId);
    if (!room) return;
    const activePlayers = room.gameState.players.filter(p => !p.disconnected);
    if (activePlayers.length < 2) {
      io.to(roomId).emit("error", "Not enough active players to start a round.");
      return;
    }
    
    const currentDrawerIndex = activePlayers.findIndex(p => p.id === room.gameState.drawerId);
    const nextDrawerIndex = (currentDrawerIndex + 1) % activePlayers.length;
    const newDrawer = activePlayers[nextDrawerIndex];
    
    if (!newDrawer) return;

    if (room.roundInterval) clearInterval(room.roundInterval);
    if (room.hintInterval) clearInterval(room.hintInterval);

    room.gameState.drawingHistory = [];
    room.gameState.messages = [{ playerName: "System", text: `${newDrawer.name} is choosing a word...`, isCorrect: false }];
    room.gameState.currentWord = "";
    room.gameState.revealedIndices = [];
    room.gameState.roundTimer = 90;
    room.gameState.isRoundActive = false;
    room.gameState.drawerId = newDrawer.id;
    room.gameState.players.forEach(p => {
        p.isDrawing = p.id === newDrawer.id;
        p.hasGuessed = p.id === newDrawer.id;
    });
    
    const wordChoices: string[] = [];
    const wordsCopy = [...words];
    for (let i = 0; i < 4 && wordsCopy.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * wordsCopy.length);
        wordChoices.push(wordsCopy.splice(randomIndex, 1)[0]);
    }

    broadcastGameState(roomId);
    io.to(newDrawer.id).emit("promptWordChoice", wordChoices);
  };
  
  const gameTick = (roomId: string) => {
    const room = gameRooms.get(roomId);
    if (!room) return;
    room.gameState.roundTimer--;

    if (room.gameState.roundTimer === 45) {
        revealHint(roomId);
        room.hintInterval = setInterval(() => revealHint(roomId), 10000);
    }

    if (room.gameState.roundTimer <= 0) {
      endRound(roomId, false);
    } else {
      io.to(roomId).emit("timerUpdate", room.gameState.roundTimer);
    }
  };

  const revealHint = (roomId: string) => {
    const room = gameRooms.get(roomId);
    if (!room) return;
    const { currentWord, revealedIndices } = room.gameState;
    const unrevealed = currentWord.split('').map((_, i) => i).filter(i => !revealedIndices.includes(i) && currentWord[i] !== ' ');
    if (unrevealed.length > 2) { 
        const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        revealedIndices.push(randomIndex);
        broadcastGameState(roomId);
    }
  }

  const endRound = (roomId: string, wordGuessed: boolean) => {
    const room = gameRooms.get(roomId);
    if (!room) return;

    if (room.roundInterval) clearInterval(room.roundInterval);
    if (room.hintInterval) clearInterval(room.hintInterval);
    room.roundInterval = null;
    room.hintInterval = null;

    if (!room.gameState.isRoundActive) return;

    room.gameState.isRoundActive = false;
    const message = wordGuessed ? "All players guessed the word!" : "Time's up!";
    room.gameState.messages.push({ playerName: "System", text: `${message} The word was: ${room.gameState.currentWord}`, isCorrect: false });
    
    io.to(roomId).emit("roundEnd", { word: room.gameState.currentWord });
    broadcastGameState(roomId);

    setTimeout(() => startRound(roomId), 5000);
  };


  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    let currentRoomId: string | null = null;

    socket.on("createRoom", ({ name, avatarUrl }: { name: string, avatarUrl: string }) => {
        const roomId = generateRoomId();
        currentRoomId = roomId;
        socket.join(roomId);

        const player: Player = { id: socket.id, name, avatarUrl, score: 0, isDrawing: true, hasGuessed: true, disconnected: false };

        const newGameState: GameState = {
            players: [player],
            messages: [{ playerName: "System", text: `${name} created the game.`, isCorrect: false }],
            drawingHistory: [], isRoundActive: false, currentWord: "", revealedIndices: [],
            roundTimer: 90, drawerId: player.id,
        };

        gameRooms.set(roomId, { gameState: newGameState, roundInterval: null, hintInterval: null });
        socket.emit("roomCreated", roomId);
        broadcastGameState(roomId);
    });

    socket.on("joinRoom", ({ name, avatarUrl, roomId }: { name: string, avatarUrl: string, roomId: string }) => {
        const room = gameRooms.get(roomId);
        if (!room) {
            socket.emit("error", "Room not found. Please check the ID or create a new game.");
            return;
        }

        const existingPlayer = room.gameState.players.find(p => p.name.toLowerCase() === name.toLowerCase());

        if (existingPlayer) {
            if (!existingPlayer.disconnected) {
                socket.emit("error", "A player with that name is already active in this room.");
                return;
            }
            // Player is rejoining
            existingPlayer.id = socket.id;
            existingPlayer.disconnected = false;
            existingPlayer.avatarUrl = avatarUrl;
            room.gameState.messages.push({ playerName: "System", text: `${existingPlayer.name} has rejoined the game.`, isCorrect: false });
        } else {
            // New player
            const player: Player = { id: socket.id, name, avatarUrl, score: 0, isDrawing: false, hasGuessed: false, disconnected: false };
            room.gameState.players.push(player);
            room.gameState.messages.push({ playerName: "System", text: `${player.name} has joined the game.`, isCorrect: false });
        }
        
        currentRoomId = roomId;
        socket.join(roomId);
        
        if (!room.gameState.isRoundActive) {
            const player = room.gameState.players.find(p => p.id === socket.id);
            if (player) {
                const isOnlyPlayer = room.gameState.players.filter(p => !p.disconnected).length === 1;
                player.isDrawing = isOnlyPlayer;
                player.hasGuessed = isOnlyPlayer;
            }
        }
        
        broadcastGameState(roomId);
    });

    socket.on("startGame", () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId && !room.gameState.isRoundActive) {
            startRound(currentRoomId);
        }
    });

    socket.on("wordChosen", (word: string) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (!room || socket.id !== room.gameState.drawerId || room.gameState.isRoundActive) return;

        const drawer = room.gameState.players.find(p => p.id === socket.id);
        if (!drawer) return;

        room.gameState.currentWord = word;
        room.gameState.isRoundActive = true;
        
        room.gameState.messages.pop(); // Remove "is choosing..."
        room.gameState.messages.push({ playerName: "System", text: `${drawer.name} is now drawing!`, isCorrect: false });
        
        room.roundInterval = setInterval(() => gameTick(currentRoomId!), 1000);

        broadcastGameState(currentRoomId);
        broadcastFullWordToDrawer(currentRoomId);
    });

    socket.on("sendMessage", (text: string) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (!room) return;

        const player = room.gameState.players.find(p => p.id === socket.id);
        if (!player || player.isDrawing || player.hasGuessed) return;

        const isCorrect = text.toLowerCase() === room.gameState.currentWord.toLowerCase();
        room.gameState.messages.push({ playerName: player.name, text, isCorrect });

        if(isCorrect) {
            player.hasGuessed = true;
            const guesserPoints = Math.max(10, Math.floor(room.gameState.roundTimer * 0.5));
            player.score += guesserPoints;

            const drawer = room.gameState.players.find(p => p.isDrawing);
            if (drawer) drawer.score += 20;

            const allGuessed = room.gameState.players.filter(p => !p.isDrawing && !p.disconnected).every(p => p.hasGuessed);
            if (allGuessed) {
                endRound(currentRoomId, true);
            }
        }
        broadcastGameState(currentRoomId);
    });

    socket.on("startPath", (path: DrawingPath) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId) {
            room.gameState.drawingHistory.push(path);
            socket.to(currentRoomId).emit("drawingUpdate", room.gameState.drawingHistory);
        }
    });

    socket.on("drawPath", (path: DrawingPath) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId && room.gameState.drawingHistory.length > 0) {
            room.gameState.drawingHistory[room.gameState.drawingHistory.length - 1] = path;
            socket.to(currentRoomId).emit("drawingUpdate", room.gameState.drawingHistory);
        }
    });
    
    socket.on("undo", () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId) {
            room.gameState.drawingHistory.pop();
            io.to(currentRoomId).emit("drawingUpdate", room.gameState.drawingHistory);
        }
    });

    socket.on("clearCanvas", () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId) {
            room.gameState.drawingHistory = [];
            io.to(currentRoomId).emit("drawingUpdate", room.gameState.drawingHistory);
        }
    });

    socket.on("analyzeDrawing", async () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (!room || !room.gameState.isRoundActive) return;

        try {
            const result = await analyzeDrawingHistory({
                drawingHistory: JSON.stringify(room.gameState.drawingHistory),
                targetWord: room.gameState.currentWord,
            });
            if (result.shouldInitiateSkipVote) {
                io.to(currentRoomId).emit("aiSuggestion", result);
            }
        } catch (error) {
            console.error("AI analysis failed on server:", error);
        }
    });

    socket.on("disconnect", () => {
        console.log(`Socket disconnected: ${socket.id}`);
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (!room) return;

        const playerIndex = room.gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = room.gameState.players[playerIndex];
            player.disconnected = true;
            room.gameState.messages.push({ playerName: "System", text: `${player.name} has left the game.`, isCorrect: false });
            
            const activePlayers = room.gameState.players.filter(p => !p.disconnected);
            if (activePlayers.length === 0) {
                setTimeout(() => {
                    const roomCheck = gameRooms.get(currentRoomId!);
                    if (roomCheck && roomCheck.gameState.players.every(p => p.disconnected)) {
                        if (roomCheck.roundInterval) clearInterval(roomCheck.roundInterval);
                        if (roomCheck.hintInterval) clearInterval(roomCheck.hintInterval);
                        gameRooms.delete(currentRoomId!);
                        console.log(`Room ${currentRoomId} closed due to inactivity.`);
                    }
                }, 300000); // 5 minutes
                broadcastGameState(currentRoomId);
                return;
            }

            if (socket.id === room.gameState.drawerId) {
                endRound(currentRoomId, false);
            } else {
                 const allGuessed = room.gameState.players.filter(p => !p.isDrawing && !p.disconnected).every(p => p.hasGuessed);
                 if (allGuessed && activePlayers.length > 0) {
                     endRound(currentRoomId, true);
                 }
            }
            broadcastGameState(currentRoomId);
        }
    });
  });

  expressApp.all("*", (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
