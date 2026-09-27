import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Bot, User, Send, X, ShieldAlert, Sparkles, Loader2, BrainCircuit } from "lucide-react";
import { askEvrenAI } from "@/lib/evren-ai.functions";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  modelUsed?: string;
  isError?: boolean;
};

export function CyberLabAI() {
  const [isOpen, setIsOpen] = useState(false);
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
    <>
      {/* Yüzen Buton */}
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl shadow-primary/20 transition-all z-50",
          isOpen ? "scale-0 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <Bot className="h-6 w-6" />
      </Button>

      {/* Chat Penceresi */}
      <div className={cn(
        "fixed bottom-6 right-6 w-[400px] h-[600px] max-h-[80vh] flex flex-col shadow-2xl transition-all duration-300 z-50 border border-primary/20 rounded-2xl overflow-hidden bg-background",
        isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-10 pointer-events-none"
      )}>
        <CardHeader className="bg-primary/10 border-b border-primary/20 flex flex-row items-center justify-between py-3 px-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-medium">CyberLab AI</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
              <div className={cn(
                "px-4 py-2 rounded-2xl text-sm",
                msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : 
                msg.isError ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm" : 
                "bg-muted rounded-tl-sm border border-border/50"
              )}>
                {msg.content}
              </div>
              {msg.modelUsed && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 ml-1">
                  <Sparkles className="h-3 w-3" />
                  {msg.modelUsed}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground self-start px-4 py-2 bg-muted/50 rounded-2xl rounded-tl-sm text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Düşünüyor...
            </div>
          )}
        </CardContent>

        <CardFooter className="p-3 border-t bg-muted/30 flex flex-col gap-2">
          <div className="flex items-center justify-between w-full px-1">
            <button 
              onClick={() => setIsDeepAnalysis(!isDeepAnalysis)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors",
                isDeepAnalysis ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              Derin Analiz (Claude Opus)
            </button>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ShieldAlert className="h-3 w-3 text-green-500" />
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
              className="flex-1 bg-background"
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardFooter>
      </div>
    </>
  );
}
