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
  default_title: string | null;      // ← título padrão da tarefa
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

// ─── Template Picker ──────────────────────────────────────────────────────────

export function TemplatePicker({ onApply }: { onApply: (t: TaskTemplate) => void }) {
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
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-50 w-80 rounded-xl border bg-background shadow-2xl">
            <div className="p-2 max-h-72 overflow-y-auto space-y-1">
              {loading && <div className="p-3 text-xs text-muted-foreground text-center">Carregando...</div>}
              {!loading && templates.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground text-center">Nenhum modelo cadastrado.</div>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-muted/60 transition-colors border border-transparent hover:border-border"
                  onClick={() => { onApply(t); setOpen(false); }}
                >
                  <div className="text-sm font-medium">{t.name}</div>
                  {t.default_title && (
                    <div className="text-xs text-primary truncate mt-0.5">Título: {t.default_title}</div>
                  )}
                  {t.description && (
                    <div className="text-xs text-muted-foreground truncate">{t.description}</div>
                  )}
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    <Badge className="text-[10px] px-1.5 h-4 bg-slate-100 text-slate-700">
                      {PRIORITY_LABEL[t.default_priority]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                      {t.default_task_type === "external" ? "PJ" : "CLT"}
                    </Badge>
                    {t.checklist_items && t.checklist_items.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                        {t.checklist_items.length} itens checklist
                      </Badge>
                    )}
                    {t.default_tags && t.default_tags.length > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                        {t.default_tags.length} tags
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Templates Manager ────────────────────────────────────────────────────────

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
    if (!editing.name?.trim()) { toast.error("Informe um nome para o modelo."); return; }
    setBusy(true);
    const payload = {
      name: editing.name.trim(),
      default_title: editing.default_title?.trim() || null,
      description: editing.description?.trim() || null,
      default_priority: editing.default_priority ?? "medium",
      default_task_type: editing.default_task_type ?? "internal",
      default_estimated_hours: editing.default_estimated_hours ?? null,
      default_service_value: editing.default_service_value ?? null,
      default_tags: editing.default_tags?.filter(Boolean) ?? null,
      checklist_items: editing.checklist_items?.filter(Boolean) ?? null,
      created_by: user.id,
    };
    const { error } = editing.id
      ? await supabase.from("task_templates").update(payload).eq("id", editing.id)
      : await supabase.from("task_templates").insert([payload]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Modelo atualizado!" : "Modelo criado!");
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este modelo?")) return;
    await supabase.from("task_templates").delete().eq("id", id);
    setEditing(null);
    void load();
    toast.success("Modelo excluído.");
  };

  const blank = (): Partial<TaskTemplate> => ({
    name: "",
    default_title: "",
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
      <div
        className="bg-background rounded-xl border shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Modelos de tarefa
            </h2>
            <p className="text-sm text-muted-foreground">
              Modelos definem título, descrição, checklist e campos padrão para novas tarefas.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* List */}
          <div className="w-60 border-r flex flex-col shrink-0">
            {isManagerOrAdmin && (
              <div className="p-3 border-b shrink-0">
                <Button size="sm" className="w-full text-xs" onClick={() => setEditing(blank())}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo modelo
                </Button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {templates.length === 0 && (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-25" />
                  Nenhum modelo ainda.
                </div>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setEditing({ ...t })}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                    editing?.id === t.id ? "bg-primary/10 text-primary font-medium border border-primary/20" : ""
                  }`}
                >
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {PRIORITY_LABEL[t.default_priority]} · {t.default_task_type === "external" ? "PJ" : "CLT"}
                    {t.checklist_items?.length ? ` · ${t.checklist_items.length} itens` : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto">
            {!editing ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Selecione ou crie um modelo.
              </div>
            ) : (
              <form onSubmit={save} className="p-5 space-y-4">
                {/* Nome do modelo */}
                <div>
                  <label className="text-sm font-medium">Nome do modelo *</label>
                  <Input
                    className="mt-1"
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ex: Criação de anúncio Shopee"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">Nome interno para identificar o modelo.</p>
                </div>

                {/* Título padrão da tarefa */}
                <div>
                  <label className="text-sm font-medium">Título padrão da tarefa</label>
                  <Input
                    className="mt-1"
                    value={editing.default_title ?? ""}
                    onChange={(e) => setEditing({ ...editing, default_title: e.target.value })}
                    placeholder="Ex: Criar anúncio — [produto]"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Preenche automaticamente o título ao usar o modelo. Pode ser editado antes de criar.
                  </p>
                </div>

                {/* Descrição padrão */}
                <div>
                  <label className="text-sm font-medium">Descrição padrão</label>
                  <Textarea
                    className="mt-1 text-sm resize-none"
                    rows={3}
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Instruções, contexto, links úteis..."
                  />
                </div>

                {/* Grid de campos */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Prioridade padrão</label>
                    <Select
                      value={editing.default_priority ?? "medium"}
                      onValueChange={(v) => setEditing({ ...editing, default_priority: v as TaskTemplate["default_priority"] })}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Tipo padrão</label>
                    <Select
                      value={editing.default_task_type ?? "internal"}
                      onValueChange={(v) => setEditing({ ...editing, default_task_type: v as "internal" | "external" })}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Interna (CLT)</SelectItem>
                        <SelectItem value="external">Externa (PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Horas estimadas</label>
                    <Input
                      type="number" step="0.25" min="0"
                      className="mt-1"
                      value={editing.default_estimated_hours ?? ""}
                      onChange={(e) => setEditing({ ...editing, default_estimated_hours: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Ex: 2"
                    />
                  </div>
                  {editing.default_task_type === "external" && (
                    <div>
                      <label className="text-sm font-medium">Valor padrão (R$)</label>
                      <Input
                        type="number" step="0.01" min="0"
                        className="mt-1"
                        value={editing.default_service_value ?? ""}
                        onChange={(e) => setEditing({ ...editing, default_service_value: e.target.value ? Number(e.target.value) : null })}
                        placeholder="Ex: 150.00"
                      />
                    </div>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <label className="text-sm font-medium">Tags padrão</label>
                  <div className="flex flex-wrap gap-1 mt-1 mb-1.5 min-h-[24px]">
                    {(editing.default_tags ?? []).map((tag, i) => (
                      <span key={i} className="flex items-center gap-0.5 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setEditing({ ...editing, default_tags: editing.default_tags?.filter((_, j) => j !== i) })}
                          className="hover:text-rose-500 ml-0.5"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Input
                    className="h-7 text-xs"
                    placeholder="Digite uma tag e pressione Enter..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                        if (val && !(editing.default_tags ?? []).includes(val)) {
                          setEditing({ ...editing, default_tags: [...(editing.default_tags ?? []), val] });
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                </div>

                {/* Checklist */}
                <div>
                  <label className="text-sm font-medium">Checklist padrão</label>
                  <p className="text-xs text-muted-foreground mb-1.5">Esses itens serão criados automaticamente com a tarefa.</p>
                  <div className="space-y-1 mb-2">
                    {(editing.checklist_items ?? []).map((item, i) => (
                      <div key={i} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40 group">
                        <div className="h-3.5 w-3.5 rounded border border-muted-foreground/40 shrink-0" />
                        <span className="text-sm flex-1">{item}</span>
                        <button
                          type="button"
                          onClick={() => setEditing({ ...editing, checklist_items: editing.checklist_items?.filter((_, j) => j !== i) })}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Input
                    className="h-8 text-sm"
                    placeholder="Novo item de checklist — pressione Enter para adicionar..."
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
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <div>
                    {editing.id && isManagerOrAdmin && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs"
                        onClick={() => remove(editing.id!)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                    {isManagerOrAdmin && (
                      <Button type="submit" size="sm" disabled={busy || !editing.name?.trim()}>
                        {busy ? "Salvando..." : editing.id ? "Salvar" : "Criar modelo"}
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
