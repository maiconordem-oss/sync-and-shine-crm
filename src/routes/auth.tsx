import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  if (!loading && isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Redirecionando...</div>;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (tab === "signin") {
      const { error } = await signIn(email, password);
      if (error) toast.error(error);
      else toast.success("Bem-vindo!");
    } else {
      const { error } = await signUp(email, password, fullName);
      if (error) toast.error(error);
      else toast.success("Conta criada! Você já está logado.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <CheckCircle2 className="h-6 w-6" /> FlowCRM
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            CRM completo de tarefas para sua equipe
          </h2>
          <p className="mt-3 text-primary-foreground/80 max-w-md">
            Kanban, lista, automações de fluxo, pagamentos e dashboards — tudo em um só lugar.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-primary-foreground/90">
            <li>• Visualizações Kanban e Lista</li>
            <li>• Automações: tarefa concluída → próxima etapa ou pagamento</li>
            <li>• Time tracking, subtarefas e dependências</li>
            <li>• Papéis: Admin, Gestor e Membro</li>
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">© FlowCRM</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Acesse sua conta</CardTitle>
            <CardDescription>
              {tab === "signin"
                ? "Entre com seu e-mail e senha."
                : "Crie sua conta. O primeiro usuário cadastrado vira Admin."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>

              <form onSubmit={onSubmit} className="mt-4 space-y-4">
                <TabsContent value="signup" className="space-y-2 m-0">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required={tab === "signup"}
                  />
                </TabsContent>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Aguarde..." : tab === "signin" ? "Entrar" : "Criar conta"}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
