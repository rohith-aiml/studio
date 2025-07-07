
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Eraser,
  PartyPopper,
  Pencil,
  Undo,
  Users,
  Vote,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { AnalyzeDrawingHistoryOutput } from "@/ai/flows/skip-vote-trigger";
import { Toaster } from "./ui/toaster";

// --- TYPES ---
type Player = {
  id: string;
  name: string;
  avatarUrl: string;
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
  currentWord: string; // This will be the masked word
  roundTimer: number;
  drawerId: string | null;
};

// --- CONSTANTS ---
const ROUND_TIME = 90; // in seconds
const AI_CHECK_INTERVAL = 15000; // 15 seconds

const DRAWING_COLORS = [
  "#000000", "#ef4444", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#3b82f6", "#a78bfa", "#f472b6", "#ffffff",
];
const BRUSH_SIZES = [2, 5, 10, 20];
const AVATARS = [
    { url: 'https://placehold.co/80x80.png', hint: 'boy avatar' },
    { url: 'https://placehold.co/80x80.png', hint: 'man cartoon' },
    { url: 'https://placehold.co/80x80.png', hint: 'boy character' },
    { url: 'https://placehold.co/80x80.png', hint: 'male face' },
    { url: 'https://placehold.co/80x80.png', hint: 'girl avatar' },
    { url: 'https://placehold.co/80x80.png', hint: 'woman cartoon' },
    { url: 'https://placehold.co/80x80.png', hint: 'girl character' },
    { url: 'https://placehold.co/80x80.png', hint: 'female face' },
];


// --- SUB-COMPONENTS ---

const JoinScreen = ({ onJoin }: { onJoin: (name: string, avatarUrl: string) => void }) => {
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [roomIdFromUrl, setRoomIdFromUrl] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('roomId');
    if (id) setRoomIdFromUrl(id.toUpperCase());
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim(), selectedAvatar.url);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center text-primary font-headline">
            Doodle Duel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="nickname">Enter your nickname</Label>
                <Input
                  id="nickname"
                  placeholder="Your cool name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-center text-lg h-12"
                  maxLength={15}
                  required
                />
            </div>
            <div className="space-y-3">
                <Label>Choose your Avatar</Label>
                <div className="grid grid-cols-4 gap-4">
                    {AVATARS.map((avatar, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => setSelectedAvatar(avatar)}
                            className={cn(
                                "rounded-full ring-2 ring-offset-2 ring-offset-background transition-all aspect-square flex items-center justify-center",
                                selectedAvatar.url === avatar.url && selectedAvatar.hint === avatar.hint ? "ring-primary" : "ring-transparent hover:ring-primary/50"
                            )}
                        >
                            <Avatar className="w-full h-full">
                                <AvatarImage src={avatar.url} data-ai-hint={avatar.hint} />
                                <AvatarFallback>{avatar.hint.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </button>
                    ))}
                </div>
            </div>
            <Button type="submit" className="w-full h-12 text-lg">
              {roomIdFromUrl ? `Join Game: ${roomIdFromUrl}` : "Create New Game"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};


const RoomInfo = ({ roomId, toast }: { roomId: string | null; toast: any }) => {
    if (!roomId) return null;

    const inviteLink = `${window.location.origin}/?roomId=${roomId}`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(inviteLink).then(() => {
            toast({
                title: "Copied!",
                description: "Invite link copied to clipboard.",
            });
        }).catch(err => {
            console.error('Failed to copy: ', err);
            toast({
                title: "Error",
                description: "Could not copy link to clipboard.",
                variant: "destructive"
            });
        });
    };

    return (
        <Card className="mb-4">
            <CardHeader className="p-4">
                <CardTitle className="text-lg">Invite Players</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <p className="text-sm text-muted-foreground mb-2">Share this link to invite others to room <span className="font-bold text-primary">{roomId}</span>.</p>
                <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="text-sm" />
                    <Button onClick={copyToClipboard} size="icon" variant="outline">
                        <ClipboardCopy className="w-4 h-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};


const Scoreboard = ({ players, currentPlayerId }: { players: Player[]; currentPlayerId: string | null; }) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Users className="text-primary" /> Scoreboard
      </CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="space-y-3">
        {players.sort((a, b) => b.score - a.score).map((p) => (
          <li key={p.id} className={cn("flex items-center justify-between p-2 rounded-lg transition-all", p.id === currentPlayerId && "bg-accent/50")}>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={p.avatarUrl} />
                <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{p.name}</span>
              {p.isDrawing && <Pencil className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-primary">{p.score}</span>
              {p.hasGuessed && <Check className="w-5 h-5 text-green-500" />}
            </div>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

const Timer = ({ time }: { time: number }) => (
  <div className="w-full">
    <div className="flex justify-center items-center gap-2 mb-2 text-xl font-bold text-primary">
      <Clock className="w-6 h-6" />
      <span>{time}</span>
    </div>
    <Progress value={(time / ROUND_TIME) * 100} className="h-2" />
  </div>
);

const WordDisplay = ({ maskedWord, isDrawing, fullWord }: { maskedWord: string; isDrawing: boolean; fullWord: string; }) => (
  <div className="text-center py-4">
    <p className="text-muted-foreground text-sm font-medium">
      {isDrawing ? "You are drawing:" : "Guess the word!"}
    </p>
    <p className="text-4xl font-bold tracking-widest font-headline text-primary transition-all duration-300">
      {isDrawing ? fullWord : maskedWord}
    </p>
  </div>
);

const DrawingCanvas = React.forwardRef<HTMLCanvasElement, { 
    onDrawStart: (path: DrawingPath) => void, 
    onDrawing: (path: DrawingPath) => void, 
    isDrawingPlayer: boolean, 
    drawingHistory: DrawingPath[] 
}>(
    ({ onDrawStart, onDrawing, isDrawingPlayer, drawingHistory }, ref) => {
        const isDrawing = useRef(false);
        const currentPath = useRef<DrawingPoint[]>([]);
        const colorRef = useRef("#000000");
        const lineWidthRef = useRef(5);

        useEffect(() => {
            const canvas = ref && 'current' in ref && ref.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawingHistory.forEach(({ path, color, lineWidth }) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                path.forEach((point, index) => {
                    if (index === 0) ctx.moveTo(point.x, point.y);
                    else ctx.lineTo(point.x, point.y);
                });
                ctx.stroke();
            });
        }, [drawingHistory, ref]);

        const getCoords = (e: MouseEvent | TouchEvent): DrawingPoint | null => {
            if (!ref || typeof ref === 'function' || !ref.current) return null;
            const canvas = ref.current;
            const rect = canvas.getBoundingClientRect();
            
            let clientX, clientY;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                return null;
            }

            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            return { 
                x: (clientX - rect.left) * scaleX, 
                y: (clientY - rect.top) * scaleY 
            };
        };
        
        const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawingPlayer) return;
            e.preventDefault();
            isDrawing.current = true;
            const coords = getCoords(e.nativeEvent);
            if (coords) {
                const newPath = {
                    color: colorRef.current,
                    lineWidth: lineWidthRef.current,
                    path: [coords],
                };
                currentPath.current = newPath.path;
                onDrawStart(newPath);
            }
        }, [isDrawingPlayer, onDrawStart]);

        const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawing.current || !isDrawingPlayer) return;
            e.preventDefault();
            const coords = getCoords(e.nativeEvent);
             if (coords) {
                currentPath.current.push(coords);
                onDrawing({
                    color: colorRef.current,
                    lineWidth: lineWidthRef.current,
                    path: [...currentPath.current], // Send a copy
                });
            }
        }, [isDrawingPlayer, onDrawing]);

        const stopDrawing = useCallback(() => {
            isDrawing.current = false;
            currentPath.current = [];
        }, []);
        
        if (ref && 'current' in ref && ref.current) {
            (ref.current as any).updateBrush = (color: string, lineWidth: number) => {
                colorRef.current = color;
                lineWidthRef.current = lineWidth;
            };
        }


        return (
            <canvas
                ref={ref}
                width={800}
                height={600}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={cn("bg-white rounded-lg shadow-inner w-full h-auto aspect-[4/3]", isDrawingPlayer ? "cursor-crosshair" : "cursor-not-allowed")}
            />
        );
    }
);
DrawingCanvas.displayName = "DrawingCanvas";

const Toolbar = ({ color, setColor, lineWidth, setLineWidth, onUndo, onClear, disabled }: { color: string; setColor: (c: string) => void; lineWidth: number; setLineWidth: (w: number) => void; onUndo: () => void; onClear: () => void; disabled: boolean }) => (
  <Card className="mt-2">
    <CardContent className="p-2 flex flex-col md:flex-row items-center justify-center gap-4">
      <div className="flex items-center gap-2">
        {DRAWING_COLORS.map(c => (
          <Button
            key={c}
            onClick={() => setColor(c)}
            disabled={disabled}
            style={{ backgroundColor: c }}
            className={cn("w-8 h-8 rounded-full border-2", color === c ? "border-primary ring-2 ring-primary" : "border-transparent")}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {BRUSH_SIZES.map(s => (
          <Button
            key={s}
            onClick={() => setLineWidth(s)}
            disabled={disabled}
            variant={lineWidth === s ? "secondary" : "ghost"}
            className="rounded-full w-10 h-10 p-0"
            aria-label={`Brush size ${s}`}
          >
            <span className="bg-black rounded-full" style={{ width: s*1.5, height: s*1.5 }}></span>
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onUndo} disabled={disabled} variant="outline" size="icon"><Undo /></Button>
        <Button onClick={onClear} disabled={disabled} variant="outline" size="icon"><Eraser /></Button>
      </div>
    </CardContent>
  </Card>
);

const ChatBox = ({ messages, onSendMessage, disabled }: { messages: Message[], onSendMessage: (msg: string) => void, disabled: boolean }) => {
    const [message, setMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim()) {
            onSendMessage(message.trim());
            setMessage("");
        }
    };
    
    return (
        <Card className="flex-grow flex flex-col">
            <CardHeader><CardTitle>Chat & Guesses</CardTitle></CardHeader>
            <CardContent className="flex-grow overflow-y-auto pr-2 space-y-2">
                {messages.map((msg, i) => (
                    <div key={i} className={cn("p-2 rounded-lg", msg.isCorrect ? "bg-green-100 dark:bg-green-900" : "bg-muted/50")}>
                        <span className="font-bold text-primary">{msg.playerName}: </span>
                        {msg.isCorrect ? <span className="text-green-600 dark:text-green-400 font-medium">{msg.text}</span> : <span>{msg.text}</span>}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </CardContent>
            <form onSubmit={handleSubmit} className="p-4 border-t">
                <div className="relative">
                    <Input
                        placeholder={disabled ? "Only guessers can chat" : "Type your guess..."}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        disabled={disabled}
                    />
                    <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled={disabled}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </form>
        </Card>
    );
};

// --- MAIN COMPONENT ---
export default function DoodleDuelClient() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  
  const [gameState, setGameState] = useState<GameState>({
      players: [],
      messages: [],
      drawingHistory: [],
      isRoundActive: false,
      currentWord: "",
      roundTimer: ROUND_TIME,
      drawerId: null
  });
  const [fullWord, setFullWord] = useState("");
  const [wordChoices, setWordChoices] = useState<string[]>([]);

  const [currentColor, setCurrentColor] = useState(DRAWING_COLORS[0]);
  const [currentLineWidth, setCurrentLineWidth] = useState(BRUSH_SIZES[1]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiCheckIntervalRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  const me = gameState.players.find(p => p.id === socket?.id);
  const isDrawer = me?.isDrawing ?? false;

  // --- Effects ---

  // Initialize Socket.IO
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    return () => {
        newSocket.disconnect();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;
    
    socket.on("connect", () => console.log("Connected to server!"));

    socket.on("roomCreated", (newRoomId: string) => {
        setRoomId(newRoomId);
        window.history.pushState({}, '', `/?roomId=${newRoomId}`);
        toast({
            title: "Room Created!",
            description: `You are in room ${newRoomId}. Share the link to invite others!`,
        });
    });

    socket.on("gameStateUpdate", (newGameState: GameState) => {
        setGameState(newGameState);
        if (!newGameState.isRoundActive) {
            setWordChoices([]);
            setFullWord("");
        }
    });

    socket.on("timerUpdate", (time: number) => {
        setGameState(prev => ({...prev, roundTimer: time}));
    });

    socket.on("drawingUpdate", (history: DrawingPath[]) => {
        setGameState(prev => ({...prev, drawingHistory: history}));
    });
    
    socket.on("drawerWord", (word: string) => {
        setFullWord(word);
    });

    socket.on("promptWordChoice", (choices: string[]) => {
        setWordChoices(choices);
    });

    socket.on("roundEnd", ({ word }: { word: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const wasCorrect = player?.hasGuessed;
        setWordChoices([]);

        toast({
            title: wasCorrect ? "Round Over!" : "Time's Up!",
            description: `The word was: ${word}`,
            duration: 5000,
            icon: wasCorrect ? <PartyPopper className="text-green-500" /> : <Clock />,
        });
    });

    socket.on("aiSuggestion", (result: AnalyzeDrawingHistoryOutput) => {
        toast({
            title: "AI Suggestion",
            description: (
                <div className="flex items-center gap-2">
                    <Vote />
                    <div>
                        <p>{result.reason}</p>
                        <Button size="sm" className="mt-2">Vote to Skip</Button>
                    </div>
                </div>
            ),
            duration: 10000,
        });
    });


    socket.on("error", (message: string) => {
        toast({ title: "Error", description: message, variant: "destructive" });
        if (message.includes("Room not found")) {
            setTimeout(() => {
                window.location.href = "/";
            }, 2000);
        }
    });

    return () => {
        socket.off("connect");
        socket.off("roomCreated");
        socket.off("gameStateUpdate");
        socket.off("timerUpdate");
        socket.off("drawingUpdate");
        socket.off("drawerWord");
        socket.off("promptWordChoice");
        socket.off("roundEnd");
        socket.off("aiSuggestion");
        socket.off("error");
    };

  }, [socket, toast, gameState.players]);
  
  useEffect(() => {
    if (canvasRef.current && (canvasRef.current as any).updateBrush) {
        (canvasRef.current as any).updateBrush(currentColor, currentLineWidth);
    }
  }, [currentColor, currentLineWidth]);

  // AI Drawing Analysis
  useEffect(() => {
    clearInterval(aiCheckIntervalRef.current);
    if (gameState.isRoundActive && !isDrawer) {
      aiCheckIntervalRef.current = setInterval(() => {
        if (gameState.drawingHistory.length > 0) {
            socket?.emit("analyzeDrawing");
        }
      }, AI_CHECK_INTERVAL);
    }
    return () => clearInterval(aiCheckIntervalRef.current);
  }, [gameState.isRoundActive, isDrawer, gameState.drawingHistory, socket]);

  // --- Callbacks & Handlers ---

  const handleJoin = (newName: string, avatarUrl: string) => {
    setName(newName);
    const params = new URLSearchParams(window.location.search);
    const roomIdFromUrl = params.get('roomId');

    if (roomIdFromUrl) {
        socket?.emit("joinRoom", { name: newName, avatarUrl, roomId: roomIdFromUrl });
    } else {
        socket?.emit("createRoom", { name: newName, avatarUrl });
    }
  };

  const handleStartGame = () => socket?.emit("startGame");
  const handleGuess = (guess: string) => socket?.emit("sendMessage", guess);
  
  const handleWordChoice = (word: string) => {
    socket?.emit("wordChosen", word);
    setWordChoices([]);
  };

  const handleStartPath = (path: DrawingPath) => {
    socket?.emit("startPath", path);
    setGameState(prev => ({...prev, drawingHistory: [...prev.drawingHistory, path]}));
  };
  const handleDrawPath = (path: DrawingPath) => {
    socket?.emit("drawPath", path);
    setGameState(prev => {
        const newHistory = [...prev.drawingHistory];
        newHistory[newHistory.length - 1] = path;
        return {...prev, drawingHistory: newHistory};
    });
  };
  const handleUndo = () => socket?.emit("undo");
  const handleClear = () => socket?.emit("clearCanvas");

  if (!name) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <>
      <Dialog open={isDrawer && wordChoices.length > 0}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a word to draw</DialogTitle>
            <DialogDescription>
              Select one of the words below. Only you can see them.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {wordChoices.map((word) => (
              <Button
                key={word}
                onClick={() => handleWordChoice(word)}
                variant="outline"
                className="h-12 text-base"
              >
                {word}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <main className="flex flex-col md:flex-row h-screen bg-background p-4 gap-4 overflow-hidden">
        <div className="w-full md:w-1/4 flex flex-col gap-4">
          <RoomInfo roomId={roomId} toast={toast} />
          <Scoreboard players={gameState.players} currentPlayerId={socket?.id ?? null} />
          <ChatBox messages={gameState.messages} onSendMessage={handleGuess} disabled={isDrawer || (me?.hasGuessed ?? false)} />
        </div>
        <div className="w-full md:w-3/4 flex flex-col items-center justify-center gap-2">
            {!gameState.isRoundActive ? (
                <Card className="p-8 text-center">
                    <CardTitle className="text-2xl mb-2">Lobby</CardTitle>
                    <CardContent className="text-muted-foreground">
                        <p>Waiting for players...</p>
                        <p>{gameState.players.length} / 8 players</p>
                    </CardContent>
                    {isDrawer && gameState.players.length >= 2 && <Button onClick={handleStartGame} size="lg">Start Round</Button>}
                    {isDrawer && gameState.players.length < 2 && <p className="mt-4 text-sm">You need at least 2 players to start.</p>}
                    {!isDrawer && <p className="mt-4 text-sm">Waiting for {gameState.players.find(p => p.isDrawing)?.name || 'the host'} to start the game.</p>}
                </Card>
            ) : (
                <>
                    <div className="w-full max-w-2xl">
                        <Timer time={gameState.roundTimer} />
                        <WordDisplay maskedWord={gameState.currentWord} isDrawing={isDrawer} fullWord={fullWord} />
                    </div>
                    <DrawingCanvas 
                        ref={canvasRef} 
                        onDrawStart={handleStartPath}
                        onDrawing={handleDrawPath} 
                        isDrawingPlayer={isDrawer}
                        drawingHistory={gameState.drawingHistory}
                    />
                    {isDrawer && <Toolbar color={currentColor} setColor={setCurrentColor} lineWidth={currentLineWidth} setLineWidth={setCurrentLineWidth} onUndo={handleUndo} onClear={handleClear} disabled={!isDrawer} />}
                </>
            )}
        </div>
      </main>
      <Toaster />
    </>
  );
}
