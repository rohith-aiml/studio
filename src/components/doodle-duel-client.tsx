
"use client";

import { analyzeDrawingHistory } from "@/ai/flows/skip-vote-trigger";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  Clock,
  Eraser,
  PartyPopper,
  Pencil,
  Undo,
  Users,
  Vote,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Toaster } from "./ui/toaster";
import { io, Socket } from "socket.io-client";

// --- TYPES ---
type Player = {
  id: string;
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

// --- SUB-COMPONENTS ---

const JoinScreen = ({ onJoin }: { onJoin: (name: string) => void }) => {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim());
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center text-primary font-headline">
            Doodle Duel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              placeholder="Enter your nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-center text-lg h-12"
              maxLength={15}
            />
            <Button type="submit" className="w-full h-12 text-lg">
              Join Game
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
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
                <AvatarImage src={`https://placehold.co/40x40.png?text=${p.name.charAt(0)}`} data-ai-hint="avatar person" />
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

const DrawingCanvas = React.forwardRef<HTMLCanvasElement, { onDrawEnd: (path: DrawingPath) => void, isDrawingPlayer: boolean, drawingHistory: DrawingPath[] }>(
    ({ onDrawEnd, isDrawingPlayer, drawingHistory }, ref) => {
        const isDrawing = useRef(false);
        const currentPath = useRef<DrawingPoint[]>([]);
        const colorRef = useRef("#000000");
        const lineWidthRef = useRef(5);

        // This effect is for drawing paths from other players
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
            return { x: clientX - rect.left, y: clientY - rect.top };
        };
        
        const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawingPlayer) return;
            isDrawing.current = true;
            const coords = getCoords(e.nativeEvent);
            if (coords) {
                currentPath.current = [coords];
            }
        }, [isDrawingPlayer]);

        const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawing.current || !isDrawingPlayer) return;
            const coords = getCoords(e.nativeEvent);
             if (coords && ref && 'current' in ref && ref.current) {
                const canvas = ref.current;
                const ctx = canvas.getContext('2d');
                if(!ctx) return;

                currentPath.current.push(coords);
                
                // Draw locally for responsiveness
                ctx.strokeStyle = colorRef.current;
                ctx.lineWidth = lineWidthRef.current;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                ctx.moveTo(currentPath.current[currentPath.current.length - 2]?.x, currentPath.current[currentPath.current.length - 2]?.y);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
            }
        }, [isDrawingPlayer, ref]);

        const stopDrawing = useCallback(() => {
            if (isDrawing.current && isDrawingPlayer && currentPath.current.length > 0) {
                 onDrawEnd({
                    color: colorRef.current,
                    lineWidth: lineWidthRef.current,
                    path: currentPath.current,
                });
            }
            isDrawing.current = false;
            currentPath.current = [];
        }, [isDrawingPlayer, onDrawEnd]);
        
        // Method for toolbar to update canvas properties
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  
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
    
    socket.on("connect", () => {
        console.log("Connected to server!");
        const storedSessionId = localStorage.getItem('doodle-duel-session');
        if (storedSessionId && name) {
            socket.emit("join", name, storedSessionId);
        }
    });

    socket.on("session", (newSessionId: string) => {
        setSessionId(newSessionId);
        localStorage.setItem('doodle-duel-session', newSessionId);
    });

    socket.on("gameStateUpdate", (newGameState: GameState) => {
        setGameState(newGameState);
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

    socket.on("roundEnd", ({ word }: { word: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const wasCorrect = player?.hasGuessed;

        toast({
            title: wasCorrect ? "Round Over!" : "Time's Up!",
            description: `The word was: ${word}`,
            duration: 5000,
            icon: wasCorrect ? <PartyPopper className="text-green-500" /> : <Clock />,
        });
    });

    socket.on("error", (message: string) => {
        toast({ title: "Error", description: message, variant: "destructive" });
    });

    return () => {
        socket.off("connect");
        socket.off("session");
        socket.off("gameStateUpdate");
        socket.off("timerUpdate");
        socket.off("drawingUpdate");
        socket.off("drawerWord");
        socket.off("roundEnd");
        socket.off("error");
    };

  }, [socket, name, toast, gameState.players]);
  
  // Update canvas brush
  useEffect(() => {
    if (canvasRef.current && (canvasRef.current as any).updateBrush) {
        (canvasRef.current as any).updateBrush(currentColor, currentLineWidth);
    }
  }, [currentColor, currentLineWidth]);

  // AI Drawing Analysis
  useEffect(() => {
    if (gameState.isRoundActive && !isDrawer) {
      aiCheckIntervalRef.current = setInterval(async () => {
        const historyString = JSON.stringify(gameState.drawingHistory.flatMap(p => p.path));
        if (historyString.length > 50 && fullWord) { // Using fullWord from drawer as target
            try {
                const result = await analyzeDrawingHistory({
                    drawingHistory: historyString,
                    targetWord: fullWord, // This is an issue: guessers don't know the word.
                });
                if (result.shouldInitiateSkipVote) {
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
                }
            } catch (error) {
                console.error("AI analysis failed:", error);
            }
        }
      }, AI_CHECK_INTERVAL);
    }
    return () => clearInterval(aiCheckIntervalRef.current);
  }, [gameState.isRoundActive, isDrawer, gameState.drawingHistory, fullWord, toast]);

  // --- Callbacks & Handlers ---

  const handleJoin = (name: string) => {
    setName(name);
    const storedSessionId = localStorage.getItem('doodle-duel-session');
    socket?.emit("join", name, storedSessionId);
  };

  const handleStartGame = () => {
    socket?.emit("startGame");
  };
  
  const handleGuess = (guess: string) => {
    socket?.emit("sendMessage", guess);
  };

  const handleDrawEnd = (path: DrawingPath) => {
    socket?.emit("draw", path);
  };

  const handleUndo = () => {
    socket?.emit("undo");
  };

  const handleClear = () => {
    socket?.emit("clearCanvas");
  };

  if (!name || !socket || !me) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <>
      <main className="flex flex-col md:flex-row h-screen bg-background p-4 gap-4 overflow-hidden">
        <div className="w-full md:w-1/4 flex flex-col gap-4">
          <Scoreboard players={gameState.players} currentPlayerId={socket.id} />
          <ChatBox messages={gameState.messages} onSendMessage={handleGuess} disabled={isDrawer || me?.hasGuessed} />
        </div>
        <div className="w-full md:w-3/4 flex flex-col items-center justify-center gap-2">
            {!gameState.isRoundActive ? (
                <Card className="p-8 text-center">
                    <CardTitle className="text-2xl mb-4">Waiting for the drawer to start...</CardTitle>
                    {isDrawer && <Button onClick={handleStartGame} size="lg">Start Round</Button>}
                </Card>
            ) : (
                <>
                    <div className="w-full max-w-2xl">
                        <Timer time={gameState.roundTimer} />
                        <WordDisplay maskedWord={gameState.currentWord} isDrawing={isDrawer} fullWord={fullWord} />
                    </div>
                    <DrawingCanvas 
                        ref={canvasRef} 
                        onDrawEnd={handleDrawEnd} 
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

