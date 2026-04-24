import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Trash2, FileText, ChevronDown, ChevronRight, ClipboardList, X } from "lucide-react";
import { PRIORITY_LABEL } from "@/lib/labels";

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  default_priority: "low" | "medium" | "high" | "urgent";
  default_task_type: "internal" | "external";
  default_estimated_hours: number | null;
  default_service_value: number | null;
  default_tags: string[] | null;
  checklist_items: string[] | null;
  created_by: string | null;
  created_at: string;
}

// ─── Template Picker (inline in create form) ──────────────────────────────────

export function TemplatePicker({
  onApply,
}: {
  onApply: (t: TaskTemplate) => void;
}) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("task_templates").select("*").order("name");
    setTemplates((data ?? []) as TaskTemplate[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (templates.length === 0 && !loading) return null;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Usar modelo
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </Button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-72 rounded-xl border bg-background shadow-xl">
          <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
            {loading && <div className="p-3 text-xs text-muted-foreground text-center">Carregando...</div>}
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                onClick={() => { onApply(t); setOpen(false); }}
              >
                <div className="text-sm font-medium">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground truncate">{t.description}</div>}
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Badge className="text-[10px] px-1.5 h-4 bg-slate-100 text-slate-700">{PRIORITY_LABEL[t.default_priority]}</Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-4">{t.default_task_type === "external" ? "PJ" : "CLT"}</Badge>
                  {t.checklist_items && t.checklist_items.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 h-4">{t.checklist_items.length} itens</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Templates Manager (full page/modal) ─────────────────────────────────────

export function TaskTemplatesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isManagerOrAdmin, user } = useAuth();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<TaskTemplate> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("task_templates").select("*").order("name");
    setTemplates((data ?? []) as TaskTemplate[]);
  };

  useEffect(() => { if (open) void load(); }, [open]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !user) return;
    setBusy(true);
    const payload = {
      name: editing.name ?? "",
      description: editing.description || null,
      default_priority: editing.default_priority ?? "medium",
      default_task_type: editing.default_task_type ?? "internal",
      default_estimated_hours: editing.default_estimated_hours ?? null,
      default_service_value: editing.default_service_value ?? null,
      default_tags: editing.default_tags?.filter(Boolean) ?? null,
      checklist_items: editing.checklist_items?.filter(Boolean) ?? null,
      created_by: user.id,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("task_templates").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("task_templates").insert([payload]));
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Modelo atualizado!" : "Modelo criado!");
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este modelo?")) return;
    await supabase.from("task_templates").delete().eq("id", id);
    void load();
    toast.success("Modelo excluído.");
  };

  const newTemplate = (): Partial<TaskTemplate> => ({
    name: "",
    description: "",
    default_priority: "medium",
    default_task_type: "internal",
    default_estimated_hours: null,
    default_service_value: null,
    default_tags: [],
    checklist_items: [],
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Modelos de tarefa
            </h2>
            <p className="text-sm text-muted-foreground">Crie modelos reutilizáveis com checklist, prioridade e campos pré-definidos.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Template list */}
          <div className="w-64 border-r flex flex-col shrink-0">
            <div className="p-3 border-b">
              {isManagerOrAdmin && (
                <Button size="sm" className="w-full text-xs" onClick={() => setEditing(newTemplate())}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo modelo
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {templates.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-25" />
                  Nenhum modelo.
                </div>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setEditing({ ...t })}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${editing?.id === t.id ? "bg-primary/10 text-primary font-medium" : ""}`}
                >
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {PRIORITY_LABEL[t.default_priority]} · {t.default_task_type === "external" ? "PJ" : "CLT"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Edit form */}
          <div className="flex-1 overflow-y-auto">
            {!editing ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Selecione um modelo para editar.
              </div>
            ) : (
              <form onSubmit={save} className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-medium">Nome do modelo *</label>
                  <Input className="mt-1" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex: Criação de anúncio Shopee" autoFocus />
                </div>
                <div>
                  <label className="text-sm font-medium">Descrição padrão</label>
                  <Textarea className="mt-1 text-sm" rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Instruções, contexto..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Prioridade padrão</label>
                    <Select value={editing.default_priority ?? "medium"} onValueChange={(v) => setEditing({ ...editing, default_priority: v as TaskTemplate["default_priority"] })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Tipo padrão</label>
                    <Select value={editing.default_task_type ?? "internal"} onValueChange={(v) => setEditing({ ...editing, default_task_type: v as "internal" | "external" })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Interna (CLT)</SelectItem>
                        <SelectItem value="external">Externa (PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Horas estimadas</label>
                    <Input type="number" step="0.25" className="mt-1" value={editing.default_estimated_hours ?? ""} onChange={(e) => setEditing({ ...editing, default_estimated_hours: e.target.value ? Number(e.target.value) : null })} placeholder="Ex: 2" />
                  </div>
                  {editing.default_task_type === "external" && (
                    <div>
                      <label className="text-sm font-medium">Valor padrão (R$)</label>
                      <Input type="number" step="0.01" className="mt-1" value={editing.default_service_value ?? ""} onChange={(e) => setEditing({ ...editing, default_service_value: e.target.value ? Number(e.target.value) : null })} placeholder="Ex: 150.00" />
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <label className="text-sm font-medium">Tags padrão</label>
                  <div className="flex flex-wrap gap-1 mt-1 mb-1">
                    {(editing.default_tags ?? []).map((tag, i) => (
                      <span key={i} className="flex items-center gap-0.5 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {tag}
                        <button type="button" onClick={() => setEditing({ ...editing, default_tags: editing.default_tags?.filter((_, j) => j !== i) })}>
                          <X className="h-2.5 w-2.5 hover:text-rose-500" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Nova tag..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                          if (val) {
                            setEditing({ ...editing, default_tags: [...(editing.default_tags ?? []), val] });
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground self-center">Enter</span>
                  </div>
                </div>

                {/* Checklist items */}
                <div>
                  <label className="text-sm font-medium">Checklist padrão</label>
                  <div className="mt-1 space-y-1">
                    {(editing.checklist_items ?? []).map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40 shrink-0" />
                        <span className="text-sm flex-1">{item}</span>
                        <button type="button" onClick={() => setEditing({ ...editing, checklist_items: editing.checklist_items?.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Novo item de checklist..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) {
                            setEditing({ ...editing, checklist_items: [...(editing.checklist_items ?? []), val] });
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground self-center">Enter</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    {editing.id && isManagerOrAdmin && (
                      <Button type="button" variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => remove(editing.id!)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
                    {isManagerOrAdmin && (
                      <Button type="submit" size="sm" disabled={busy || !editing.name?.trim()}>
                        {busy ? "Salvando..." : editing.id ? "Salvar alterações" : "Criar modelo"}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
