import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useSound } from "@/lib/use-sound";
import { toast } from "sonner";

export type PresenceStatus = "online" | "away" | "offline";

interface IncomingDM {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  kind: "text" | "nudge" | "attachment";
  attachment_type?: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * Global presence: mantém o status do usuário online/ausente/offline em qualquer página.
 */
export function useGlobalPresence() {
  const { user } = useAuth();
  const [ownStatus, setOwnStatus] = useState<PresenceStatus>("offline");

  useEffect(() => {
    if (!user) return;
    let lastActivity = Date.now();
    let cancelled = false;
    const upsert = async (status: PresenceStatus) => {
      if (cancelled) return;
      setOwnStatus(status);
      await supabase.from("user_presence").upsert({
        user_id: user.id,
        status,
        last_seen_at: new Date().toISOString(),
      });
    };
    void upsert("online");
    const onActivity = () => { lastActivity = Date.now(); };
    ["mousemove", "keydown", "click", "touchstart"].forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );
    const heartbeat = window.setInterval(() => {
      const idle = Date.now() - lastActivity;
      void upsert(idle > 5 * 60 * 1000 ? "away" : "online");
    }, 30_000);
    const onUnload = () => {
      try {
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?on_conflict=user_id`,
          new Blob(
            [JSON.stringify({ user_id: user.id, status: "offline", last_seen_at: new Date().toISOString() })],
            { type: "application/json" }
          )
        );
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onUnload);
      ["mousemove", "keydown", "click", "touchstart"].forEach((e) =>
        window.removeEventListener(e, onActivity)
      );
      void supabase.from("user_presence").upsert({
        user_id: user.id,
        status: "offline",
        last_seen_at: new Date().toISOString(),
      });
    };
  }, [user]);

  return ownStatus;
}

/**
 * Global DM listener: badge de não lidas, som, toast, tremida e piscar
 * de título em qualquer página.
 */
export function useGlobalDMListener(onOpen: (peerId: string) => void) {
  const { user } = useAuth();
  const { play } = useSound();
  const [unread, setUnread] = useState(0);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  const originalTitleRef = useRef<string>("");
  const titleIntervalRef = useRef<number | null>(null);
  const senderCacheRef = useRef<Map<string, string>>(new Map());

  const stopTitleFlash = useCallback(() => {
    if (titleIntervalRef.current !== null) {
      window.clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
    }
    if (originalTitleRef.current) document.title = originalTitleRef.current;
  }, []);

  const startTitleFlash = useCallback((msg: string) => {
    if (!originalTitleRef.current) originalTitleRef.current = document.title;
    if (titleIntervalRef.current !== null) return; // já piscando
    let toggle = false;
    titleIntervalRef.current = window.setInterval(() => {
      document.title = (toggle = !toggle) ? msg : originalTitleRef.current;
    }, 1000);
  }, []);

  // Quando o usuário volta para a aba, para de piscar
  useEffect(() => {
    const onVis = () => { if (!document.hidden) stopTitleFlash(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", stopTitleFlash);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", stopTitleFlash);
      stopTitleFlash();
    };
  }, [stopTitleFlash]);

  // Contagem inicial de não lidas
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [user]);

  // Resolve nome de remetente (cache)
  const resolveName = useCallback(async (senderId: string): Promise<string> => {
    const cached = senderCacheRef.current.get(senderId);
    if (cached) return cached;
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", senderId)
      .maybeSingle();
    const name = (data?.full_name as string | undefined) ?? "Alguém";
    senderCacheRef.current.set(senderId, name);
    return name;
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("dm_global_" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        async (payload) => {
          const m = payload.new as IncomingDM;
          if (m.sender_id === user.id) return;
          setUnread((n) => n + 1);

          const senderName = await resolveName(m.sender_id);
          const isNudge = m.kind === "nudge";

          // Som
          play(isNudge ? "nudge" : "dm_received");

          // Tremida (sempre, em qualquer aba)
          if (isNudge) {
            document.body.classList.add("nudge-shake");
            window.setTimeout(() => document.body.classList.remove("nudge-shake"), 850);
          }

          // Toast
          const preview = isNudge
            ? "chamou sua atenção!"
            : m.kind === "attachment"
              ? `📎 enviou ${m.attachment_type === "image" ? "uma imagem" : m.attachment_type === "audio" ? "um áudio" : m.attachment_type === "video" ? "um vídeo" : "um arquivo"}`
              : m.content.slice(0, 120);

          if (isNudge) {
            toast.warning(`${senderName} chamou sua atenção!`, {
              duration: 5000,
              action: { label: "Abrir", onClick: () => onOpenRef.current(m.sender_id) },
            });
          } else {
            toast(senderName, {
              description: preview,
              action: { label: "Abrir", onClick: () => onOpenRef.current(m.sender_id) },
            });
          }

          // Pisca título + notificação nativa quando aba não está em foco
          if (document.hidden) {
            startTitleFlash(`💬 ${senderName}${isNudge ? " te chamou!" : ""}`);
            try {
              if ("Notification" in window && Notification.permission === "granted") {
                const n = new Notification(senderName, {
                  body: preview,
                  tag: "dm-" + m.sender_id,
                  silent: false,
                });
                n.onclick = () => {
                  window.focus();
                  onOpenRef.current(m.sender_id);
                  n.close();
                };
              }
            } catch { /* ignore */ }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => {
          // Recalcula contagem quando algo é marcado como lido
          void supabase
            .from("direct_messages")
            .select("id", { count: "exact", head: true })
            .eq("recipient_id", user.id)
            .is("read_at", null)
            .then(({ count }) => setUnread(count ?? 0));
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, play, resolveName, startTitleFlash]);

  return unread;
}

export function requestNotificationPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch { /* ignore */ }
}
