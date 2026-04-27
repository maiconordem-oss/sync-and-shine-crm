import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { runAutomations } from "@/lib/automations";
import { toast } from "sonner";
import { PRIORITY_LABEL } from "@/lib/labels";
import { Plus, Trash2, Link2, ClipboardList, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplatePicker, TaskTemplatesManager, type TaskTemplate } from "@/components/tasks/task-templates";
import { TaskBodyImages, type BodyImage } from "@/components/tasks/task-body-images";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: { id: string; name: string; color?: string | null }[];
  profiles: { id: string; full_name: string | null; contract_type?: "clt" | "pj" | null }[];
  parentTaskId?: string;
  defaultProjectId?: string;
  onCreated?: () => void;
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

export function CreateTaskDialog({ open, onOpenChange, projects, profiles, parentTaskId, defaultProjectId, onCreated }: Props) {
  const { user, profile, can } = useAuth();

  // Core fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "none");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [taskType, setTaskType] = useState<"internal" | "external">("internal");
  const [serviceValue, setServiceValue] = useState("");

  // Checklist
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");

  // Links
  const [links, setLinks] = useState<{ url: string; title: string }[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkTitle, setNewLinkTitle] = useState("");

  // Body images
  const [bodyImages, setBodyImages] = useState<BodyImage[]>([]);
  const [showTemplatesManager, setShowTemplatesManager] = useState(false);

  // UI state
  const [activeSection, setActiveSection] = useState<"main" | "checklist" | "links">("main");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !user) return;
    setAssigneeId(user.id);
    setProjectId(defaultProjectId ?? "none");
    setDueDate(defaultDueDate());
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, user, defaultProjectId]);

  const selectedAssignee = useMemo(
    () => profiles.find((p) => p.id === (assigneeId === "none" ? null : assigneeId)),
    [assigneeId, profiles],
  );

  const reset = () => {
    setTitle(""); setDescription(""); setAssigneeId("none");
    setProjectId(defaultProjectId ?? "none"); setPriority("medium");
    setDueDate(defaultDueDate()); setTaskType("internal"); setServiceValue("");
    setChecklistItems([]); setNewCheckItem("");
    setLinks([]); setNewLinkUrl(""); setNewLinkTitle("");
    setBodyImages([]);
    setActiveSection("main");
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklistItems((prev) => [...prev, newCheckItem.trim()]);
    setNewCheckItem("");
  };

  const applyTemplate = (t: TaskTemplate) => {
    if (t.default_title && !title) setTitle(t.default_title);
    if (t.description && !description) setDescription(t.description);
    setPriority(t.default_priority);
    setTaskType(t.default_task_type);
    if (t.default_service_value) setServiceValue(String(t.default_service_value));
    if (t.checklist_items?.length) setChecklistItems(t.checklist_items);
    toast.success(`Modelo "${t.name}" aplicado!`);
  };

  const addLink = () => {
    if (!newLinkUrl.trim()) return;
    let url = newLinkUrl.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    setLinks((prev) => [...prev, { url, title: newLinkTitle.trim() || getDomain(url) }]);
    setNewLinkUrl(""); setNewLinkTitle("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Você precisa estar logado."); return; }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { toast.error("Informe um título para a tarefa."); return; }
    if (taskType === "external" && !serviceValue) { toast.error("Informe o valor do serviço."); return; }

    setBusy(true);
    const payload = {
      title: trimmedTitle,
      description: description || null,
      project_id: projectId === "none" ? null : projectId,
      assignee_id: assigneeId === "none" ? null : assigneeId,
      priority,
      status: "new" as const,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      created_by: user.id,
      parent_task_id: parentTaskId ?? null,
      task_type: taskType,
      service_value: taskType === "external" && serviceValue ? Number(serviceValue) : null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.from("tasks").insert([payload] as any).select().single();
    if (error) { toast.error(error.message); setBusy(false); return; }

    const taskId = (data as { id: string }).id;

    // Upload body images
    if (bodyImages.length > 0) {
      await supabase.from("attachments").insert(
        bodyImages.map((img) => ({
          task_id: taskId,
          uploaded_by: user.id,
          file_name: img.name,
          storage_path: img.path,
          mime_type: "image/png",
          size_bytes: null,
        }))
      );
    }

    // Insert checklist items
    if (checklistItems.length > 0) {
      await supabase.from("checklists").insert(
        checklistItems.map((text, i) => ({ task_id: taskId, text, position: i, done: false }))
      );
    }

    // Insert links
    if (links.length > 0) {
      await (supabase.from("task_links" as never) as any).insert(
        links.map((l) => ({ task_id: taskId, url: l.url, title: l.title, added_by: user.id }))
      );
    }

    setBusy(false);
    toast.success("Tarefa criada!");
    reset();
    onOpenChange(false);
    onCreated?.();
    void runAutomations({ trigger: "task_created", task: data as unknown as Record<string, unknown>, userId: user.id, userName: profile?.full_name ?? undefined });
  };

  const tabs = [
    { id: "main", label: "Tarefa" },
    { id: "checklist", label: `Checklist${checklistItems.length ? ` (${checklistItems.length})` : ""}` },
    { id: "links", label: `Links${links.length ? ` (${links.length})` : ""}` },
  ] as const;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg">{parentTaskId ? "Nova subtarefa" : "Nova tarefa"}</DialogTitle>
            <div className="flex items-center gap-2">
              {can("tasks.use_templates") && <TemplatePicker onApply={applyTemplate} />}
              {can("tasks.use_templates") && <button type="button" onClick={() => setShowTemplatesManager(true)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border rounded-md px-2 py-1 hover:bg-muted">
                <FileText className="h-3.5 w-3.5" /> Gerenciar modelos
              </button>}
            </div>
          </div>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex border-b px-6">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveSection(tab.id)}
              className={cn("px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeSection === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* ── TAREFA ── */}
            {activeSection === "main" && (
              <div className="space-y-4">
                {/* Título */}
                <div className="space-y-1.5">
                  <Label>Título *</Label>
                  <Input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="O que precisa ser feito?" required />
                </div>

                {/* Descrição */}
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    rows={4} placeholder="Contexto, links, detalhes, SKU, anúncio..." />
                  <p className="text-xs text-muted-foreground">URLs na descrição viram links clicáveis automaticamente.</p>
                </div>

                {/* Imagens e documentos */}
                <div className="space-y-1.5">
                  <Label>Imagens e arquivos</Label>
                  <TaskBodyImages images={bodyImages} onChange={setBodyImages} />
                </div>

                {/* Grid de campos */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Responsável */}
                  <div className="space-y-1.5">
                    <Label>Responsável</Label>
                    <Select value={assigneeId} onValueChange={(v) => {
                      setAssigneeId(v);
                      const p = profiles.find((x) => x.id === v);
                      if (p?.contract_type === "pj") setTaskType("external");
                      else if (p?.contract_type === "clt") setTaskType("internal");
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem responsável</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name ?? "—"}{p.contract_type === "pj" ? " (PJ)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAssignee?.contract_type === "pj" && (
                      <p className="text-xs text-amber-600">PJ → fluxo com revisão e pagamento</p>
                    )}
                  </div>

                  {/* Projeto */}
                  <div className="space-y-1.5">
                    <Label>Projeto</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem projeto</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Prazo — padrão +3 dias */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center justify-between">
                      Prazo
                      <div className="flex gap-1">
                        {[1, 3, 7, 15].map((d) => (
                          <button key={d} type="button"
                            onClick={() => { const dt = new Date(); dt.setDate(dt.getDate() + d); setDueDate(dt.toISOString().slice(0, 10)); }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted-foreground/20 text-muted-foreground font-medium">
                            +{d}d
                          </button>
                        ))}
                      </div>
                    </Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>

                  {/* Prioridade */}
                  <div className="space-y-1.5">
                    <Label>Prioridade</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tipo */}
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select value={taskType} onValueChange={(v) => setTaskType(v as typeof taskType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Interna (CLT)</SelectItem>
                        <SelectItem value="external">Externa (PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Valor PJ */}
                  {taskType === "external" && (
                    <div className="space-y-1.5">
                      <Label>Valor do serviço (R$)</Label>
                      <Input type="number" step="0.01" min="0" value={serviceValue}
                        onChange={(e) => setServiceValue(e.target.value)}
                        placeholder="Ex: 45.00" />
                      <p className="text-xs text-muted-foreground">Pagamento criado ao aprovar.</p>
                    </div>
                  )}
                </div>

                {/* Quick access */}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setActiveSection("checklist")}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border rounded-lg px-3 py-2 hover:border-primary/40 transition-colors">
                    <ClipboardList className="h-3.5 w-3.5" />
                    {checklistItems.length ? `Checklist (${checklistItems.length})` : "Adicionar checklist"}
                  </button>
                  <button type="button" onClick={() => setActiveSection("links")}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary border rounded-lg px-3 py-2 hover:border-primary/40 transition-colors">
                    <Link2 className="h-3.5 w-3.5" />
                    {links.length ? `Links (${links.length})` : "Adicionar links"}
                  </button>
                </div>
              </div>
            )}

            {/* ── CHECKLIST ── */}
            {activeSection === "checklist" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Itens que o responsável precisa marcar como concluídos.</p>

                {checklistItems.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum item ainda</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  {checklistItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 py-2 px-3 rounded-lg border bg-muted/20 group">
                      <Checkbox disabled className="h-4 w-4" />
                      <span className="flex-1 text-sm">{item}</span>
                      <button type="button" onClick={() => setChecklistItems((p) => p.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 border-t pt-3">
                  <Input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                    placeholder="Novo item..." className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckItem(); } }} />
                  <Button type="button" variant="outline" onClick={addCheckItem} disabled={!newCheckItem.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── LINKS ── */}
            {activeSection === "links" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Links relevantes para a tarefa: anúncios, documentos, referências.</p>

                {links.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-xl">
                    <Link2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum link ainda</p>
                  </div>
                )}

                <div className="space-y-2">
                  {links.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 py-2 px-3 rounded-lg border bg-muted/20 group">
                      <img src={`https://www.google.com/s2/favicons?domain=${getDomain(link.url)}&sz=16`}
                        alt="" className="h-4 w-4 shrink-0 rounded-sm"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{link.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{getDomain(link.url)}</div>
                      </div>
                      <button type="button" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <Input value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://..." />
                  <div className="flex gap-2">
                    <Input value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)}
                      placeholder="Título (opcional)" className="flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
                    <Button type="button" variant="outline" onClick={addLink} disabled={!newLinkUrl.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {checklistItems.length > 0 && <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {checklistItems.length} item{checklistItems.length !== 1 ? "s" : ""}</span>}
              {links.length > 0 && <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> {links.length} link{links.length !== 1 ? "s" : ""}</span>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={busy || !title.trim()}>
                {busy ? "Criando..." : "Criar tarefa"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <TaskTemplatesManager
      open={showTemplatesManager}
      onClose={() => setShowTemplatesManager(false)}
    />
  </>
  );
}
// Sat Apr 25 17:10:25 UTC 2026
