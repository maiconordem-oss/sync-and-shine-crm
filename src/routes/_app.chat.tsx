import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { initials, formatDateTime } from "@/lib/format";
import { useSound } from "@/lib/use-sound";
import { Send, MessageSquare, Trash2, AtSign, Bell, Hash, Zap, Search, Paperclip, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AudioRecorder } from "@/components/chat/audio-recorder";
import { MessageAttachment, type AttachmentMeta } from "@/components/chat/message-attachment";

const chatSearchSchema = z.object({
  with: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_app/chat")({
  validateSearch: chatSearchSchema,
  component: ChatPage,
});

interface ChatMessage {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}
interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  kind: "text" | "nudge" | "attachment";
  created_at: string;
  read_at: string | null;
  attachment_url: string | null;
  attachment_type: "image" | "audio" | "video" | "file" | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
}
interface ProfileLite {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}
interface PresenceRow {
  user_id: string;
  status: "online" | "away" | "offline";
  last_seen_at: string;
}

type ActiveConv = { kind: "room" } | { kind: "dm"; userId: string };

function ChatPage() {
  const { user, isManagerOrAdmin } = useAuth();
  const search = Route.useSearch();
  const { play } = useSound();
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceRow>>({});
  const [roomMsgs, setRoomMsgs] = useState<ChatMessage[]>([]);
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [active, setActive] = useState<ActiveConv>(
    search.with ? { kind: "dm", userId: search.with } : { kind: "room" }
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [typingPeers, setTypingPeers] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const nudgeCooldownRef = useRef<number>(0);

  // Reage a mudanças no ?with=
  useEffect(() => {
    if (search.with) setActive({ kind: "dm", userId: search.with });
  }, [search.with]);

  // Initial load
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [{ data: profs }, { data: rmsgs }, { data: dmsgs }, { data: pres }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,avatar_url"),
        supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200),
        supabase.from("direct_messages").select("*")
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order("created_at", { ascending: true }).limit(500),
        supabase.from("user_presence").select("*"),
      ]);
      setProfiles((profs ?? []) as ProfileLite[]);
      setRoomMsgs((rmsgs ?? []) as ChatMessage[]);
      setDms((dmsgs ?? []) as DirectMessage[]);
      const pmap: Record<string, PresenceRow> = {};
      ((pres ?? []) as PresenceRow[]).forEach((p) => { pmap[p.user_id] = p; });
      setPresence(pmap);
    })();
  }, [user]);

  // Realtime: room messages
  useEffect(() => {
    const channel = supabase
      .channel("chat_room_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        setRoomMsgs((prev) => [...prev, payload.new as ChatMessage]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        setRoomMsgs((prev) => prev.filter((m) => m.id !== (payload.old as ChatMessage).id));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  // Realtime: DMs locais (apenas estado da página; sons/toasts/tremida são globais)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dm_local_rt_" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const m = payload.new as DirectMessage;
        if (m.sender_id !== user.id && m.recipient_id !== user.id) return;
        setDms((prev) => prev.find((x) => x.id === m.id) ? prev : [...prev, m]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages" }, (payload) => {
        const m = payload.new as DirectMessage;
        setDms((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages" }, (payload) => {
        const m = payload.old as DirectMessage;
        setDms((prev) => prev.filter((x) => x.id !== m.id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
        const row = (payload.new ?? payload.old) as PresenceRow;
        if (!row) return;
        setPresence((prev) => ({ ...prev, [row.user_id]: row }));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { from: string; to: string };
        if (p.to !== user.id) return;
        setTypingPeers((prev) => ({ ...prev, [p.from]: Date.now() }));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  // Clean stale typing indicators
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setTypingPeers((prev) => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (now - v < 3000) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const visibleMsgs = useMemo(() => {
    if (active.kind === "room") return { kind: "room" as const, msgs: roomMsgs };
    const peer = active.userId;
    const msgs = dms.filter((m) =>
      (m.sender_id === user?.id && m.recipient_id === peer) ||
      (m.sender_id === peer && m.recipient_id === user?.id)
    );
    return { kind: "dm" as const, msgs, peer };
  }, [active, roomMsgs, dms, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMsgs]);

  // Marca DMs como lidas ao abrir conversa
  useEffect(() => {
    if (!user || active.kind !== "dm") return;
    const peer = active.userId;
    const unread = dms.filter((m) => m.recipient_id === user.id && m.sender_id === peer && !m.read_at);
    if (unread.length === 0) return;
    const ids = unread.map((m) => m.id);
    void supabase.from("direct_messages").update({ read_at: new Date().toISOString() }).in("id", ids);
  }, [active, dms, user]);

  const profileById = (id: string) => profiles.find((p) => p.id === id);

  const unreadByPeer = useMemo(() => {
    const map: Record<string, number> = {};
    if (!user) return map;
    for (const m of dms) {
      if (m.recipient_id === user.id && !m.read_at) {
        map[m.sender_id] = (map[m.sender_id] ?? 0) + 1;
      }
    }
    return map;
  }, [dms, user]);

  const lastByPeer = useMemo(() => {
    const map: Record<string, DirectMessage> = {};
    if (!user) return map;
    for (const m of dms) {
      const peer = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      const cur = map[peer];
      if (!cur || cur.created_at < m.created_at) map[peer] = m;
    }
    return map;
  }, [dms, user]);

  const contacts = useMemo(() => {
    const list = profiles
      .filter((p) => p.id !== user?.id)
      .filter((p) => !filter || (p.full_name ?? "").toLowerCase().includes(filter.toLowerCase()));
    return list.sort((a, b) => {
      const sa = presence[a.id]?.status ?? "offline";
      const sb = presence[b.id]?.status ?? "offline";
      const rank = (s: string) => (s === "online" ? 0 : s === "away" ? 1 : 2);
      const r = rank(sa) - rank(sb);
      if (r !== 0) return r;
      const ub = (unreadByPeer[b.id] ?? 0) - (unreadByPeer[a.id] ?? 0);
      if (ub !== 0) return ub;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
  }, [profiles, presence, unreadByPeer, filter, user]);

  const send = async () => {
    if (!user || !text.trim()) return;
    setBusy(true);
    if (active.kind === "room") {
      const { error } = await supabase.from("chat_messages").insert([{ author_id: user.id, content: text.trim() }]);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("direct_messages").insert([{
        sender_id: user.id, recipient_id: active.userId, content: text.trim(), kind: "text",
      }]);
      if (error) toast.error(error.message);
      else play("dm_sent");
    }
    setBusy(false);
    setText("");
    textRef.current?.focus();
  };

  const sendNudge = async () => {
    if (!user || active.kind !== "dm") return;
    const now = Date.now();
    if (now - nudgeCooldownRef.current < 10_000) {
      toast.info("Aguarde alguns segundos antes de chamar atenção de novo.");
      return;
    }
    nudgeCooldownRef.current = now;
    const { error } = await supabase.from("direct_messages").insert([{
      sender_id: user.id, recipient_id: active.userId, content: "chamou sua atenção!", kind: "nudge",
    }]);
    if (error) toast.error(error.message);
    else {
      play("nudge");
      document.body.classList.add("nudge-shake");
      window.setTimeout(() => document.body.classList.remove("nudge-shake"), 850);
    }
  };

  const sendAttachment = async (file: File | Blob, name: string, type: "image" | "audio" | "video" | "file") => {
    if (!user || active.kind !== "dm") {
      toast.info("Anexos só podem ser enviados em conversas individuais.");
      return;
    }
    const MAX = 20 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error("Arquivo muito grande (máx. 20 MB).");
      return;
    }
    setUploading(true);
    try {
      const ext = name.includes(".") ? name.split(".").pop() : (type === "audio" ? "webm" : "bin");
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const path = `${user.id}/${active.userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`.replace(/\.+$/, "") + (ext && !safeName.endsWith("." + ext) ? `.${ext}` : "");
      const mime = (file as File).type || (type === "audio" ? "audio/webm" : "application/octet-stream");
      const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error } = await supabase.from("direct_messages").insert([{
        sender_id: user.id,
        recipient_id: active.userId,
        content: "",
        kind: "attachment",
        attachment_url: path,
        attachment_type: type,
        attachment_name: name,
        attachment_size: file.size,
        attachment_mime: mime,
      }]);
      if (error) throw error;
      play("dm_sent");
    } catch (e) {
      toast.error("Falha ao enviar anexo: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>, asImage: boolean) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    let type: "image" | "audio" | "video" | "file" = "file";
    if (asImage || f.type.startsWith("image/")) type = "image";
    else if (f.type.startsWith("audio/")) type = "audio";
    else if (f.type.startsWith("video/")) type = "video";
    void sendAttachment(f, f.name, type);
  };

  const deleteRoomMsg = async (id: string) => {
    await supabase.from("chat_messages").delete().eq("id", id);
  };
  const deleteDM = async (id: string) => {
    await supabase.from("direct_messages").delete().eq("id", id);
  };

  // Typing broadcast (DM only)
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("typing_bcast_" + user.id, { config: { broadcast: { self: false } } });
    ch.subscribe();
    typingChannelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  const lastTypingSentRef = useRef(0);
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (active.kind === "dm" && user) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1200) {
        lastTypingSentRef.current = now;
        void typingChannelRef.current?.send({
          type: "broadcast", event: "typing",
          payload: { from: user.id, to: active.userId },
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const statusDot = (status?: string) => {
    const color = status === "online" ? "bg-emerald-500" : status === "away" ? "bg-amber-400" : "bg-muted-foreground/40";
    return <span className={cn("inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background", color)} />;
  };
  const statusLabel = (status?: string) =>
    status === "online" ? "Online" : status === "away" ? "Ausente" : "Offline";

  const activePeer = active.kind === "dm" ? profileById(active.userId) : null;
  const activePeerTyping = active.kind === "dm" && typingPeers[active.userId];

  return (
    <div className="flex h-full max-h-[calc(100vh-120px)] gap-3">
      {/* Sidebar: contacts */}
      <div className="w-64 shrink-0 flex flex-col border rounded-lg bg-card overflow-hidden">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Conversas</h2>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar contato..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Room */}
          <button
            onClick={() => setActive({ kind: "room" })}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/60 text-left border-b",
              active.kind === "room" && "bg-muted"
            )}
          >
            <div className="h-8 w-8 rounded-md bg-primary/10 grid place-items-center text-primary shrink-0">
              <Hash className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">Sala geral</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {roomMsgs.length > 0
                  ? `${profileById(roomMsgs[roomMsgs.length - 1].author_id)?.full_name ?? "—"}: ${roomMsgs[roomMsgs.length - 1].content}`
                  : "Sem mensagens"}
              </div>
            </div>
          </button>

          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Contatos · {contacts.filter((c) => presence[c.id]?.status === "online").length} online
          </div>

          {contacts.map((c) => {
            const st = presence[c.id]?.status;
            const isActive = active.kind === "dm" && active.userId === c.id;
            const unread = unreadByPeer[c.id] ?? 0;
            const last = lastByPeer[c.id];
            const typing = typingPeers[c.id];
            return (
              <button
                key={c.id}
                onClick={() => setActive({ kind: "dm", userId: c.id })}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/60 text-left",
                  isActive && "bg-muted"
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-8 w-8">
                    {c.avatar_url && <img src={c.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />}
                    <AvatarFallback className="text-[10px]">{initials(c.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5">{statusDot(st)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className={cn("text-sm truncate", unread > 0 && "font-semibold")}>{c.full_name ?? "—"}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {typing
                      ? <span className="italic text-primary">digitando...</span>
                      : last
                        ? (last.kind === "nudge"
                            ? "⚡ chamou atenção"
                            : last.kind === "attachment"
                              ? `📎 ${last.attachment_type === "image" ? "imagem" : last.attachment_type === "audio" ? "áudio" : last.attachment_type === "video" ? "vídeo" : "arquivo"}`
                              : last.content)
                        : statusLabel(st)}
                  </div>
                </div>
                {unread > 0 && (
                  <Badge className="h-5 min-w-5 px-1.5 text-[10px] rounded-full">{unread}</Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 flex flex-col border rounded-lg bg-card min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
          {active.kind === "room" ? (
            <>
              <div className="h-9 w-9 rounded-md bg-primary/10 grid place-items-center text-primary">
                <Hash className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold">Sala geral</h1>
                <p className="text-[11px] text-muted-foreground">{profiles.length} membros</p>
              </div>
            </>
          ) : activePeer ? (
            <>
              <div className="relative">
                <Avatar className="h-9 w-9">
                  {activePeer.avatar_url && <img src={activePeer.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />}
                  <AvatarFallback>{initials(activePeer.full_name)}</AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5">{statusDot(presence[activePeer.id]?.status)}</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold">{activePeer.full_name}</h1>
                <p className="text-[11px] text-muted-foreground">{statusLabel(presence[activePeer.id]?.status)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-1.5"
                onClick={() => void sendNudge()}
                title="Chamar atenção (treme a tela do contato)"
              >
                <Zap className="h-4 w-4 text-amber-500" />
                Chamar atenção
              </Button>
            </>
          ) : null}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-0">
          {visibleMsgs.kind === "room" ? (
            <RoomMessages msgs={visibleMsgs.msgs} userId={user?.id} profileById={profileById} isManagerOrAdmin={isManagerOrAdmin} onDelete={(id) => void deleteRoomMsg(id)} />
          ) : (
            <DMMessages msgs={visibleMsgs.msgs} userId={user?.id} peer={activePeer ?? null} onDelete={(id) => void deleteDM(id)} />
          )}
          {activePeerTyping && (
            <div className="text-xs text-muted-foreground italic pl-12 pt-1 animate-pulse">
              {activePeer?.full_name} está digitando...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t p-3 shrink-0">
          {uploading && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="animate-pulse">Enviando anexo...</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setUploading(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFilePick(e, false)}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFilePick(e, true)}
            />
            {active.kind === "dm" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  title="Anexar arquivo"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                  title="Enviar foto"
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <AudioRecorder
                  disabled={uploading}
                  onRecorded={(blob, dur) => void sendAttachment(blob, `audio_${Math.round(dur / 1000)}s.webm`, "audio")}
                />
              </>
            )}
            <Textarea
              ref={textRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={active.kind === "room" ? "Mensagem na sala..." : `Mensagem para ${activePeer?.full_name ?? ""}...`}
              rows={1}
              className="resize-none text-sm min-h-[40px] max-h-[120px] flex-1"
            />
            {active.kind === "dm" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => void sendNudge()}
                title="Chamar atenção"
              >
                <Bell className="h-4 w-4 text-amber-500" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void send()}
              disabled={busy || !text.trim()}
              className="h-10 px-4 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter para enviar · Shift+Enter nova linha
            {active.kind === "dm" && " · 📎 anexo · 🖼️ foto · 🎤 áudio · 🔔 chama atenção"}
          </p>
        </div>
      </div>
    </div>
  );
}

function RoomMessages({
  msgs, userId, profileById, isManagerOrAdmin, onDelete,
}: {
  msgs: ChatMessage[];
  userId: string | undefined;
  profileById: (id: string) => ProfileLite | undefined;
  isManagerOrAdmin: boolean;
  onDelete: (id: string) => void;
}) {
  if (msgs.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma mensagem ainda. Diga olá! 👋</div>;
  }
  return (
    <>
      {msgs.map((m, idx) => {
        const isOwn = m.author_id === userId;
        const author = profileById(m.author_id);
        const prev = msgs[idx - 1];
        const showAvatar = !prev || prev.author_id !== m.author_id;
        return (
          <div key={m.id} className={cn("flex gap-2 group", isOwn && "flex-row-reverse", !showAvatar && "mt-0.5")}>
            <div className="w-8 shrink-0">
              {showAvatar && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px]">{initials(author?.full_name)}</AvatarFallback>
                </Avatar>
              )}
            </div>
            <div className={cn("max-w-[70%]", isOwn && "items-end flex flex-col")}>
              {showAvatar && (
                <div className={cn("flex items-baseline gap-2 text-[11px]", isOwn && "flex-row-reverse")}>
                  <span className="font-medium text-xs">{isOwn ? "Você" : (author?.full_name ?? "—")}</span>
                  <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
                </div>
              )}
              <div className={cn("rounded-2xl px-3 py-2 text-sm relative", isOwn ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm")}>
                <span className="whitespace-pre-wrap break-words">{m.content}</span>
                {(isOwn || isManagerOrAdmin) && (
                  <button
                    onClick={() => onDelete(m.id)}
                    className={cn("absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 bg-background border shadow-sm text-muted-foreground hover:text-destructive", isOwn ? "-left-6" : "-right-6")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function DMMessages({
  msgs, userId, peer, onDelete,
}: {
  msgs: DirectMessage[];
  userId: string | undefined;
  peer: ProfileLite | null;
  onDelete: (id: string) => void;
}) {
  if (msgs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        <AtSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
        Inicie uma conversa com {peer?.full_name ?? "este contato"}.
      </div>
    );
  }
  return (
    <>
      {msgs.map((m, idx) => {
        const isOwn = m.sender_id === userId;
        const prev = msgs[idx - 1];
        const showHeader = !prev || prev.sender_id !== m.sender_id || (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000);
        if (m.kind === "nudge") {
          return (
            <div key={m.id} className="flex items-center justify-center my-3">
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-full px-3 py-1 text-xs">
                <Zap className="h-3.5 w-3.5" />
                <span className="font-medium">{isOwn ? "Você" : (peer?.full_name ?? "—")}</span> chamou atenção!
                <span className="text-muted-foreground text-[10px]">{formatDateTime(m.created_at)}</span>
              </div>
            </div>
          );
        }
        const attachmentMeta: AttachmentMeta | null =
          m.kind === "attachment" && m.attachment_url && m.attachment_type
            ? {
                url: m.attachment_url,
                type: m.attachment_type,
                name: m.attachment_name ?? "anexo",
                size: m.attachment_size,
                mime: m.attachment_mime,
              }
            : null;
        return (
          <div key={m.id} className={cn("flex gap-2 group", isOwn && "flex-row-reverse", !showHeader && "mt-0.5")}>
            <div className="w-8 shrink-0">
              {showHeader && (
                <Avatar className="h-8 w-8">
                  {!isOwn && peer?.avatar_url && <img src={peer.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />}
                  <AvatarFallback className="text-[10px]">{initials(isOwn ? "Eu" : peer?.full_name)}</AvatarFallback>
                </Avatar>
              )}
            </div>
            <div className={cn("max-w-[70%]", isOwn && "items-end flex flex-col")}>
              {showHeader && (
                <div className={cn("flex items-baseline gap-2 text-[11px]", isOwn && "flex-row-reverse")}>
                  <span className="font-medium text-xs">{isOwn ? "Você" : (peer?.full_name ?? "—")}</span>
                  <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
                </div>
              )}
              <div className={cn("rounded-2xl px-3 py-2 text-sm relative", isOwn ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm")}>
                {attachmentMeta ? (
                  <div className="space-y-1">
                    <MessageAttachment meta={attachmentMeta} />
                    {m.content && <span className="whitespace-pre-wrap break-words block">{m.content}</span>}
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                )}
                {isOwn && m.read_at && (
                  <span className="block text-[10px] opacity-70 mt-0.5">✓ lida</span>
                )}
                {isOwn && (
                  <button
                    onClick={() => onDelete(m.id)}
                    className="absolute -top-1 -left-6 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 bg-background border shadow-sm text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
