
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Eraser,
  Eye,
  EyeOff,
  MessageSquare,
  PartyPopper,
  Pencil,
  Sparkles,
  Trophy,
  Undo,
  Users,
  Vote,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Confetti from "react-confetti";
import { io, Socket } from "socket.io-client";
import type { AnalyzeDrawingHistoryOutput } from "@/ai/flows/skip-vote-trigger";
import { Toaster } from "./ui/toaster";
import { useIsMobile } from "@/hooks/use-mobile";

// --- TYPES ---
type Player = {
  id: string;
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
  currentWord: string; // This will be the masked word
  roundTimer: number;
  drawerId: string | null;
  ownerId: string | null;
  gameSettings: GameSettings;
  currentRound: number;
};

type Notification = {
  id: number;
  content: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning';
};


// --- CONSTANTS ---
const ROUND_TIME = 90; // in seconds
const AI_CHECK_INTERVAL = 15000; // 15 seconds
const ROUND_OPTIONS = [1, 2, 3, 5, 10];
const WORD_CHOICE_TIME = 15;

const DRAWING_COLORS = [
  "#000000", "#ef4444", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#3b82f6", "#a78bfa", "#f472b6", "#ffffff",
];
const BRUSH_SIZES = [2, 5, 10, 20];
const AVATARS = [
    { url: '🧑‍🦱', hint: 'boy avatar' },
    { url: '👨‍🦰', hint: 'man cartoon' },
    { url: '👦', hint: 'boy character' },
    { url: '👨‍🦳', hint: 'male face' },
    { url: '👩‍🦱', hint: 'girl avatar' },
    { url: '👧', hint: 'woman cartoon' },
    { url: '👩‍🦰', hint: 'girl character' },
    { url: '👩‍🦳', hint: 'female face' },
];


// --- SUB-COMPONENTS ---

const JoinScreen = ({ onJoin }: { onJoin: (name: string, avatarUrl: string, roomId?: string | null) => void }) => {
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [manualRoomId, setManualRoomId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('roomId');
    if (id) {
        setManualRoomId(id.toUpperCase());
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onJoin(name.trim(), selectedAvatar.url, manualRoomId.trim().toUpperCase() || null);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
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
                                <AvatarImage src={avatar.url} />
                                <AvatarFallback className="text-4xl bg-card">{avatar.url}</AvatarFallback>
                            </Avatar>
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="room-id">Join a Game (optional)</Label>
                <Input
                    id="room-id"
                    placeholder="Enter Room ID"
                    value={manualRoomId}
                    onChange={(e) => setManualRoomId(e.target.value)}
                    className="text-center text-lg h-12 uppercase"
                    maxLength={5}
                />
            </div>
            <Button type="submit" className="w-full h-12 text-lg">
              {manualRoomId.trim() ? `Join Game: ${manualRoomId.trim().toUpperCase()}` : "Create New Game"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
            <p>v1</p>
        </CardFooter>
      </Card>
    </div>
  );
};

const Scoreboard = ({ players, currentPlayerId }: { players: Player[]; currentPlayerId: string | null; }) => (
  <Card className="h-full flex flex-col min-h-0">
    <CardHeader className="p-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <Users className="text-primary w-4 h-4" /> Players
      </CardTitle>
    </CardHeader>
    <CardContent className="flex-grow overflow-y-auto p-1 space-y-1">
      <ul className="space-y-1">
        {players.sort((a, b) => b.score - a.score).map((p) => (
          <li key={p.id || p.name} className={cn(
              "flex items-center justify-between p-1.5 rounded-md transition-all",
              p.id === currentPlayerId && "bg-accent/50",
              p.disconnected && "opacity-50",
              p.hasGuessed && !p.isDrawing && "bg-green-100 dark:bg-green-900"
            )}>
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={p.avatarUrl} />
                <AvatarFallback className="text-sm">
                    {p.avatarUrl.startsWith('http') ? p.name.charAt(0) : p.avatarUrl}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-xs truncate">{p.name}</span>
                {p.disconnected && <span className="text-xs text-muted-foreground">(off)</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {p.isDrawing && <Pencil className="w-3 h-3 text-primary" />}
              <span className="font-bold text-sm text-primary">{p.score}</span>
            </div>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

const WordDisplay = ({ maskedWord, isDrawing, fullWord }: { maskedWord: string; isDrawing: boolean; fullWord: string; }) => {
    const [isWordVisible, setIsWordVisible] = useState(true);

    useEffect(() => {
        if (isDrawing && fullWord) {
            setIsWordVisible(true);
        }
    }, [fullWord, isDrawing]);
    
    return (
      <div className="text-center py-1 flex-grow">
        <p className="text-muted-foreground text-xs font-medium">
          {isDrawing ? "You are drawing:" : "Guess the word!"}
        </p>
        <div className="flex items-center justify-center gap-2">
            <p className="text-2xl md:text-3xl font-bold tracking-widest font-headline text-primary transition-all duration-300">
              {isDrawing ? (isWordVisible ? fullWord : '*'.repeat(fullWord.length).split('').join(' ')) : maskedWord}
            </p>
            {isDrawing && fullWord && (
                <Button onClick={() => setIsWordVisible(!isWordVisible)} size="icon" variant="ghost" className="h-8 w-8">
                    {isWordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    <span className="sr-only">{isWordVisible ? 'Hide word' : 'Show word'}</span>
                </Button>
            )}
        </div>
      </div>
    );
};

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

        const redrawCanvas = useCallback(() => {
            const canvas = ref && 'current' in ref && ref.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
            }

            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, rect.width, rect.height);


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
        }, [ref, drawingHistory]);

        useEffect(() => {
            redrawCanvas();
            const canvas = ref && 'current' in ref && ref.current;
            const resizeObserver = new ResizeObserver(() => redrawCanvas());
            if (canvas) resizeObserver.observe(canvas);
            return () => {
                if (canvas) resizeObserver.unobserve(canvas);
            }
        }, [drawingHistory, ref, redrawCanvas]);

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
            
            const dpr = window.devicePixelRatio || 1;
            return { 
                x: (clientX - rect.left), 
                y: (clientY - rect.top)
            };
        };
        
        const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawingPlayer) return;
            const canvas = ref && 'current' in ref && ref.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx || !canvas) return;

            isDrawing.current = true;
            const coords = getCoords(e.nativeEvent);
            if (coords) {
                const newPathData = {
                    color: colorRef.current,
                    lineWidth: lineWidthRef.current,
                    path: [coords],
                };
                currentPath.current = newPathData.path;
                
                ctx.beginPath();
                ctx.moveTo(coords.x, coords.y);
                ctx.strokeStyle = newPathData.color;
                ctx.lineWidth = newPathData.lineWidth;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                
                onDrawStart(newPathData);
            }
        }, [isDrawingPlayer, onDrawStart, ref]);

        const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawing.current || !isDrawingPlayer) return;
            const canvas = ref && 'current' in ref && ref.current;
            const ctx = canvas?.getContext('2d');
            if (!ctx) return;

            const coords = getCoords(e.nativeEvent);
            if (coords) {
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();

                currentPath.current.push(coords);
                onDrawing({
                    color: colorRef.current,
                    lineWidth: lineWidthRef.current,
                    path: [...currentPath.current],
                });
            }
        }, [isDrawingPlayer, onDrawing, ref]);

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
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                onTouchEnd={(e) => { e.preventDefault(); stopDrawing(); }}
                className={cn(
                    "bg-white rounded-lg shadow-inner w-full h-full", 
                    isDrawingPlayer ? "cursor-crosshair touch-none" : "cursor-not-allowed"
                )}
            />
        );
    }
);
DrawingCanvas.displayName = "DrawingCanvas";

const Toolbar = ({ color, setColor, lineWidth, setLineWidth, onUndo, onClear, disabled }: { color: string; setColor: (c: string) => void; lineWidth: number; setLineWidth: (w: number) => void; onUndo: () => void; onClear: () => void; disabled: boolean }) => (
  <Card className="mt-2">
    <CardContent className="p-2 flex flex-wrap items-center justify-center gap-2 md:gap-4">
      <div className="flex items-center gap-1 md:gap-2">
        {DRAWING_COLORS.map(c => (
          <Button
            key={c}
            onClick={() => setColor(c)}
            disabled={disabled}
            style={{ backgroundColor: c }}
            className={cn("w-6 h-6 md:w-8 md:h-8 rounded-full border-2", color === c ? "border-primary ring-2 ring-primary" : "border-transparent")}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        {BRUSH_SIZES.map(s => (
          <Button
            key={s}
            onClick={() => setLineWidth(s)}
            disabled={disabled}
            variant={lineWidth === s ? "secondary" : "ghost"}
            className="rounded-full w-8 h-8 md:w-10 md:h-10 p-0"
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

const ChatBox = ({ messages, onSendMessage, disabled, showForm = true }: { messages: Message[], onSendMessage?: (msg: string) => void, disabled?: boolean, showForm?: boolean }) => {
    const [message, setMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = () => {
        if (message.trim() && onSendMessage) {
            onSendMessage(message.trim());
            setMessage("");
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    return (
        <Card className="flex-grow flex flex-col min-h-0 h-full">
            <CardHeader className="p-2"><CardTitle className="text-base">Chat</CardTitle></CardHeader>
            <CardContent className="flex-grow overflow-y-auto p-2 space-y-2">
                {messages.map((msg, i) => (
                    <div key={i} className={cn("p-1.5 rounded-md text-xs", msg.isCorrect ? "bg-green-100 dark:bg-green-900" : "bg-muted/50")}>
                        {msg.isCorrect ? (
                             <span className="text-green-600 dark:text-green-400 font-medium">{msg.text}</span>
                        ) : (
                           <span><span className="font-bold text-primary">{msg.playerName}: </span> {msg.text}</span>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </CardContent>
            {showForm && (
                <form onSubmit={handleSubmit} className="p-2 border-t">
                    <div className="relative">
                        <Input
                            placeholder={disabled ? "Only guessers can chat" : "Type your guess..."}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={disabled}
                        />
                        <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled={disabled}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </form>
            )}
        </Card>
    );
};

const GameOverScreen = ({ players, ownerId, currentSocketId, onPlayAgain }: { players: Player[]; ownerId: string | null; currentSocketId: string | null; onPlayAgain: () => void; }) => {
    const winners = [...players].sort((a, b) => b.score - a.score);
    const topThree = winners.slice(0, 3);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [showConfetti, setShowConfetti] = useState(false);
    const gameOverAudioRef = useRef<HTMLAudioElement>(null);


    useEffect(() => {
        if (typeof window !== 'undefined') {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        }
        const timer = setTimeout(() => setShowConfetti(true), 500);
        
        gameOverAudioRef.current?.play().catch(e => console.error("Error playing sound:", e));

        return () => clearTimeout(timer);
    }, []);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-4 overflow-y-auto">
        {showConfetti && dimensions.width > 0 && (
            <Confetti
                width={dimensions.width}
                height={dimensions.height}
                numberOfPieces={400}
                recycle={false}
                gravity={0.12}
                onConfettiComplete={(confetti) => {
                    setShowConfetti(false);
                    if (confetti) {
                        confetti.reset();
                    }
                }}
            />
        )}
        <h1 className="text-5xl md:text-6xl font-bold text-primary mb-4 font-headline animate-bounce">
          Game Over!
        </h1>
        <h2 className="text-2xl md:text-3xl text-muted-foreground mb-8">Final Scores</h2>
        <div className="flex flex-row flex-wrap items-end justify-center gap-4">
            {topThree[1] && (
                <Card className="w-full max-w-[14rem] md:w-64 border-4 border-slate-400 shadow-2xl animate-slide-up order-2" style={{ animationDelay: '200ms' }}>
                    <CardHeader className="p-4">
                        <Trophy className="w-16 h-16 mx-auto text-slate-400" />
                        <CardTitle className="text-4xl">2nd</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <Avatar className="w-24 h-24 mx-auto mb-4">
                            <AvatarImage src={topThree[1].avatarUrl} />
                            <AvatarFallback className="text-5xl bg-card">{topThree[1].avatarUrl}</AvatarFallback>
                        </Avatar>
                        <p className="text-2xl font-bold truncate">{topThree[1].name}</p>
                        <p className="text-xl text-primary">{topThree[1].score} points</p>
                    </CardContent>
                </Card>
            )}

            {topThree[0] && (
                <Card className="w-full max-w-[16rem] md:w-72 border-4 border-amber-400 shadow-2xl animate-slide-up order-1">
                     <CardHeader className="p-4">
                        <Trophy className="w-20 h-20 mx-auto text-amber-400" />
                        <CardTitle className="text-5xl">1st</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                         <Avatar className="w-28 h-28 mx-auto mb-4">
                            <AvatarImage src={topThree[0].avatarUrl} />
                            <AvatarFallback className="text-6xl bg-card">{topThree[0].avatarUrl}</AvatarFallback>
                        </Avatar>
                        <p className="text-3xl font-bold truncate">{topThree[0].name}</p>
                        <p className="text-2xl text-primary">{topThree[0].score} points</p>
                    </CardContent>
                </Card>
            )}

            {topThree[2] && (
                 <Card className="w-full max-w-[14rem] md:w-64 border-4 border-amber-700 shadow-2xl animate-slide-up order-3" style={{ animationDelay: '400ms' }}>
                    <CardHeader className="p-4">
                        <Trophy className="w-16 h-16 mx-auto text-amber-700" />
                        <CardTitle className="text-4xl">3rd</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <Avatar className="w-24 h-24 mx-auto mb-4">
                            <AvatarImage src={topThree[2].avatarUrl} />
                            <AvatarFallback className="text-5xl bg-card">{topThree[2].avatarUrl}</AvatarFallback>
                        </Avatar>
                        <p className="text-2xl font-bold truncate">{topThree[2].name}</p>
                        <p className="text-xl text-primary">{topThree[2].score} points</p>
                    </CardContent>
                </Card>
            )}
        </div>

        {winners.length > 3 && (
            <div className="w-full max-w-md mt-12">
                 <Card>
                    <CardHeader><CardTitle className="text-2xl">Final Leaderboard</CardTitle></CardHeader>
                    <CardContent className="p-2 md:p-4 text-left">
                        <ul className="space-y-2">
                            {winners.map((player, index) => (
                                <li key={player.id} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold w-8 text-center text-muted-foreground">{index + 1}.</span>
                                        <Avatar className="w-10 h-10">
                                            <AvatarImage src={player.avatarUrl} />
                                            <AvatarFallback className="text-2xl bg-card">{player.avatarUrl}</AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium truncate">{player.name}</span>
                                    </div>
                                    <span className="font-bold text-primary">{player.score} points</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                 </Card>
            </div>
        )}

        <div className="mt-12">
            {currentSocketId === ownerId ? (
                <Button size="lg" onClick={onPlayAgain} className="text-lg h-12">Play Again</Button>
            ) : (
                <p className="text-lg text-muted-foreground">Waiting for the host to start a new game...</p>
            )}
        </div>
        <audio ref={gameOverAudioRef} src="/game-over.mp3" preload="auto" className="hidden" />
      </div>
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
      isGameOver: false,
      currentWord: "",
      roundTimer: ROUND_TIME,
      drawerId: null,
      ownerId: null,
      gameSettings: { totalRounds: 3 },
      currentRound: 0,
  });
  const [fullWord, setFullWord] = useState("");
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [wordChoiceCountdown, setWordChoiceCountdown] = useState(WORD_CHOICE_TIME);

  const [currentColor, setCurrentColor] = useState(DRAWING_COLORS[0]);
  const [currentLineWidth, setCurrentLineWidth] = useState(BRUSH_SIZES[1]);

  const [selectedRounds, setSelectedRounds] = useState(ROUND_OPTIONS[2]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [mobileGuess, setMobileGuess] = useState("");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiCheckIntervalRef = useRef<NodeJS.Timeout>();
  const notificationSoundRef = useRef<HTMLAudioElement>(null);
  const notificationIdCounter = useRef(0);

  const { toast } = useToast();
  const isMobile = useIsMobile();

  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);


  const me = gameState.players.find(p => p.id === socket?.id);
  const isOwner = me?.id === gameState.ownerId;
  const isDrawer = me?.isDrawing ?? false;
  const guessInputDisabled = isDrawer || (me?.hasGuessed ?? false) || me?.disconnected === true;
  const isMobileGuesser = isMobile && !isDrawer && gameState.isRoundActive && !gameState.isGameOver;

  // --- Effects ---

  useEffect(() => {
    let newSocket: Socket;

    const initializeSocket = () => {
        if (socket) {
            socket.disconnect();
        }

        newSocket = io({
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });
        setSocket(newSocket);
    };

    initializeSocket();

    return () => {
        if (newSocket) newSocket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNotification = useCallback((content: React.ReactNode, icon?: React.ReactNode, variant: Notification['variant'] = 'default') => {
    const id = notificationIdCounter.current++;
    setNotifications(prev => [...prev, { id, content, icon, variant }]);
    setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const handleCloseGuess = useCallback((message: string) => {
    notificationSoundRef.current?.play().catch(e => console.error("Error playing sound:", e));
    addNotification(message, <Sparkles className="w-4 h-4" />, 'warning');
  }, [addNotification]);
  
  const handlePlayerGuessed = useCallback(({ playerName, text }: { playerName: string, text: string }) => {
    addNotification(
      <span><span className="font-bold">{playerName}:</span> {text}</span>,
      <MessageSquare className="w-4 h-4" />,
      'default'
    );
  }, [addNotification]);

  const handleCorrectGuessNotification = useCallback(({ playerName }: { playerName: string }) => {
    notificationSoundRef.current?.play().catch(e => console.error("Error playing sound:", e));
    addNotification(
      <span><span className="font-bold">{playerName}</span> guessed the word!</span>,
      <Check className="w-4 h-4" />,
      'success'
    );
  }, [addNotification]);

  useEffect(() => {
    if (!socket) return;
    
    socket.off();

    const onConnect = () => {
        console.log("Connected to server!");
        if (name && roomId) {
            socket.emit("joinRoom", { name, avatarUrl: me?.avatarUrl || AVATARS[0].url, roomId });
        }
    };
    const onRoomCreated = (newRoomId: string) => {
        setRoomId(newRoomId);
        window.history.pushState({}, '', `/?roomId=${newRoomId}`);
        toast({ title: "Room Created!", description: `You are in room ${newRoomId}. Share the link to invite others!` });
    };
    const onGameStateUpdate = (newGameState: GameState) => {
        setGameState(newGameState);
        if (!newGameState.isRoundActive) {
             setWordChoices([]);
             setFullWord("");
        }
    };
    const onTimerUpdate = (time: number) => setGameState(prev => ({...prev, roundTimer: time}));
    const onPathStarted = (path: DrawingPath) => setGameState(prev => ({...prev, drawingHistory: [...prev.drawingHistory, path]}));
    const onPathUpdated = (path: DrawingPath) => {
        setGameState(prev => {
            const newHistory = [...prev.drawingHistory];
            if (newHistory.length > 0) {
              newHistory[newHistory.length - 1] = path;
            }
            return {...prev, drawingHistory: newHistory};
        });
    };
    const onDrawingUndone = () => setGameState(prev => ({ ...prev, drawingHistory: prev.drawingHistory.slice(0, -1) }));
    const onCanvasCleared = () => setGameState(prev => ({...prev, drawingHistory: []}));
    const onDrawerWord = (word: string) => setFullWord(word);
    const onPromptWordChoice = (choices: string[]) => setWordChoices(choices);
    const onRoundEnd = ({ word }: { word: string }) => {
        const player = gameStateRef.current.players.find(p => p.id === socket.id);
        toast({
            title: player?.hasGuessed ? "Round Over!" : "Time's Up!",
            description: `The word was: ${word}`,
            duration: 5000,
            icon: player?.hasGuessed ? <PartyPopper className="text-green-500" /> : <Clock />,
        });
    };
    const onAiSuggestion = (result: AnalyzeDrawingHistoryOutput) => {
        notificationSoundRef.current?.play().catch(e => console.error("Error playing sound:", e));
        toast({
            title: "AI Suggestion",
            description: (<div className="flex items-center gap-2"><Vote /><div><p>{result.reason}</p><Button size="sm" className="mt-2">Vote to Skip</Button></div></div>),
            duration: 10000,
        });
    };
    const onError = (message: string) => {
        toast({ title: "Error", description: message, variant: "destructive" });
        if (message.includes("Room not found") || message.includes("active in this room")) {
            setTimeout(() => {
                window.history.replaceState({}, '', '/');
                setName(null);
                setRoomId(null);
            }, 2000);
        }
    };
    
    socket.on("connect", onConnect);
    socket.on("roomCreated", onRoomCreated);
    socket.on("gameStateUpdate", onGameStateUpdate);
    socket.on("timerUpdate", onTimerUpdate);
    socket.on("pathStarted", onPathStarted);
    socket.on("pathUpdated", onPathUpdated);
    socket.on("drawingUndone", onDrawingUndone);
    socket.on("canvasCleared", onCanvasCleared);
    socket.on("drawerWord", onDrawerWord);
    socket.on("promptWordChoice", onPromptWordChoice);
    socket.on("roundEnd", onRoundEnd);
    socket.on("aiSuggestion", onAiSuggestion);
    socket.on("closeGuess", handleCloseGuess);
    socket.on("playerGuessed", handlePlayerGuessed);
    socket.on("correctGuessNotification", handleCorrectGuessNotification);
    socket.on("error", onError);

    return () => {
        socket.off("connect", onConnect);
        socket.off("roomCreated", onRoomCreated);
        socket.off("gameStateUpdate", onGameStateUpdate);
        socket.off("timerUpdate", onTimerUpdate);
        socket.off("pathStarted", onPathStarted);
        socket.off("pathUpdated", onPathUpdated);
        socket.off("drawingUndone", onDrawingUndone);
        socket.off("canvasCleared", onCanvasCleared);
        socket.off("drawerWord", onDrawerWord);
        socket.off("promptWordChoice", onPromptWordChoice);
        socket.off("roundEnd", onRoundEnd);
        socket.off("aiSuggestion", onAiSuggestion);
        socket.off("closeGuess", handleCloseGuess);
        socket.off("playerGuessed", handlePlayerGuessed);
        socket.off("correctGuessNotification", handleCorrectGuessNotification);
        socket.off("error", onError);
    };
  }, [socket, name, roomId, me, toast, handleCloseGuess, handlePlayerGuessed, handleCorrectGuessNotification, addNotification]);
  
  useEffect(() => {
    if (canvasRef.current && (canvasRef.current as any).updateBrush) {
        (canvasRef.current as any).updateBrush(currentColor, currentLineWidth);
    }
  }, [currentColor, currentLineWidth]);

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
  
  useEffect(() => {
    if (isDrawer && wordChoices.length > 0) {
        setWordChoiceCountdown(WORD_CHOICE_TIME);
        const timer = setInterval(() => {
            setWordChoiceCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }
  }, [isDrawer, wordChoices]);

  // --- Callbacks & Handlers ---

  const handleJoin = (newName: string, avatarUrl: string, joinRoomId?: string | null) => {
    setName(newName);
    if (joinRoomId) {
        setRoomId(joinRoomId);
        window.history.pushState({}, '', `/?roomId=${joinRoomId}`);
        socket?.emit("joinRoom", { name: newName, avatarUrl, roomId: joinRoomId });
    } else {
        socket?.emit("createRoom", { name: newName, avatarUrl });
    }
  };

  const handleStartGame = () => socket?.emit("startGame", { totalRounds: selectedRounds });
  
  const handleGuess = (guess: string) => {
      if (guess.trim()) {
        socket?.emit("sendMessage", guess.trim());
      }
  };

  const handleMobileGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGuess(mobileGuess);
    setMobileGuess("");
  }

  const handlePlayAgain = () => socket?.emit("playAgain");
  const handleWordChoice = (word: string) => {
    socket?.emit("wordChosen", word);
    setWordChoices([]);
  };

  const handleStartPath = useCallback((path: DrawingPath) => socket?.emit("startPath", path), [socket]);
  const handleDrawPath = useCallback((path: DrawingPath) => socket?.emit("drawPath", path), [socket]);
  const handleUndo = useCallback(() => socket?.emit("undo"), [socket]);
  const handleClear = useCallback(() => socket?.emit("clearCanvas"), [socket]);
  
  const copyInvite = () => {
    if (!roomId) return;
    const inviteLink = `${window.location.origin}/?roomId=${roomId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        toast({
            title: "Copied!",
            description: "Invite link copied to clipboard.",
        });
    });
  }

  if (!name) return <JoinScreen onJoin={handleJoin} />;
  
  if (gameState.isGameOver) {
    return <GameOverScreen players={gameState.players} ownerId={gameState.ownerId} currentSocketId={socket?.id ?? null} onPlayAgain={handlePlayAgain} />;
  }

  if (isMobileGuesser) {
    return (
      <div className="flex h-dvh flex-col bg-background p-2">
        <div className="flex items-center justify-between gap-2 py-1">
            <div className={cn("flex items-center gap-2 text-lg font-bold text-primary w-1/4 transition-colors", gameState.roundTimer <= 15 && "text-red-600 dark:text-red-500")}>
                <Clock className="w-5 h-5" />
                <span>{gameState.roundTimer}</span>
            </div>
            <WordDisplay maskedWord={gameState.currentWord} isDrawing={isDrawer} fullWord={fullWord} />
            <div className="flex items-center justify-end gap-2 w-1/4">
              <Button onClick={copyInvite} size="icon" variant="ghost" className="h-8 w-8">
                    <ClipboardCopy className="w-4 h-4" />
                    <span className="sr-only">Copy Invite Link</span>
              </Button>
            </div>
        </div>
        <div className="flex-1 relative min-h-0">
            <DrawingCanvas ref={canvasRef} onDrawStart={()=>{}} onDrawing={()=>{}} isDrawingPlayer={false} drawingHistory={gameState.drawingHistory} />
        </div>
        <div className="flex-shrink-0 py-2">
            <form onSubmit={handleMobileGuessSubmit}>
                <div className="relative">
                    <Input
                        placeholder={guessInputDisabled ? "You guessed it!" : "Type your guess..."}
                        value={mobileGuess}
                        onChange={(e) => setMobileGuess(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleMobileGuessSubmit(e);
                          }
                        }}
                        disabled={guessInputDisabled}
                    />
                    <Button type="submit" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled={guessInputDisabled}>
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </form>
        </div>
      </div>
    )
  }

  const activePlayers = gameState.players.filter(p => !p.disconnected);
  
  return (
    <>
      <Dialog open={isDrawer && wordChoices.length > 0}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a word to draw ({wordChoiceCountdown}s)</DialogTitle>
            <DialogDescription>Select one of the words below. A word will be picked if time runs out.</DialogDescription>
          </DialogHeader>
           <Progress value={(wordChoiceCountdown / WORD_CHOICE_TIME) * 100} className="h-2 mb-2" />
          <div className="grid grid-cols-2 gap-4 py-4">
            {wordChoices.map((word) => (
              <Button key={word} onClick={() => handleWordChoice(word)} variant="outline" className="h-12 text-base">{word}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      
      <main className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background">
      {!roomId || (!gameState.isRoundActive && !gameState.isGameOver) ? (
          <div className="flex h-full w-full items-center justify-center p-4">
              {gameState.currentRound === 0 ? (
                  <Card className="p-4 md:p-8 text-center m-auto w-full max-w-md">
                      <CardHeader className="p-2">
                          <CardTitle className="text-2xl mb-2">Lobby</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                           <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Invite friends with this link or room ID</p>
                              <div className="flex items-center justify-between gap-4 p-2 rounded-lg bg-muted/50">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-sm font-medium text-muted-foreground">ID:</span>
                                    <span className="text-xl font-bold tracking-widest text-primary">{roomId}</span>
                                  </div>
                                  <Button onClick={copyInvite} size="sm" variant="outline">
                                      <ClipboardCopy className="w-4 h-4 mr-2" />
                                      Copy Link
                                  </Button>
                              </div>
                          </div>
                          
                          <Separator className="my-4" />
                  
                          <div className="w-full text-left">
                              <h3 className="text-lg font-medium mb-2 text-center">{activePlayers.length} / 8 players</h3>
                              <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                  {activePlayers.map(p => (
                                      <li key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-background">
                                          <Avatar className="w-10 h-10">
                                              <AvatarImage src={p.avatarUrl} />
                                              <AvatarFallback className="text-2xl">
                                                  {p.avatarUrl.startsWith('http') ? p.name.charAt(0) : p.avatarUrl}
                                              </AvatarFallback>
                                          </Avatar>
                                          <span className="font-medium">{p.name}</span>
                                          {p.id === gameState.ownerId && <Trophy className="w-4 h-4 text-amber-500 ml-auto" title="Host"/>}
                                      </li>
                                  ))}
                              </ul>
                          </div>
                          
                          {isOwner && activePlayers.length >= 2 && (
                              <>
                                  <Separator className="my-4" />
                                  <div className="flex flex-col gap-4 items-center pt-2">
                                      <div className="flex items-center gap-2">
                                          <Label htmlFor="rounds">Rounds:</Label>
                                          <Select onValueChange={(value) => setSelectedRounds(parseInt(value, 10))} defaultValue={String(selectedRounds)}>
                                              <SelectTrigger id="rounds" className="w-24"><SelectValue placeholder="Rounds" /></SelectTrigger>
                                              <SelectContent>{ROUND_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}</SelectItem>)}</SelectContent>
                                          </Select>
                                      </div>
                                      <Button onClick={handleStartGame} size="lg" className="w-full">Start Game</Button>
                                  </div>
                              </>
                          )}
                          {isOwner && activePlayers.length < 2 && (
                              <p className="mt-4 text-sm text-muted-foreground animate-pulse">Waiting for at least one more player to join...</p>
                          )}
                          {!isOwner && (
                               <p className="mt-4 text-sm text-muted-foreground animate-pulse">Waiting for {gameState.players.find(p => p.id === gameState.ownerId)?.name || 'the host'} to start the game.</p>
                          )}
                      </CardContent>
                  </Card>
              ) : (
                  <Card className="p-8 text-center m-auto animate-pulse">
                      <CardTitle className="text-2xl mb-2">Next round is starting!</CardTitle>
                      <CardContent className="space-y-4">
                          <p className="text-lg text-muted-foreground">{isDrawer ? "You are choosing a word..." : `${gameState.players.find(p => p.id === gameState.drawerId)?.name || 'Someone'} is choosing a word...`}</p>
                      </CardContent>
                  </Card>
              )}
          </div>
      ) : (
        <>
            {/* Top Bar */}
            <div className="flex-shrink-0">
                <div className="flex items-center justify-between gap-4 p-2">
                    <div className={cn("flex items-center gap-2 text-lg font-bold text-primary w-1/4 transition-colors", gameState.roundTimer <= 15 && "text-red-600 dark:text-red-500")}>
                        <Clock className="w-5 h-5" />
                        <span>{gameState.roundTimer}</span>
                    </div>
                    <WordDisplay maskedWord={gameState.currentWord} isDrawing={isDrawer} fullWord={fullWord} />
                    <div className="flex items-center justify-end gap-2 w-1/4">
                        <span className="text-sm font-bold hidden md:inline">ID: {roomId}</span>
                        <Button onClick={copyInvite} size="sm" variant="outline">
                            <ClipboardCopy className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Copy Link</span>
                        </Button>
                    </div>
                </div>
            </div>
          
            {/* Desktop Layout */}
            <div className="flex-1 hidden md:flex flex-row gap-4 min-h-0 p-2 md:p-4">
                <div className="w-full md:w-[280px] flex-shrink-0">
                    <Scoreboard players={gameState.players} currentPlayerId={socket?.id ?? null} />
                </div>
                <div className="flex flex-col min-h-0 gap-2 flex-1">
                    <div className="relative w-full flex-1">
                        <DrawingCanvas ref={canvasRef} onDrawStart={handleStartPath} onDrawing={handleDrawPath} isDrawingPlayer={isDrawer} drawingHistory={gameState.drawingHistory}/>
                    </div>
                    {isDrawer && <Toolbar color={currentColor} setColor={setCurrentColor} lineWidth={currentLineWidth} setLineWidth={setCurrentLineWidth} onUndo={handleUndo} onClear={handleClear} disabled={!isDrawer} />}
                </div>
                <div className="w-full md:w-[320px] lg:w-[350px] flex-shrink-0">
                    <ChatBox messages={gameState.messages} onSendMessage={handleGuess} disabled={guessInputDisabled} showForm={!isDrawer} />
                </div>
            </div>

            {/* Mobile Drawer Layout */}
            <div className="flex flex-col flex-1 md:hidden min-h-0 p-2 gap-2">
                <div className="flex-1 relative min-h-0">
                     <DrawingCanvas ref={canvasRef} onDrawStart={handleStartPath} onDrawing={handleDrawPath} isDrawingPlayer={isDrawer} drawingHistory={gameState.drawingHistory}/>
                </div>
                {isDrawer && <Toolbar color={currentColor} setColor={setCurrentColor} lineWidth={currentLineWidth} setLineWidth={setCurrentLineWidth} onUndo={handleUndo} onClear={handleClear} disabled={!isDrawer} />}
            </div>
        </>
      )}
      </main>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-xs flex-col items-end gap-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={cn(
                  "pointer-events-auto w-fit max-w-full animate-in fade-in-0 slide-in-from-bottom-10 rounded-lg px-4 py-2 text-sm text-white shadow-lg",
                  notif.variant === 'success' && "bg-green-600",
                  notif.variant === 'warning' && "bg-yellow-500 text-slate-800",
                  notif.variant === 'default' && "bg-slate-800"
              )}
            >
              <div className="flex items-center gap-2">
                {notif.icon}
                <div>{notif.content}</div>
              </div>
            </div>
          ))}
        </div>

      <audio ref={notificationSoundRef} src="/notification.mp3" preload="auto" className="hidden" />
      <Toaster />
    </>
  );
}
