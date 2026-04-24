export const STATUS_LABEL: Record<string, string> = {
  new: "Nova",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  in_review: "Em revisão",
  done: "Concluída",
  deferred: "Adiada",
  awaiting_approval: "Aguardando aprovação",
};

export const STATUS_ORDER = ["new", "in_progress", "waiting", "in_review", "awaiting_approval", "done", "deferred"] as const;

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-rose-100 text-rose-700",
};

export const STATUS_COLOR: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  waiting: "bg-amber-50 text-amber-700 border-amber-200",
  in_review: "bg-purple-50 text-purple-700 border-purple-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  deferred: "bg-neutral-100 text-neutral-600 border-neutral-200",
  awaiting_approval: "bg-orange-50 text-orange-700 border-orange-200",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  member: "Membro",
};

export const TRIGGER_LABEL: Record<string, string> = {
  task_created: "Tarefa criada",
  task_completed: "Tarefa concluída",
  status_changed: "Status alterado",
  assignee_changed: "Responsável alterado",
  due_passed: "Prazo vencido",
  comment_added: "Comentário adicionado",
  task_moved_project: "Tarefa movida de projeto",
};

export const ACTION_LABEL: Record<string, string> = {
  create_task: "Criar nova tarefa",
  assign_user: "Atribuir a usuário",
  change_status: "Mudar status",
  add_comment: "Adicionar comentário",
  notify_user: "Notificar usuário",
  create_payment: "Inserir pagamento",
  webhook: "Disparar webhook",
  add_tag: "Adicionar tag",
};
