import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban, LayoutGrid, ListFilter } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface Project { id: string; name: string; description: string | null; color: string | null; archived: boolean }

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user, isManagerOrAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const activeProjects = projects.filter((project) => !project.archived).length;

  const load = async () => {
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    const list = (data ?? []) as Project[];
    setProjects(list);
    if (list.length) {
      const { data: tasks } = await supabase.from("tasks").select("project_id").in("project_id", list.map((p) => p.id));
      const c: Record<string, number> = {};
      ((tasks ?? []) as { project_id: string | null }[]).forEach((t) => {
        if (t.project_id) c[t.project_id] = (c[t.project_id] ?? 0) + 1;
      });
      setCounts(c);
    }
  };

  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("projects").insert([{ name, description, color, owner_id: user.id }]);
    if (error) { toast.error(error.message); return; }
    setOpen(false); setName(""); setDescription(""); setColor("#3b82f6");
    toast.success("Projeto criado!");
    void load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projetos</h1>
          <p className="text-sm text-muted-foreground">Visão central de iniciativas e carga operacional.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground md:flex">
            <LayoutGrid className="h-4 w-4" />
            {activeProjects} ativos
          </div>
          {isManagerOrAdmin && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo projeto
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <div className="text-sm font-medium">Painel</div>
              <div className="mt-1 text-xs text-muted-foreground">Estrutura inspirada em workspace corporativo.</div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
                <span className="text-muted-foreground">Projetos</span>
                <span className="font-medium text-foreground">{projects.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
                <span className="text-muted-foreground">Ativos</span>
                <span className="font-medium text-foreground">{activeProjects}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
                <span className="text-muted-foreground">Tarefas</span>
                <span className="font-medium text-foreground">{Object.values(counts).reduce((acc, value) => acc + value, 0)}</span>
              </div>
            </div>
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 text-foreground">
                <ListFilter className="h-3.5 w-3.5" /> Visão rápida
              </div>
              Abra um projeto para ir direto para as tarefas filtradas.
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {projects.map((p) => (
          <Link key={p.id} to="/tasks" search={{ projectId: p.id } as never}>
            <Card className="h-full border-border/80 bg-card transition hover:border-primary/40 hover:shadow-sm">
              <CardContent className="flex h-full items-start gap-3 p-4">
                <div className="grid h-11 w-11 place-items-center rounded-md text-white" style={{ background: p.color ?? "#3b82f6" }}>
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium truncate">{p.name}</div>
                    <span className="rounded-sm bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{counts[p.id] ?? 0}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description ?? "Sem descrição"}</div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{p.archived ? "Arquivado" : "Ativo"}</span>
                    <span className="font-medium text-foreground">{counts[p.id] ?? 0} tarefas</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {projects.length === 0 && (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum projeto ainda.</CardContent></Card>
        )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!name}>Criar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
