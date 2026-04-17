import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FolderKanban } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projetos</h1>
          <p className="text-sm text-muted-foreground">Agrupe tarefas por iniciativa.</p>
        </div>
        {isManagerOrAdmin && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo projeto
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <Link key={p.id} to="/tasks" search={{ projectId: p.id } as never}>
            <Card className="hover:border-primary/50 transition">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg grid place-items-center text-white" style={{ background: p.color ?? "#3b82f6" }}>
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{p.description ?? "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">{counts[p.id] ?? 0} tarefas</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {projects.length === 0 && (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum projeto ainda.</CardContent></Card>
        )}
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
