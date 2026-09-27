import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Bot, User, Send, ShieldAlert, Sparkles, Loader2, BrainCircuit } from "lucide-react";
import { askEvrenAI } from "@/lib/evren-ai.functions";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages
        .filter(m => !m.isError)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await askEvrenAI({
        data: {
          prompt: userMessage.content,
          history,
          isDeepAnalysis
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
          className="flex w-full gap-2 items-center"
        >
          <Input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Bir soru sorun..."
            className="flex-1 bg-background h-12 rounded-xl"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" className="h-12 w-12 rounded-xl" disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </div>
  );
}
