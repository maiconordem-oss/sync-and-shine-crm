import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { initials, formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { toast } from "sonner";
import { Camera, User, Briefcase, Mail, Shield, Volume2, VolumeX, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, roles, soundEnabled, setSoundEnabled, refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ total: 0, done: 0, inProgress: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setJobTitle(profile.job_title ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    void Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "done"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "in_progress"),
    ]).then(([total, done, inProg]) => {
      setStats({ total: total.count ?? 0, done: done.count ?? 0, inProgress: inProg.count ?? 0 });
    });
  }, [user]);

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Máximo 5MB para foto de perfil."); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = data.publicUrl + "?t=" + Date.now();
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    setAvatarUrl(publicUrl);
    await refresh();
    setUploading(false);
    toast.success("Foto de perfil atualizada!");
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName.trim() || null,
      job_title: jobTitle.trim() || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await refresh();
    toast.success("Perfil salvo!");
  };

  const role = roles[0];
  const contractType = profile?.contract_type;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <User className="h-6 w-6 text-primary" /> Meu perfil
        </h1>
        <p className="text-sm text-muted-foreground">Edite suas informações pessoais e preferências.</p>
      </div>

      {/* Avatar + name header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <Avatar className="h-20 w-20 border-2 border-border">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
                <AvatarFallback className="text-2xl">{initials(fullName || profile?.full_name)}</AvatarFallback>
              </Avatar>
              {uploading ? (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera className="h-6 w-6 text-white" />
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ""; }}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-3">
                {role && (
                  <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                    <Shield className="h-3 w-3 mr-1" />
                    {ROLE_LABEL[role]}
                  </Badge>
                )}
                {contractType && (
                  <Badge variant="outline" className={cn("text-xs", contractType === "pj" ? "border-emerald-300 text-emerald-700" : "border-blue-300 text-blue-700")}>
                    {contractType === "pj" ? "Prestador PJ" : "CLT"}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {user?.email ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Membro desde {profile ? formatDateTime(profile.created_at ?? "") : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tarefas atribuídas", value: stats.total },
          { label: "Em andamento", value: stats.inProgress },
          { label: "Concluídas", value: stats.done },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit form */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Informações pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nome completo</label>
            <Input
              className="mt-1"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="text-sm font-medium flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" /> Cargo / função
            </label>
            <Input
              className="mt-1"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Ex: Designer, Desenvolvedor, Analista..."
            />
          </div>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4 mr-2" /> Salvar alterações</>}
          </Button>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader><CardTitle className="text-base">Preferências</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Sound toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Notificações sonoras</div>
              <div className="text-xs text-muted-foreground">Toca um som ao mover tarefas e receber comentários.</div>
            </div>
            <button
              onClick={() => void setSoundEnabled(!soundEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                soundEnabled ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow",
                soundEnabled ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {soundEnabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
            {soundEnabled ? "Som ativado" : "Som desativado"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
