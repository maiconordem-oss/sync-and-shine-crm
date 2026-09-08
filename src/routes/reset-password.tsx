import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Criar nova senha — FlowCRM" },
      { name: "description", content: "Defina uma nova senha para acessar sua conta no FlowCRM." },
      { property: "og:title", content: "Criar nova senha — FlowCRM" },
      { property: "og:description", content: "Defina uma nova senha para acessar sua conta no FlowCRM." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: ResetPasswordPage,
});

type Phase = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let settled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setPhase("ready");
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setPhase("ready");
        return;
      }
      // Dá um tempo para o Supabase processar o token do link do e-mail
      setTimeout(() => {
        if (!settled) setPhase("invalid");
      }, 2500);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (password !== confirm) { toast.error("As senhas não são iguais."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPhase("done");
    toast.success("Senha alterada!");
    setTimeout(() => { void navigate({ to: "/dashboard", replace: true }); }, 1200);
  };

  const resend = async () => {
    if (!resendEmail) { toast.error("Digite seu e-mail."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resendEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setResent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Criar nova senha
          </CardTitle>
          <CardDescription>
            {phase === "ready"
              ? "Escolha uma nova senha para entrar na sua conta."
              : phase === "invalid"
                ? "Este link não é mais válido."
                : phase === "done"
                  ? "Tudo certo!"
                  : "Validando seu link..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {phase === "checking" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Aguarde um instante...
            </div>
          )}

          {phase === "done" && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Senha alterada! Levando você para o painel...
            </div>
          )}

          {phase === "invalid" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                O link de redefinição venceu ou já foi usado. Peça um novo abaixo — ele chega no seu e-mail em alguns minutos.
              </div>
              {resent ? (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700 text-center">
                  E-mail enviado! Confira também a caixa de spam.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="resend">Seu e-mail</Label>
                    <Input id="resend" type="email" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={() => void resend()} disabled={busy}>
                    {busy ? "Enviando..." : "Enviar novo link"}
                  </Button>
                </>
              )}
              <button
                type="button"
                onClick={() => void navigate({ to: "/auth" })}
                className="text-xs text-muted-foreground hover:underline w-full text-center"
              >
                ← Voltar para o login
              </button>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirme a nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</> : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
