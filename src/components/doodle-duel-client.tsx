
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <Card className="flex-shrink-0">
             <CardContent className="p-3 flex items-center justify-between">
                <div className="text-sm">
                    <span className="text-muted-foreground">Room </span>
                    <span className="font-bold text-primary">{roomId}</span>
                </div>
                <Button onClick={copyToClipboard} size="sm" variant="outline">
                    <ClipboardCopy className="w-4 h-4 mr-2" />
                    Copy Invite
                </Button>
            </CardContent>
        </Card>
    );
};


const Scoreboard = ({ players, currentPlayerId }: { players: Player[]; currentPlayerId: string | null; }) => (
  <Card className="h-full flex flex-col min-h-0">
    <CardHeader className="p-3 md:p-6">
      <CardTitle className="flex items-center gap-2 text-base md:text-2xl">
        <Users className="text-primary" /> Scoreboard
      </CardTitle>
    </CardHeader>
    <CardContent className="flex-grow overflow-y-auto pr-2 space-y-2">
      <ul className="space-y-3">
        {players.sort((a, b) => b.score - a.score).map((p) => (
          <li key={p.id || p.name} className={cn(
              "flex items-center justify-between p-2 rounded-lg transition-all", 
              p.id === currentPlayerId && "bg-accent/50",
              p.disconnected && "opacity-50"
            )}>
            <div className="flex items-center gap-3">
              <Avatar className="w-8 h-8 md:w-10 md:h-10">
                <AvatarImage src={p.avatarUrl} />
                <AvatarFallback className="text-xl md:text-2xl">
                    {p.avatarUrl.startsWith('http') ? p.name.charAt(0) : p.avatarUrl}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium text-sm md:text-base">{p.name}</span>
                {p.disconnected && <span className="text-xs text-muted-foreground">(disconnected)</span>}
              </div>
              {p.isDrawing && <Pencil className="w-4 h-4 text-primary" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base md:text-lg text-primary">{p.score}</span>
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
    <div className="flex justify-center items-center gap-2 mb-1 text-lg font-bold text-primary">
      <Clock className="w-5 h-5" />
      <span>{time}</span>
    </div>
    <Progress value={(time / ROUND_TIME) * 100} className="h-2" />
  </div>
);

const WordDisplay = ({ maskedWord, isDrawing, fullWord }: { maskedWord: string; isDrawing: boolean; fullWord: string; }) => {
    const [isWordVisible, setIsWordVisible] = useState(true);

    useEffect(() => {
        if (isDrawing && fullWord) {
            setIsWordVisible(true);
        }
    }, [fullWord, isDrawing]);
    
    return (
      <div className="text-center py-1">
        <p className="text-muted-foreground text-xs font-medium">
          {isDrawing ? "You are drawing:" : "Guess the word!"}
        </p>
        <div className="flex items-center justify-center gap-2">
            <p className="text-lg md:text-2xl font-bold tracking-widest font-headline text-primary transition-all duration-300">
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

        useEffect(() => {
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

            return { 
                x: clientX - rect.left, 
                y: clientY - rect.top
            };
        };
        
        const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
            if (!isDrawingPlayer) return;
            e.preventDefault();
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
            e.preventDefault();
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
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={cn("bg-white rounded-lg shadow-inner w-full h-full", isDrawingPlayer ? "cursor-crosshair" : "cursor-not-allowed")}
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
        <Card className="flex-grow flex flex-col min-h-0 h-full">
            <CardHeader className="p-3 md:p-6"><CardTitle className="text-base md:text-2xl">Chat & Guesses</CardTitle></CardHeader>
            <CardContent className="flex-grow overflow-y-auto pr-2 space-y-2">
                {messages.map((msg, i) => (
                    <div key={i} className={cn("p-2 rounded-lg text-sm md:text-base", msg.isCorrect ? "bg-green-100 dark:bg-green-900" : "bg-muted/50")}>
                        {msg.isCorrect ? (
                             <span className="text-green-600 dark:text-green-400 font-medium">{msg.text}</span>
                        ) : (
                           <span><span className="font-bold text-primary">{msg.playerName}: </span> {msg.text}</span>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </CardContent>
            <form onSubmit={handleSubmit} className="p-2 md:p-4 border-t">
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
  
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiCheckIntervalRef = useRef<NodeJS.Timeout>();
  const tapCount = useRef(0);
  const tapTimer = useRef<NodeJS.Timeout | null>(null);
  const notificationSoundRef = useRef<HTMLAudioElement>(null);

  const { toast } = useToast();

  const me = gameState.players.find(p => p.id === socket?.id);
  const isOwner = me?.id === gameState.ownerId;
  const isDrawer = me?.isDrawing ?? false;

  // --- Effects ---

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    socket.on("connect", () => console.log("Connected to server!"));
    socket.on("roomCreated", (newRoomId: string) => {
        setRoomId(newRoomId);
        window.history.pushState({}, '', `/?roomId=${newRoomId}`);
        toast({ title: "Room Created!", description: `You are in room ${newRoomId}. Share the link to invite others!` });
    });
    socket.on("gameStateUpdate", (newGameState: GameState) => {
        setGameState(newGameState);
        if (!newGameState.isRoundActive) {
             setWordChoices([]);
             setFullWord("");
        }
    });
    socket.on("timerUpdate", (time: number) => setGameState(prev => ({...prev, roundTimer: time})));
    socket.on("pathStarted", (path: DrawingPath) => setGameState(prev => ({...prev, drawingHistory: [...prev.drawingHistory, path]})));
    socket.on("pathUpdated", (path: DrawingPath) => {
        setGameState(prev => {
            const newHistory = [...prev.drawingHistory];
            if (newHistory.length > 0) {
              newHistory[newHistory.length - 1] = path;
            }
            return {...prev, drawingHistory: newHistory};
        });
    });
    socket.on("drawingUndone", () => setGameState(prev => ({ ...prev, drawingHistory: prev.drawingHistory.slice(0, -1) })));
    socket.on("canvasCleared", () => setGameState(prev => ({...prev, drawingHistory: []})));
    socket.on("drawerWord", (word: string) => setFullWord(word));
    socket.on("promptWordChoice", (choices: string[]) => setWordChoices(choices));
    socket.on("roundEnd", ({ word }: { word: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        toast({
            title: player?.hasGuessed ? "Round Over!" : "Time's Up!",
            description: `The word was: ${word}`,
            duration: 5000,
            icon: player?.hasGuessed ? <PartyPopper className="text-green-500" /> : <Clock />,
        });
    });
    socket.on("aiSuggestion", (result: AnalyzeDrawingHistoryOutput) => {
        notificationSoundRef.current?.play().catch(e => console.error("Error playing sound:", e));
        toast({
            title: "AI Suggestion",
            description: (<div className="flex items-center gap-2"><Vote /><div><p>{result.reason}</p><Button size="sm" className="mt-2">Vote to Skip</Button></div></div>),
            duration: 10000,
        });
    });
    socket.on("closeGuess", (message: string) => {
        notificationSoundRef.current?.play().catch(e => console.error("Error playing sound:", e));
        toast({
            title: "Hint",
            description: (<div className="flex items-center gap-2"><Sparkles className="text-yellow-400" /><span>{message}</span></div>),
            duration: 3000,
        });
    });
    socket.on("error", (message: string) => {
        toast({ title: "Error", description: message, variant: "destructive" });
        if (message.includes("Room not found") || message.includes("active in this room")) {
            setTimeout(() => {
                window.history.pushState({}, '', '/');
                setName(null);
                setRoomId(null);
            }, 2000);
        }
    });

    return () => {
        socket.off("connect");
        socket.off("roomCreated");
        socket.off("gameStateUpdate");
        socket.off("timerUpdate");
        socket.off("pathStarted");
        socket.off("pathUpdated");
        socket.off("drawingUndone");
        socket.off("canvasCleared");
        socket.off("drawerWord");
        socket.off("promptWordChoice");
        socket.off("roundEnd");
        socket.off("aiSuggestion");
        socket.off("closeGuess");
        socket.off("error");
    };
  }, [socket, toast, gameState.players]);
  
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
  const handleGuess = (guess: string) => socket?.emit("sendMessage", guess);
  const handlePlayAgain = () => socket?.emit("playAgain");
  const handleWordChoice = (word: string) => {
    socket?.emit("wordChosen", word);
    setWordChoices([]);
  };

  const handleStartPath = useCallback((path: DrawingPath) => socket?.emit("startPath", path), [socket]);
  const handleDrawPath = useCallback((path: DrawingPath) => socket?.emit("drawPath", path), [socket]);
  const handleUndo = useCallback(() => socket?.emit("undo"), [socket]);
  const handleClear = useCallback(() => socket?.emit("clearCanvas"), [socket]);
  const toggleFullscreen = () => setIsCanvasFullscreen(prev => !prev);
  
  const handleCanvasAreaClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);

    if (tapCount.current === 3) {
      toggleFullscreen();
      tapCount.current = 0;
    } else {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
      }, 400);
    }
  };

  if (!name) return <JoinScreen onJoin={handleJoin} />;
  if (gameState.isGameOver) {
    return <GameOverScreen players={gameState.players} ownerId={gameState.ownerId} currentSocketId={socket?.id ?? null} onPlayAgain={handlePlayAgain} />;
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

      <main className={cn(
          "flex flex-col md:flex-row h-dvh max-h-dvh overflow-hidden bg-background p-2 md:p-4 gap-4",
          isCanvasFullscreen && "fixed inset-0 z-50 p-4"
        )}>
        <div ref={canvasAreaRef} onClick={handleCanvasAreaClick} className={cn(
            "flex flex-col h-[70%] md:h-full md:flex-1 min-h-0 items-center justify-center gap-2", 
            isDrawer && "touch-none"
        )}>
            {isCanvasFullscreen && (
              <Button onClick={toggleFullscreen} variant="ghost" size="icon" className="absolute top-4 right-4 z-50 bg-background/50 hover:bg-background">
                <X />
              </Button>
            )}
            {!roomId || (!gameState.isRoundActive && !gameState.isGameOver) ? (
                <div className="w-full h-full flex items-center justify-center">
                    {gameState.currentRound === 0 ? (
                        <Card className="p-8 text-center m-auto">
                            <CardTitle className="text-2xl mb-2">Lobby</CardTitle>
                            <CardContent className="space-y-4">
                                <p className="text-muted-foreground">{activePlayers.length} / 8 players</p>
                                {isOwner && activePlayers.length >= 2 && (
                                    <div className="flex flex-col gap-4 items-center">
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="rounds">Rounds:</Label>
                                            <Select onValueChange={(value) => setSelectedRounds(parseInt(value, 10))} defaultValue={String(selectedRounds)}>
                                                <SelectTrigger id="rounds" className="w-24"><SelectValue placeholder="Rounds" /></SelectTrigger>
                                                <SelectContent>{ROUND_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <Button onClick={handleStartGame} size="lg">Start Game</Button>
                                    </div>
                                )}
                                {isOwner && activePlayers.length < 2 && <p className="mt-4 text-sm text-muted-foreground">You need at least 2 players to start.</p>}
                                {!isOwner && <p className="mt-4 text-sm text-muted-foreground">Waiting for {gameState.players.find(p => p.id === gameState.ownerId)?.name || 'the host'} to start the game.</p>}
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
                    <div className="w-full max-w-2xl flex-shrink-0">
                        {gameState.currentRound > 0 && <div className="text-center text-xs font-semibold text-muted-foreground">{`Round ${gameState.currentRound} / ${gameState.gameSettings.totalRounds}`}</div>}
                        <Timer time={gameState.roundTimer} />
                        <WordDisplay maskedWord={gameState.currentWord} isDrawing={isDrawer} fullWord={fullWord} />
                    </div>
                    <div className="relative w-full flex-1 flex items-center justify-center min-h-0">
                      <div className="relative aspect-[4/3] w-full h-full max-w-full max-h-full">
                        <DrawingCanvas ref={canvasRef} onDrawStart={handleStartPath} onDrawing={handleDrawPath} isDrawingPlayer={isDrawer} drawingHistory={gameState.drawingHistory}/>
                      </div>
                    </div>
                    {isDrawer && <Toolbar color={currentColor} setColor={setCurrentColor} lineWidth={currentLineWidth} setLineWidth={setCurrentLineWidth} onUndo={handleUndo} onClear={handleClear} disabled={!isDrawer} />}
                </>
            )}
        </div>
        <div className={cn("w-full md:w-[320px] lg:w-[350px] flex flex-col gap-4 min-h-0 h-[30%] md:h-full", isCanvasFullscreen ? "hidden" : "flex")}>
          <RoomInfo roomId={roomId} toast={toast} />
          
          <div className="hidden md:flex flex-col gap-4 flex-1 min-h-0">
            <Scoreboard players={gameState.players} currentPlayerId={socket?.id ?? null} />
            <ChatBox messages={gameState.messages} onSendMessage={handleGuess} disabled={isDrawer || (me?.hasGuessed ?? false) || me?.disconnected === true} />
          </div>

          <div className="h-full md:hidden min-h-0">
             <Tabs defaultValue="chat" className="flex flex-col h-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="scores">Scores</TabsTrigger>
                </TabsList>
                <TabsContent value="chat" className="mt-2 flex-1 min-h-0">
                  <ChatBox messages={gameState.messages} onSendMessage={handleGuess} disabled={isDrawer || (me?.hasGuessed ?? false) || me?.disconnected === true} />
                </TabsContent>
                <TabsContent value="scores" className="mt-2 flex-1 min-h-0">
                  <Scoreboard players={gameState.players} currentPlayerId={socket?.id ?? null} />
                </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      <audio ref={notificationSoundRef} src="/notification.mp3" preload="auto" className="hidden" />
      <Toaster />
    </>
  );
}
