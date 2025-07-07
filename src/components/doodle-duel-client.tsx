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

// --- CONSTANTS ---
const ROUND_TIME = 90; // in seconds
const AI_CHECK_INTERVAL = 15000; // 15 seconds
const HINT_REVEAL_START_TIME = ROUND_TIME / 2;
const HINT_REVEAL_INTERVAL = 10000; // 10 seconds

const DRAWING_COLORS = [
  "#000000", "#ef4444", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#3b82f6", "#a78bfa", "#f472b6", "#ffffff",
];
const BRUSH_SIZES = [2, 5, 10, 20];

// --- MOCK DATA & HELPERS ---
const initialPlayers: Player[] = [
  { id: "1", name: "Player 1", score: 0, isDrawing: true, hasGuessed: false },
  { id: "2", name: "Player 2", score: 0, isDrawing: false, hasGuessed: false },
  { id: "3", name: "Player 3", score: 0, isDrawing: false, hasGuessed: false },
  { id: "4", name: "You", score: 0, isDrawing: false, hasGuessed: false },
];

const getMaskedWord = (word: string, revealedIndices: number[]) => {
  return word.split("").map((letter, index) => (revealedIndices.includes(index) || letter === ' ' ? letter : "_")).join(" ");
};

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
                <AvatarImage src={`https://placehold.co/40x40.png?text=${p.name.charAt(0)}`} />
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

const Timer = ({ time, maxTime }: { time: number; maxTime: number }) => (
  <div className="w-full">
    <div className="flex justify-center items-center gap-2 mb-2 text-xl font-bold text-primary">
      <Clock className="w-6 h-6" />
      <span>{time}</span>
    </div>
    <Progress value={(time / maxTime) * 100} className="h-2" />
  </div>
);

const WordDisplay = ({ word, revealedIndices, isDrawing, fullWord }: { word: string; revealedIndices: number[]; isDrawing: boolean; fullWord: string; }) => (
  <div className="text-center py-4">
    <p className="text-muted-foreground text-sm font-medium">
      {isDrawing ? "You are drawing:" : "Guess the word!"}
    </p>
    <p className="text-4xl font-bold tracking-widest font-headline text-primary transition-all duration-300">
      {isDrawing ? fullWord : getMaskedWord(word, revealedIndices)}
    </p>
  </div>
);

const DrawingCanvas = React.forwardRef<HTMLCanvasElement, { onDraw: (path: DrawingPath) => void, onUndo: (path: DrawingPath) => void, onClear: () => void, color: string, lineWidth: number, isDrawingPlayer: boolean }>(
    ({ onDraw, onUndo, onClear, color, lineWidth, isDrawingPlayer }, ref) => {
        const isDrawing = useRef(false);
        const currentPath = useRef<DrawingPoint[]>([]);

        const getCoords = (e: MouseEvent | TouchEvent): DrawingPoint | null => {
            if (!ref || typeof ref === 'function' || !ref.current) return null;
            const canvas = ref.current;
            const rect = canvas.getBoundingClientRect();
            if (e instanceof MouseEvent) {
                return { x: e.clientX - rect.left, y: e.clientY - rect.top };
            }
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
            }
            return null;
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
            if (coords) {
                currentPath.current.push(coords);
                const newPath: DrawingPath = { color, lineWidth, path: [...currentPath.current] };
                onDraw(newPath);
            }
        }, [isDrawingPlayer, color, lineWidth, onDraw]);

        const stopDrawing = useCallback(() => {
            isDrawing.current = false;
        }, []);

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
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [messages, setMessages] = useState<Message[]>([]);
  const [wordList, setWordList] = useState<string[]>([]);
  const [currentWord, setCurrentWord] = useState("");
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [timer, setTimer] = useState(ROUND_TIME);
  const [isRoundActive, setIsRoundActive] = useState(false);
  
  const [drawingHistory, setDrawingHistory] = useState<DrawingPath[]>([]);
  const [currentColor, setCurrentColor] = useState(DRAWING_COLORS[0]);
  const [currentLineWidth, setCurrentLineWidth] = useState(BRUSH_SIZES[1]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiCheckIntervalRef = useRef<NodeJS.Timeout>();
  const hintIntervalRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();

  const isDrawer = currentPlayer?.isDrawing ?? false;

  // --- Effects ---

  // Initialize: Load words and check session
  useEffect(() => {
    fetch('/words.txt')
      .then(res => res.text())
      .then(text => setWordList(text.split('\n').filter(Boolean)));
      
    const session = localStorage.getItem('doodle-duel-session');
    if (session) {
        try {
            const { id, name, score } = JSON.parse(session);
            handleJoin(name, id, score);
        } catch (e) {
            localStorage.removeItem('doodle-duel-session');
        }
    }
  }, []);

  // Redraw canvas when history changes
  useEffect(() => {
    const canvas = canvasRef.current;
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
  }, [drawingHistory]);
  
  // Game Timer and Hint Logic
  useEffect(() => {
    if (isRoundActive) {
      if (timer > 0) {
        const roundTimer = setTimeout(() => setTimer(timer - 1), 1000);
        return () => clearTimeout(roundTimer);
      } else {
        endRound(false); // Time's up
      }
    }
  }, [isRoundActive, timer]);

  // AI Drawing Analysis
  useEffect(() => {
    if (isRoundActive && !isDrawer) {
      aiCheckIntervalRef.current = setInterval(async () => {
        const historyString = JSON.stringify(drawingHistory.flatMap(p => p.path));
        if (historyString.length > 50 && currentWord) {
            try {
                const result = await analyzeDrawingHistory({
                    drawingHistory: historyString,
                    targetWord: currentWord,
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
  }, [isRoundActive, isDrawer, drawingHistory, currentWord, toast]);

  // Hint revealing logic
  useEffect(() => {
    if(isRoundActive && timer < HINT_REVEAL_START_TIME) {
        if (!hintIntervalRef.current) {
            hintIntervalRef.current = setInterval(() => {
                revealHint();
            }, HINT_REVEAL_INTERVAL)
        }
    }
    return () => clearInterval(hintIntervalRef.current);
  }, [isRoundActive, timer, currentWord]);


  // --- Callbacks & Handlers ---

  const handleJoin = (name: string, id?: string, score?: number) => {
    const newPlayerId = id || crypto.randomUUID();
    const existingPlayerIndex = players.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
    
    let player: Player;
    if (existingPlayerIndex !== -1) {
        player = players[existingPlayerIndex];
        player.id = newPlayerId; // Update ID in case of rejoin
    } else {
        player = { id: newPlayerId, name, score: score || 0, isDrawing: false, hasGuessed: false };
        setPlayers(prev => [...prev, player]);
    }
    setCurrentPlayer(player);
    localStorage.setItem('doodle-duel-session', JSON.stringify({ id: newPlayerId, name, score: player.score }));
  };

  const startRound = () => {
    // In a real app, drawer would be rotated. Here we just use the default.
    const drawer = players.find(p => p.isDrawing);
    if (!drawer || wordList.length === 0) return;

    setDrawingHistory([]);
    setRevealedIndices([]);
    setMessages([]);
    setPlayers(players.map(p => ({ ...p, hasGuessed: false })));
    setCurrentWord(wordList[Math.floor(Math.random() * wordList.length)]);
    setTimer(ROUND_TIME);
    setIsRoundActive(true);
    hintIntervalRef.current = undefined;
  };
  
  const endRound = (wordGuessed: boolean) => {
    setIsRoundActive(false);
    clearInterval(aiCheckIntervalRef.current);
    clearInterval(hintIntervalRef.current);
    
    toast({
        title: wordGuessed ? "Round Over!" : "Time's Up!",
        description: `The word was: ${currentWord}`,
        duration: 5000,
        action: <Button onClick={startRound}>Next Round</Button>
    });
  };

  const handleGuess = (guess: string) => {
    const isCorrect = guess.toLowerCase() === currentWord.toLowerCase();
    
    if (isCorrect && currentPlayer && !currentPlayer.hasGuessed) {
        const guesserPoints = Math.max(10, Math.floor(timer * 0.5));
        const drawerPoints = 20;

        setPlayers(players.map(p => {
            if (p.id === currentPlayer.id) return { ...p, score: p.score + guesserPoints, hasGuessed: true };
            if (p.isDrawing) return { ...p, score: p.score + drawerPoints };
            return p;
        }));
        setCurrentPlayer(p => p ? { ...p, score: p.score + guesserPoints, hasGuessed: true } : p);

        toast({
            title: "Correct!",
            description: `You earned ${guesserPoints} points!`,
            icon: <PartyPopper className="text-green-500" />
        });
    }

    setMessages(prev => [...prev, { playerName: currentPlayer?.name || "??", text: guess, isCorrect }]);

    if (isCorrect && players.filter(p => !p.isDrawing).every(p => p.hasGuessed || p.id === currentPlayer?.id)) {
        endRound(true);
    }
  };

  const revealHint = () => {
    if (!currentWord) return;
    const unrevealed = currentWord.split('').map((_, i) => i).filter(i => !revealedIndices.includes(i) && currentWord[i] !== ' ');
    if (unrevealed.length > 2) { // Keep at least 2 letters hidden
        const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        setRevealedIndices(prev => [...prev, randomIndex]);
    }
  };

  const handleDraw = (newPath: DrawingPath) => {
    setDrawingHistory(prev => [...prev.slice(0, prev.length -1), newPath]);
  };
  
  const handleStartDraw = () => {
     setDrawingHistory(prev => [...prev, {color: currentColor, lineWidth: currentLineWidth, path: []}]);
  };

  const handleUndo = () => {
    setDrawingHistory(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDrawingHistory([]);
  };

  if (!currentPlayer) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <>
      <main className="flex flex-col md:flex-row h-screen bg-background p-4 gap-4 overflow-hidden">
        <div className="w-full md:w-1/4 flex flex-col gap-4">
          <Scoreboard players={players} currentPlayerId={currentPlayer.id} />
          <ChatBox messages={messages} onSendMessage={handleGuess} disabled={isDrawer} />
        </div>
        <div className="w-full md:w-3/4 flex flex-col items-center justify-center gap-2">
            {!isRoundActive ? (
                <Card className="p-8 text-center">
                    <CardTitle className="text-2xl mb-4">Waiting for next round...</CardTitle>
                    <Button onClick={startRound} size="lg">Start Game</Button>
                </Card>
            ) : (
                <>
                    <div className="w-full max-w-2xl">
                        <Timer time={timer} maxTime={ROUND_TIME} />
                        <WordDisplay word={currentWord} revealedIndices={revealedIndices} isDrawing={isDrawer} fullWord={currentWord} />
                    </div>
                    <DrawingCanvas ref={canvasRef} onDraw={handleDraw} onUndo={handleUndo} onClear={handleClear} color={currentColor} lineWidth={currentLineWidth} isDrawingPlayer={isDrawer} />
                    {isDrawer && <Toolbar color={currentColor} setColor={setCurrentColor} lineWidth={currentLineWidth} setLineWidth={setCurrentLineWidth} onUndo={handleUndo} onClear={handleClear} disabled={!isDrawer} />}
                </>
            )}
        </div>
      </main>
      <Toaster />
    </>
  );
}
