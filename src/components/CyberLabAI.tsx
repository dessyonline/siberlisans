import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Bot, User, Send, ShieldAlert, Sparkles, Loader2, BrainCircuit, ImagePlus, X, AudioLines } from "lucide-react";
import { askEvrenAI } from "@/lib/evren-ai.functions";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  image?: string;
  audio?: string;
  modelUsed?: string;
  isError?: boolean;
};

export function CyberLabAI() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Merhaba! Ben CyberLab AI Asistanı. Siber güvenlik, kod analizi veya platform ile ilgili konularda sana nasıl yardımcı olabilirim?" }
  ]);
  const [input, setInput] = useState("");
  const [isDeepAnalysis, setIsDeepAnalysis] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAudio(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !image && !audio) || isLoading) return;

    const userMessage: Message = { role: "user", content: input, image: image || undefined, audio: audio || undefined };
    setMessages(prev => [...prev, userMessage]);
    const currentImage = image;
    const currentAudio = audio;
    setInput("");
    setImage(null);
    setAudio(null);
    setIsLoading(true);

    try {
      const history = messages
        .filter(m => !m.isError)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await askEvrenAI({
        data: {
          prompt: userMessage.content,
          history,
          isDeepAnalysis,
          image: currentImage || undefined,
          audio: currentAudio || undefined
        }
      });

      if (res.success) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: res.reply,
          modelUsed: res.modelUsed
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: res.error || "Beklenmeyen bir hata oluştu.",
          isError: true
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sunucu bağlantı hatası.",
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col border border-border/70 rounded-2xl overflow-hidden bg-card/60 backdrop-blur-xl shadow-sm min-h-[600px] h-full">
      <CardHeader className="bg-primary/10 border-b border-primary/20 flex flex-row items-center py-4 px-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold">CyberLab AI</CardTitle>
            <p className="text-xs text-muted-foreground">Siber Güvenlik & Kod Analizi Asistanı</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 scrollbar-thin scrollbar-thumb-primary/20">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
            <div className={cn(
              "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
              msg.role === "user" 
                ? "bg-primary text-primary-foreground rounded-tr-sm" 
                : msg.isError 
                  ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm"
                  : "bg-card border border-border/50 text-foreground rounded-tl-sm"
            )}>
              {msg.image && (
                <div className="mb-2">
                  <img src={msg.image} alt="Uploaded" className="max-w-[200px] rounded-md border border-border" />
                </div>
              )}
              {msg.audio && (
                <div className="mb-2">
                  <audio src={msg.audio} controls className="max-w-[200px] h-8" />
                </div>
              )}
              {msg.content}
            </div>
            {msg.modelUsed && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5 ml-1">
                <Sparkles className="h-3 w-3" />
                {msg.modelUsed}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground self-start px-4 py-2 bg-muted/50 rounded-2xl rounded-tl-sm text-sm border border-border/50">
            <Loader2 className="h-4 w-4 animate-spin" />
            Düşünüyor...
          </div>
        )}
      </CardContent>

      <CardFooter className="p-4 border-t bg-card/50 flex flex-col gap-3">
        <div className="flex items-center justify-between w-full px-1">
          <button 
            onClick={() => setIsDeepAnalysis(!isDeepAnalysis)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all border",
              isDeepAnalysis 
                ? "bg-primary/10 text-primary border-primary/30 font-medium" 
                : "text-muted-foreground hover:bg-muted border-transparent hover:border-border/50"
            )}
          >
            <BrainCircuit className={cn("h-4 w-4", isDeepAnalysis && "animate-pulse")} />
            Derin Analiz (Claude Opus)
          </button>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 font-mono bg-background/50 px-2 py-1 rounded-md border border-border/30">
            <ShieldAlert className="h-3 w-3 text-emerald-500" />
            Qwen Guard Aktif
          </div>
        </div>
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
          className="flex flex-col w-full gap-2"
        >
          {image && (
            <div className="relative inline-block w-max">
              <img src={image} alt="Preview" className="h-20 w-auto rounded-md border border-border object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex w-full gap-2 items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-background border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Görsel Yükle"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
            />
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="p-3 bg-background border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Ses Yükle"
            >
              <AudioLines className="h-5 w-5" />
            </button>
            <input 
              type="file" 
              accept="audio/*" 
              className="hidden" 
              ref={audioInputRef} 
              onChange={handleAudioUpload} 
            />
            <Input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bir soru sorun veya görsel yükleyin..."
              className="flex-1 bg-background h-12 rounded-xl"
              disabled={isLoading}
            />
          <Button type="submit" size="icon" className="h-12 w-12 rounded-xl" disabled={(!input.trim() && !image && !audio) || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
          </div>
        </form>
      </CardFooter>
    </div>
  );
}
