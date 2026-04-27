import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "member";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
  contract_type: "clt" | "pj" | null;
  sound_enabled: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isManagerOrAdmin: boolean;
  isPJ: boolean;          // contract_type === 'pj'
  canCreateTasks: boolean; // admin, manager, or CLT member
  soundEnabled: boolean;
  can: (permission: string) => boolean; // check role_permissions table
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setSoundEnabled: (v: boolean) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [roles, setRoles] = React.useState<AppRole[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadProfileAndRoles = React.useCallback(async (uid: string) => {
    const [{ data: prof }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile) ?? null);
    setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
  }, []);

  React.useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer to avoid recursion
        setTimeout(() => {
          void loadProfileAndRoles(sess.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    void supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        void loadProfileAndRoles(sess.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadProfileAndRoles]);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = React.useCallback(async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refresh = React.useCallback(async () => {
    if (user) await loadProfileAndRoles(user.id);
  }, [user, loadProfileAndRoles]);

  const [soundEnabled, setSoundEnabledState] = React.useState(true);

  // Sync sound setting from profile
  React.useEffect(() => {
    if (profile) setSoundEnabledState(profile.sound_enabled ?? true);
  }, [profile?.sound_enabled]);

  const setSoundEnabled = React.useCallback(async (v: boolean) => {
    setSoundEnabledState(v);
    if (user) await supabase.from("profiles").update({ sound_enabled: v }).eq("id", user.id);
  }, [user]);

  const isPJ = profile?.contract_type === "pj";
  const canCreateTasks = roles.includes("admin") || roles.includes("manager") || (!isPJ && roles.includes("member"));

  // Load role_permissions from DB
  const [rolePerms, setRolePerms] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    if (!roles.length) return;
    const roleKey = roles.includes("admin") ? "admin"
      : roles.includes("manager") ? "manager"
      : isPJ ? "pj" : "member";
    // Admin always has all permissions
    if (roleKey === "admin") { setRolePerms({}); return; }
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("role_permissions" as never) as any)
          .select("permission,enabled")
          .eq("role", roleKey);
        if (data) {
          const map: Record<string, boolean> = {};
          for (const row of data as { permission: string; enabled: boolean }[]) {
            map[row.permission] = row.enabled;
          }
          setRolePerms(map);
        }
      } catch { /* table not created yet — ignore */ }
    })();
  }, [roles.join(","), isPJ]);

  // Realtime: recarrega permissões quando admin altera no painel
  React.useEffect(() => {
    if (!roles.length || roles.includes("admin")) return;
    const roleKey = roles.includes("manager") ? "manager" : isPJ ? "pj" : "member";
    const channel = supabase
      .channel("role_permissions_changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "role_permissions",
        filter: `role=eq.${roleKey}`,
      }, (payload) => {
        const row = payload.new as { permission: string; enabled: boolean };
        if (row?.permission) {
          setRolePerms((prev) => ({ ...prev, [row.permission]: row.enabled }));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [roles.join(","), isPJ]);

  const can = React.useCallback((permission: string): boolean => {
    if (roles.includes("admin")) return true; // admin can always
    return rolePerms[permission] ?? true; // default true if table not loaded yet
  }, [roles, rolePerms]);

  const value: AuthContextValue = {
    session,
    user,
    profile,
    roles,
    loading,
    isAuthenticated: !!session,
    isAdmin: roles.includes("admin"),
    isManagerOrAdmin: roles.includes("admin") || roles.includes("manager"),
    isPJ,
    canCreateTasks,
    soundEnabled,
    setSoundEnabled,
    can,
    signIn,
    signUp,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
