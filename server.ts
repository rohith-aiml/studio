
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

type GameSettings = {
    totalRounds: number;
};

type GameState = {
    players: Player[];
    messages: Message[];
    drawingHistory: DrawingPath[];
    isRoundActive: boolean;
    isGameOver: boolean;
    currentWord: string;
    revealedIndices: number[];
    roundTimer: number;
    drawerId: string | null;
    ownerId: string | null;
    gameSettings: GameSettings;
    currentRound: number;
};

type RoomState = {
    gameState: GameState;
    roundInterval: NodeJS.Timeout | null;
    hintInterval: NodeJS.Timeout | null;
    wordChoiceTimeout: NodeJS.Timeout | null;
}

const levenshteinDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) {
        matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j++) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + cost, // substitution
            );
        }
    }

    return matrix[b.length][a.length];
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

    // Clear all previous timers for safety
    if (room.roundInterval) clearInterval(room.roundInterval);
    if (room.hintInterval) clearInterval(room.hintInterval);
    if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
    room.roundInterval = null;
    room.hintInterval = null;
    room.wordChoiceTimeout = null;

    const activePlayers = room.gameState.players.filter(p => !p.disconnected);
    if (activePlayers.length < 2) {
      io.to(roomId).emit("error", "Not enough active players to start a round.");
      return;
    }
    
    const currentDrawerIndex = activePlayers.findIndex(p => p.id === room.gameState.drawerId);
    let nextDrawerIndex = (currentDrawerIndex + 1) % activePlayers.length;

    // A full cycle of drawers is complete, start a new round
    if (nextDrawerIndex === 0) {
        if (room.gameState.currentRound === 0) { // First round starting
             nextDrawerIndex = 0;
        } else {
             room.gameState.currentRound++;
        }
    }
     if (currentDrawerIndex === -1) { // This happens at the very start of the game
        room.gameState.currentRound = 1;
     }

    if (room.gameState.currentRound > room.gameState.gameSettings.totalRounds) {
        room.gameState.isGameOver = true;
        room.gameState.isRoundActive = false;
        room.gameState.messages.push({ playerName: "System", text: `Game Over! Check out the final scores!`, isCorrect: false });
        broadcastGameState(roomId);
        return;
    }
    
    const newDrawer = activePlayers[nextDrawerIndex];
    if (!newDrawer) return;

    room.gameState.drawingHistory = [];
    room.gameState.messages = [{ playerName: "System", text: `${newDrawer.name} is choosing a word...`, isCorrect: false }];
    room.gameState.currentWord = "";
    room.gameState.revealedIndices = [];
    room.gameState.roundTimer = 90;
    room.gameState.isRoundActive = false;
    room.gameState.drawerId = newDrawer.id;
    room.gameState.players.forEach(p => {
        p.isDrawing = p.id === newDrawer.id;
        p.hasGuessed = false;
    });
    const drawerPlayer = room.gameState.players.find(p => p.id === newDrawer.id);
    if(drawerPlayer) drawerPlayer.hasGuessed = true;

    const wordChoices: string[] = [];
    const wordsCopy = [...words];
    for (let i = 0; i < 4 && wordsCopy.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * wordsCopy.length);
        wordChoices.push(wordsCopy.splice(randomIndex, 1)[0]);
    }

    broadcastGameState(roomId);
    io.to(newDrawer.id).emit("promptWordChoice", wordChoices);
    
    // Set a timeout for word choice
    room.wordChoiceTimeout = setTimeout(() => {
        const currentRoom = gameRooms.get(roomId);
        // Check if round is still in the "choosing" phase for this drawer
        if (currentRoom && !currentRoom.gameState.isRoundActive && currentRoom.gameState.drawerId === newDrawer.id) {
            currentRoom.gameState.messages.push({ playerName: "System", text: `${newDrawer.name} took too long to choose a word. Skipping turn.`, isCorrect: false });
            broadcastGameState(roomId);
            startRound(roomId); // This will move to the next player
        }
    }, 15000); // 15 seconds
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
    if (room.wordChoiceTimeout) clearTimeout(room.wordChoiceTimeout);
    room.roundInterval = null;
    room.hintInterval = null;
    room.wordChoiceTimeout = null;

    if (!room.gameState.isRoundActive && !wordGuessed) {
         // This handles when the round ends before it began (e.g., drawer disconnects)
    } else {
        const message = wordGuessed ? "All players guessed the word!" : "Time's up!";
        room.gameState.messages.push({ playerName: "System", text: `${message} The word was: ${room.gameState.currentWord}`, isCorrect: false });
        io.to(roomId).emit("roundEnd", { word: room.gameState.currentWord });
    }
    
    room.gameState.isRoundActive = false;
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
            drawingHistory: [],
            isRoundActive: false,
            isGameOver: false,
            currentWord: "",
            revealedIndices: [],
            roundTimer: 90,
            drawerId: player.id,
            ownerId: player.id,
            gameSettings: { totalRounds: 3 },
            currentRound: 0,
        };

        gameRooms.set(roomId, { gameState: newGameState, roundInterval: null, hintInterval: null, wordChoiceTimeout: null });
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
        
        const me = room.gameState.players.find(p => p.id === socket.id);
        if (me && !room.gameState.isRoundActive) {
            const isOnlyPlayer = room.gameState.players.filter(p => !p.disconnected).length === 1;
            me.isDrawing = isOnlyPlayer;
            me.hasGuessed = isOnlyPlayer;
            if (isOnlyPlayer) {
                room.gameState.ownerId = me.id;
                room.gameState.drawerId = me.id;
            }
        }
        
        broadcastGameState(roomId);
    });

    socket.on("startGame", ({ totalRounds }: { totalRounds: number }) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.ownerId && !room.gameState.isRoundActive) {
            const activePlayers = room.gameState.players.filter(p => !p.disconnected);
            if (activePlayers.length < 2) {
                socket.emit("error", "You need at least 2 players to start.");
                return;
            }
            
            room.gameState.gameSettings.totalRounds = totalRounds;
            room.gameState.currentRound = 1;
            room.gameState.isGameOver = false;
            room.gameState.players.forEach(p => { p.score = 0; });
    
            // Make the owner the first drawer
            const ownerIndex = activePlayers.findIndex(p => p.id === socket.id);
            if(ownerIndex > 0) {
                const [owner] = activePlayers.splice(ownerIndex, 1);
                activePlayers.unshift(owner);
            }
            const disconnectedPlayers = room.gameState.players.filter(p => p.disconnected);
            room.gameState.players = [...activePlayers, ...disconnectedPlayers];
            
            // This sets the drawer to be the player before the owner, so startRound will pick the owner.
            room.gameState.drawerId = activePlayers[activePlayers.length - 1].id;
    
            startRound(currentRoomId);
        }
    });

    socket.on("playAgain", () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.ownerId) {
            room.gameState.isGameOver = false;
            room.gameState.isRoundActive = false;
            room.gameState.currentRound = 0;
            const ownerName = room.gameState.players.find(p => p.id === socket.id)?.name || 'The host';
            room.gameState.messages = [{ playerName: "System", text: `${ownerName} started a new game!`, isCorrect: false }];
            room.gameState.drawingHistory = [];
            
            room.gameState.players.forEach(p => {
                p.score = 0;
                const isOwner = p.id === socket.id;
                p.isDrawing = isOwner;
                p.hasGuessed = isOwner;
            });
            room.gameState.drawerId = socket.id;


            broadcastGameState(currentRoomId);
        }
    });

    socket.on("wordChosen", (word: string) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (!room || socket.id !== room.gameState.drawerId || room.gameState.isRoundActive) return;

        // Clear the word choice timeout
        if (room.wordChoiceTimeout) {
            clearTimeout(room.wordChoiceTimeout);
            room.wordChoiceTimeout = null;
        }

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
        if (!player || player.isDrawing || player.hasGuessed || !room.gameState.isRoundActive) return;

        const normalizedGuess = text.trim().toLowerCase();
        const normalizedWord = room.gameState.currentWord.trim().toLowerCase();
        const isCorrect = normalizedGuess === normalizedWord;

        if (isCorrect) {
            player.hasGuessed = true;
            const guesserPoints = Math.max(10, Math.floor(room.gameState.roundTimer * 0.6) + 10);
            player.score += guesserPoints;

            const drawer = room.gameState.players.find(p => p.isDrawing);
            if (drawer) {
                drawer.score += 20;
            }

            room.gameState.messages.push({ playerName: "System", text: `${player.name} guessed the word! (+${guesserPoints} pts)`, isCorrect: true });

            const allGuessed = room.gameState.players.filter(p => !p.isDrawing && !p.disconnected).every(p => p.hasGuessed);
            if (allGuessed) {
                endRound(currentRoomId, true);
            }
             broadcastGameState(currentRoomId);
        } else {
            io.to(currentRoomId).emit("playerGuessed", { playerName: player.name, text });
            if (room.gameState.currentWord) {
                const distance = levenshteinDistance(normalizedGuess, normalizedWord);
                if (distance === 1) {
                    socket.emit('closeGuess', "So close! One letter is off.");
                } else if (distance <= 3) {
                    socket.emit('closeGuess', "You're getting warmer!");
                }
            }
        }
    });

    socket.on("startPath", (path: DrawingPath) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId) {
            room.gameState.drawingHistory.push(path);
            socket.to(currentRoomId).emit("pathStarted", path);
        }
    });

    socket.on("drawPath", (path: DrawingPath) => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId && room.gameState.drawingHistory.length > 0) {
            room.gameState.drawingHistory[room.gameState.drawingHistory.length - 1] = path;
            socket.to(currentRoomId).emit("pathUpdated", path);
        }
    });
    
    socket.on("undo", () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId) {
            room.gameState.drawingHistory.pop();
            io.to(currentRoomId).emit("drawingUndone");
        }
    });

    socket.on("clearCanvas", () => {
        if (!currentRoomId) return;
        const room = gameRooms.get(currentRoomId);
        if (room && socket.id === room.gameState.drawerId) {
            room.gameState.drawingHistory = [];
            io.to(currentRoomId).emit("canvasCleared");
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

            if (socket.id === room.gameState.ownerId && activePlayers.length > 0) {
                room.gameState.ownerId = activePlayers[0].id;
                room.gameState.messages.push({ playerName: "System", text: `${activePlayers[0].name} is the new host.`, isCorrect: false });
            }

            if (socket.id === room.gameState.drawerId) {
                endRound(currentRoomId, false);
            } else {
                 const allGuessed = room.gameState.players.filter(p => !p.isDrawing && !p.disconnected).every(p => p.hasGuessed);
                 if (allGuessed && activePlayers.length > 1) { // Need more than one player for the round to end
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
