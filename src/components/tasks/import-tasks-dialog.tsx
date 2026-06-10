import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Upload, FileJson, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: { id: string; name: string }[];
  profiles: { id: string; full_name: string | null }[];
  onImported?: () => void;
}

interface RawItem {
  titulo?: string;
  descricao?: string;
  responsavel?: string;
  projeto?: string;
  tipo?: string;
  valor?: string | number;
  prioridade?: string;
  status?: string;
  link?: string;
  links?: string[];
}

interface PreparedItem {
  raw: RawItem;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_label: string;
  project_id: string | null;
  project_label: string;
  task_type: "internal" | "external";
  service_value: number | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "new" | "in_progress" | "waiting" | "done" | "deferred" | "in_review" | "canceled";
  service_value_label: string;
  links: string[];
  warnings: string[];
}

function normalizeLink(u: string): string {
  const s = u.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return "https://" + s;
}

const PRIORITY_MAP: Record<string, PreparedItem["priority"]> = {
  baixa: "low", low: "low",
  media: "medium", medium: "medium",
  alta: "high", high: "high",
  urgente: "urgent", urgent: "urgent",
};

const STATUS_MAP: Record<string, PreparedItem["status"]> = {
  nova: "new", novo: "new", new: "new",
  "em andamento": "in_progress", andamento: "in_progress", in_progress: "in_progress",
  aguardando: "waiting", waiting: "waiting",
  concluida: "done", feita: "done", done: "done",
  adiada: "deferred", deferred: "deferred",
  "em revisao": "in_review", revisao: "in_review", in_review: "in_review",
  cancelada: "canceled", cancelado: "canceled", canceled: "canceled",
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function parseType(v?: string): "internal" | "external" {
  const n = norm(v || "");
  if (n.includes("ext") || n.includes("pj")) return "external";
  return "internal";
}

function parseValue(v?: string | number): number | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function ImportTasksDialog({ open, onOpenChange, projects, profiles, onImported }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [items, setItems] = useState<PreparedItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(1);
    setItems([]);
    setSelected(new Set());
    setFileName(null);
    setParseError(null);
    setProgress({ current: 0, total: 0 });
    setCreating(false);
    setDone(false);
    setCreatedCount(0);
    setFailedCount(0);
  }

  function handleClose(v: boolean) {
    if (creating) return;
    if (!v) reset();
    onOpenChange(v);
  }

  function prepare(raw: RawItem[]): PreparedItem[] {
    return raw.map((r) => {
      const warnings: string[] = [];
      const respName = (r.responsavel || "").trim();
      const projName = (r.projeto || "").trim();
      const respNorm = norm(respName);
      const projNorm = norm(projName);

      const assignee = respName
        ? profiles.find((p) => p.full_name && norm(p.full_name).includes(respNorm))
        : undefined;
      const project = projName
        ? projects.find((p) => norm(p.name).includes(projNorm))
        : undefined;

      if (respName && !assignee) warnings.push(`Responsável "${respName}" não encontrado`);
      if (projName && !project) warnings.push(`Projeto "${projName}" não encontrado`);

      const task_type = parseType(r.tipo);
      const service_value = parseValue(r.valor);
      const priority = PRIORITY_MAP[norm(r.prioridade || "")] || "medium";
      const status = STATUS_MAP[norm(r.status || "")] || "new";

      const linksRaw: string[] = [];
      if (Array.isArray(r.links)) linksRaw.push(...r.links.map(String));
      if (r.link) linksRaw.push(String(r.link));
      const links = linksRaw.map(normalizeLink).filter(Boolean);

      return {
        raw: r,
        title: (r.titulo || "").trim(),
        description: r.descricao ? String(r.descricao) : null,
        assignee_id: assignee?.id || null,
        assignee_label: assignee?.full_name || respName || "—",
        project_id: project?.id || null,
        project_label: project?.name || projName || "—",
        task_type,
        service_value,
        priority,
        status,
        service_value_label: service_value !== null
          ? service_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : "—",
        links,
        warnings,
      };
    });
  }

  async function handleFile(file: File) {
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const arr: RawItem[] = Array.isArray(parsed) ? parsed : [parsed];
      const valid = arr.filter((x) => x && typeof x === "object" && (x.titulo || "").toString().trim());
      if (valid.length === 0) {
        setParseError("Nenhuma tarefa válida encontrada. Cada item precisa ter um 'titulo'.");
        return;
      }
      const prepared = prepare(valid);
      setItems(prepared);
      setSelected(new Set(prepared.map((_, i) => i)));
      setStep(2);
    } catch (e: any) {
      setParseError("Arquivo JSON inválido: " + (e?.message || "erro ao ler"));
    }
  }

  function toggle(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((_, i) => i)));
  }

  async function handleCreate() {
    const toCreate = items.filter((_, i) => selected.has(i));
    if (toCreate.length === 0) {
      toast.error("Selecione ao menos uma tarefa");
      return;
    }
    setCreating(true);
    setStep(3);
    setProgress({ current: 0, total: toCreate.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < toCreate.length; i++) {
      const it = toCreate[i];
      setProgress({ current: i + 1, total: toCreate.length });
      const { error } = await supabase.from("tasks").insert({
        title: it.title,
        description: it.description,
        assignee_id: it.assignee_id,
        project_id: it.project_id,
        task_type: it.task_type,
        service_value: it.service_value,
        priority: it.priority,
        status: it.status,
        created_by: user?.id ?? null,
      } as any);
      if (error) {
        fail++;
        console.error("Import task error:", error, it);
      } else {
        ok++;
      }
    }
    setCreatedCount(ok);
    setFailedCount(fail);
    setCreating(false);
    setDone(true);
    if (ok > 0) {
      toast.success(`${ok} tarefa(s) criada(s) com sucesso${fail ? `, ${fail} falharam` : ""}`);
      onImported?.();
    } else {
      toast.error("Nenhuma tarefa foi criada");
    }
  }

  const allChecked = items.length > 0 && selected.size === items.length;
  const readyCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar tarefas
          </DialogTitle>
          <DialogDescription>
            Passo {step} de 3 — {step === 1 ? "Upload" : step === 2 ? "Preview" : "Criação"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                )}
              >
                <FileJson className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">Arraste o arquivo .json aqui</p>
                <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
                {fileName && <p className="text-xs text-primary mt-2">{fileName}</p>}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {parseError && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Ver formato esperado</summary>
                <pre className="mt-2 p-3 bg-muted rounded overflow-auto">{`[{
  "titulo": "...",
  "descricao": "...",
  "responsavel": "Fabio Stein Kieling",
  "projeto": "Anuncio Mercado Livre",
  "tipo": "Externa (PJ)",
  "valor": "18.00",
  "prioridade": "Media",
  "status": "Nova"
}]`}</pre>
              </details>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {readyCount} tarefa{readyCount !== 1 ? "s" : ""} pronta{readyCount !== 1 ? "s" : ""} para criar
                </p>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {allChecked ? "Desmarcar todas" : "Marcar todas"}
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="p-2 w-10"></th>
                      <th className="p-2 w-10">#</th>
                      <th className="p-2">Título</th>
                      <th className="p-2">Responsável</th>
                      <th className="p-2">Projeto</th>
                      <th className="p-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className={cn("border-t", !selected.has(i) && "opacity-50")}>
                        <td className="p-2">
                          <Checkbox checked={selected.has(i)} onCheckedChange={() => toggle(i)} />
                        </td>
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          <div className="font-medium">{it.title}</div>
                          {it.warnings.length > 0 && (
                            <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                              <AlertCircle className="h-3 w-3" />
                              {it.warnings.join(" • ")}
                            </div>
                          )}
                        </td>
                        <td className="p-2">{it.assignee_label}</td>
                        <td className="p-2">{it.project_label}</td>
                        <td className="p-2 text-right tabular-nums">{it.service_value_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="py-8 text-center space-y-4">
              {!done ? (
                <>
                  <div className="text-lg font-medium">
                    Criando tarefa {progress.current} de {progress.total}...
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                  <div className="text-lg font-medium">Importação concluída</div>
                  <p className="text-sm text-muted-foreground">
                    {createdCount} tarefa(s) criada(s){failedCount > 0 ? `, ${failedCount} falharam` : ""}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 1 && (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => { reset(); }}>Voltar</Button>
              <Button onClick={handleCreate} disabled={readyCount === 0}>
                Criar {readyCount} tarefa{readyCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === 3 && done && (
            <Button onClick={() => handleClose(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
