import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, Check, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

export type AIAction = {
  type: "update_calendar" | "update_notes" | "update_topic" | "other";
  description: string;
  payload: any;
};

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  action?: AIAction;
};

export type AIChatBoxProps = {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  height?: string | number;
  emptyStateMessage?: string;
  suggestedPrompts?: string[];
  onAction?: (action: AIAction, accepted: boolean) => void;
};

export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Como posso te ajudar?",
  className,
  height = "600px",
  emptyStateMessage = "Inicie uma conversa estratégica",
  suggestedPrompts,
  onAction,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const displayMessages = messages.filter((msg) => msg.role !== "system");
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;
      const userMessageReservedHeight = 56;
      const calculatedHeight =
        scrollAreaHeight - 32 - userMessageReservedHeight;
      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;
    onSendMessage(trimmedInput);
    setInput("");
    scrollToBottom();
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-card border border-border shadow-2xl rounded-md overflow-hidden",
        className,
      )}
      style={{ height }}
    >
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-8 items-center justify-center space-y-12 text-center">
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-md bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto text-primary/30">
                <Sparkles size={32} />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground opacity-60">
                {emptyStateMessage}
              </p>
            </div>

            {suggestedPrompts && suggestedPrompts.length > 0 && (
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => onSendMessage(prompt)}
                    disabled={isLoading}
                    className="px-4 py-2.5 rounded-md bg-secondary/50 border border-border/50 text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-secondary hover:border-primary/20 active:scale-95 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-8 p-6">
              {displayMessages.map((message, index) => {
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-4",
                      message.role === "user" ? "flex-row-reverse" : "flex-row",
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    <div
                      className={cn(
                        "size-8 shrink-0 rounded-md flex items-center justify-center border",
                        message.role === "user"
                          ? "bg-primary border-primary text-white"
                          : "bg-secondary/50 border-border text-primary",
                      )}
                    >
                      {message.role === "user" ? (
                        <User size={14} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                    </div>

                    <div
                      className={cn(
                        "max-w-[85%] rounded-md px-5 py-3 border transition-all",
                        message.role === "user"
                          ? "bg-secondary/30 border-border/50 text-foreground font-semibold text-sm"
                          : "bg-transparent border-transparent text-foreground/90",
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="space-y-6">
                          <div className="soe-prose prose prose-invert prose-sm max-w-none text-sm leading-relaxed">
                            <Streamdown>{message.content}</Streamdown>
                          </div>

                          {message.action && (
                            <div className="p-5 rounded-md bg-primary/5 border border-primary/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center gap-2 text-primary opacity-60">
                                <Sparkles size={14} />
                                <span className="text-[9px] font-bold uppercase tracking-widest">
                                  Ação Sugerida
                                </span>
                              </div>
                              <p className="text-xs font-bold leading-relaxed">
                                {message.action.description}
                              </p>
                              <div className="flex gap-3 pt-2">
                                <Button
                                  onClick={() =>
                                    onAction?.(message.action!, true)
                                  }
                                  className="flex-1 h-9 rounded-md text-[10px] font-bold uppercase tracking-widest"
                                >
                                  Aceitar
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    onAction?.(message.action!, false)
                                  }
                                  className="h-9 px-6 rounded-md text-[10px] font-bold uppercase tracking-widest"
                                >
                                  Recusar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-start gap-4">
                  <div className="size-8 shrink-0 rounded-md bg-secondary/50 border border-border flex items-center justify-center text-primary">
                    <Sparkles size={14} />
                  </div>
                  <div className="rounded-md bg-secondary/20 border border-border/30 px-4 py-3">
                    <Loader2 className="size-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="p-4 bg-secondary/20 border-t border-border"
      >
        <div className="relative flex items-center gap-3 bg-card border border-border rounded-md p-1.5 pl-4 focus-within:border-primary/50 transition-all shadow-sm">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none outline-none py-2 text-sm font-bold placeholder:text-muted-foreground/30 resize-none min-h-[40px] max-h-32 custom-scrollbar"
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-md bg-primary text-white flex items-center justify-center transition-all disabled:opacity-20 hover:bg-primary/90"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
