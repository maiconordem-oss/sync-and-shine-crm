import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { initials, formatDateTime } from "@/lib/format";
import { Send, MessageSquare, Trash2, AtSign } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/chat")({
  component: ChatPage,
});

interface ChatMessage {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
}

function ChatPage() {
  const { user, profile, isManagerOrAdmin } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const [{ data: msgs }, { data: profs }] = await Promise.all([
      supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200),
      supabase.from("profiles").select("id,full_name"),
    ]);
    setMessages((msgs ?? []) as ChatMessage[]);
    setProfiles((profs ?? []) as ProfileLite[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("chat_messages_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as ChatMessage).id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const profileById = (id: string) => profiles.find((p) => p.id === id);

  const send = async () => {
    if (!user || !text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("chat_messages").insert([{ author_id: user.id, content: text.trim() }]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setText("");
    textRef.current?.focus();
  };

  const deleteMsg = async (id: string) => {
    await supabase.from("chat_messages").delete().eq("id", id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
    // @ mention detection
    const val = (e.target as HTMLTextAreaElement).value;
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(" ")) setMentionSearch(after.toLowerCase());
      else setMentionSearch(null);
    } else setMentionSearch(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const val = e.target.value;
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(" ")) setMentionSearch(after.toLowerCase());
      else setMentionSearch(null);
    } else setMentionSearch(null);
  };

  const insertMention = (name: string) => {
    const lastAt = text.lastIndexOf("@");
    const newText = text.slice(0, lastAt + 1) + name + " ";
    setText(newText);
    setMentionSearch(null);
    textRef.current?.focus();
  };

  const mentionResults = mentionSearch !== null
    ? profiles.filter((p) => p.full_name?.toLowerCase().includes(mentionSearch))
    : [];

  const renderContent = (content: string) => {
    const parts = content.split(/(@\w[\w\s]*\w)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1).trim();
        const found = profiles.find((p) => p.full_name?.toLowerCase() === name.toLowerCase());
        if (found) return <span key={i} className="text-primary font-medium bg-primary/10 rounded px-0.5">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Group messages by day
  const grouped: { date: string; msgs: ChatMessage[] }[] = [];
  for (const m of messages) {
    const d = new Date(m.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const last = grouped[grouped.length - 1];
    if (last?.date === d) last.msgs.push(m);
    else grouped.push({ date: d, msgs: [m] });
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b mb-3 shrink-0">
        <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center text-primary">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Chat da equipe</h1>
          <p className="text-xs text-muted-foreground">{profiles.length} membros · Use @ para mencionar</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs">
          {messages.length} mensagens
        </Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-1 min-h-0">
        {loading && <div className="text-center text-sm text-muted-foreground py-8">Carregando...</div>}
        {!loading && messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhuma mensagem ainda. Diga olá! 👋</p>
          </div>
        )}

        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            {/* Date divider */}
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground bg-background px-2">{date}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {msgs.map((m, idx) => {
              const isOwn = m.author_id === user?.id;
              const author = profileById(m.author_id);
              const prevMsg = msgs[idx - 1];
              const showAvatar = !prevMsg || prevMsg.author_id !== m.author_id;

              return (
                <div key={m.id} className={cn("flex gap-2 group", isOwn ? "flex-row-reverse" : "", !showAvatar && "mt-0.5")}>
                  {/* Avatar */}
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-[10px]">{initials(author?.full_name)}</AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {/* Bubble */}
                  <div className={cn("max-w-[70%] space-y-0.5", isOwn && "items-end flex flex-col")}>
                    {showAvatar && (
                      <div className={cn("flex items-baseline gap-2 text-[11px]", isOwn && "flex-row-reverse")}>
                        <span className="font-medium text-xs">{isOwn ? "Você" : (author?.full_name ?? "—")}</span>
                        <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
                      </div>
                    )}
                    <div className={cn(
                      "rounded-2xl px-3 py-2 text-sm leading-relaxed relative",
                      isOwn
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm",
                    )}>
                      <span className="whitespace-pre-wrap break-words">{renderContent(m.content)}</span>

                      {/* Delete button */}
                      {(isOwn || isManagerOrAdmin) && (
                        <button
                          onClick={() => deleteMsg(m.id)}
                          className={cn(
                            "absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 bg-background border shadow-sm text-muted-foreground hover:text-destructive",
                            isOwn ? "-left-6" : "-right-6"
                          )}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 border-t pt-3 shrink-0 relative">
        {/* Mention autocomplete */}
        {mentionSearch !== null && mentionResults.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 w-56 bg-background border rounded-xl shadow-xl z-50 overflow-hidden">
            {mentionResults.slice(0, 6).map((p) => (
              <button
                key={p.id}
                onClick={() => insertMention(p.full_name ?? "")}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted text-left text-sm"
              >
                <Avatar className="h-5 w-5 shrink-0"><AvatarFallback className="text-[9px]">{initials(p.full_name)}</AvatarFallback></Avatar>
                {p.full_name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem... (Enter para enviar, Shift+Enter nova linha, @ para mencionar)"
              rows={1}
              className="resize-none text-sm pr-8 min-h-[40px] max-h-[120px]"
              style={{ height: "auto" }}
            />
            <button
              className="absolute right-2 bottom-2 text-muted-foreground hover:text-primary"
              onClick={() => { setText((t) => t + "@"); textRef.current?.focus(); }}
              type="button"
              title="Mencionar alguém"
            >
              <AtSign className="h-4 w-4" />
            </button>
          </div>
          <Button
            size="sm"
            onClick={send}
            disabled={busy || !text.trim()}
            className="h-10 px-4 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Enter para enviar · Shift+Enter para nova linha · @ para mencionar</p>
      </div>
    </div>
  );
}
