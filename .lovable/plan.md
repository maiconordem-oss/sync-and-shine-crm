# Fase 1 — Performance + Relatório PJ

Escopo reduzido conforme pedido: apenas performance e relatório PJ. Tudo aditivo — nenhuma tarefa, pagamento, fechamento ou histórico será apagado ou alterado destrutivamente.

---

## O que eu verifiquei no banco (dados reais)

**Performance — as consultas mais pesadas hoje:**

| Consulta | Chamadas | Tempo total |
|---|---|---|
| Gravação de presença (online/ausente) | 167.296 | 475s |
| Tarefas atrasadas do usuário | 41.492 | 130s |
| Miniatura de imagem da tarefa | 365.260 | 49s |

Conferi os índices existentes: as conversas do chat **já estão indexadas** (`idx_dm_pair`, `idx_dm_recipient_unread`). Faltam índices para as duas outras consultas acima.

**Relatório PJ — encontrei registros que somem do relatório:**

- **10 tarefas externas canceladas** (R$ 18 a R$ 27 cada) não aparecem em nenhum mês, porque foram canceladas sem nunca ter tido data de conclusão registrada. É exatamente o caso que você relatou.
- **1 tarefa externa concluída de R$ 120** ("KIT 5 un e 10 un") está com status concluído, tem pagamento gerado, mas **não tem data de conclusão nem de aprovação** — então não entra em nenhum mês do relatório.
- Boa notícia: **nenhuma** tarefa externa concluída está sem pagamento gerado. E a permissão do relatório para o próprio PJ já está correta (ele consegue ver as próprias tarefas).

---

## 1. Performance

### 1.1 Reduzir gravações de presença (maior gargalo isolado)

Hoje o app grava a presença no banco a cada 30 segundos por usuário conectado, mesmo quando nada mudou. Isso gerou 167 mil gravações.

Mudanças em `src/lib/use-chat-global.ts`:
- Intervalo de verificação sobe de 30s para 2 minutos.
- Só grava no banco quando o status **realmente muda** (online → ausente → offline) ou a cada 10 minutos como "sinal de vida".
- Mantém a gravação imediata ao entrar e o `sendBeacon` ao fechar a aba.

Redução estimada: de ~120 gravações/hora por usuário para ~6.

### 1.2 Índices no banco (aditivo, não remove nada)

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_due_open
  ON public.tasks (assignee_id, due_date)
  WHERE status <> 'done' AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_task_image
  ON public.attachments (task_id, created_at)
  WHERE mime_type LIKE 'image/%';
```

Não vou recriar os índices de chat — já existem.

### 1.3 Reduzir chamadas de miniatura

`useTaskThumbnail` é chamado por cada card do kanban e do dashboard, cada um disparando sua própria consulta (365 mil chamadas). Mudança em `src/components/tasks/task-attachments.tsx`:
- Cache em memória por `taskId` durante a sessão, evitando refazer a consulta quando o mesmo card volta a renderizar.

---

## 2. Relatório PJ

### 2.1 Não deixar tarefa nenhuma "sumir" do relatório

A função `get_pj_tasks_for_report` hoje só encontra a tarefa se ela tiver data de conclusão ou de aprovação dentro do mês. As 11 tarefas listadas acima não têm nenhuma das duas, então desaparecem.

Vou reescrever a função para usar uma **data de referência com cascata**, sem alterar nenhum registro:

```
data de referência = conclusão → aprovação → cancelamento → criação
```

Assim toda tarefa externa relevante cai em algum mês. Nenhuma linha é editada; apenas a leitura muda.

A função também passa a retornar:
- A data de referência usada e qual campo a originou.
- Um marcador de "registro incompleto" quando a tarefa não tem data de conclusão própria.

### 2.2 Deixar claro na tela de onde vem cada valor

Em `src/routes/_app.reports.tsx`, na tabela de tarefas do mês (visão PJ e visão gestor):

- Coluna **"Base do mês"**: mostra se a tarefa entrou naquele mês pela conclusão, aprovação, cancelamento ou criação.
- Alerta âmbar em tarefas com registro incompleto: *"Sem data de conclusão registrada — considerada pela data de criação. Peça revisão ao gestor."*
- Alerta vermelho em tarefa cancelada que teve serviço executado, com o motivo do cancelamento visível.
- O mesmo passa a sair no PDF/impressão.

### 2.3 Painel de conferência do mês (gestor)

Um bloco de resumo no topo da visão do gestor, apenas leitura, cruzando três números do mesmo mês:

```text
Soma das tarefas externas .......... R$ X
Soma dos pagamentos vinculados ..... R$ Y
Pagamentos avulsos ................. R$ Z
Diferença (X - Y) .................. R$ D   ← destacado se ≠ 0
```

Quando houver diferença, lista quais tarefas causaram, com link direto para cada uma. Isso teria mostrado o problema deste mês no dia em que aconteceu.

### 2.4 Aviso antes de marcar o mês como pago

Ao clicar em "Marcar como pago" num fechamento cuja diferença não é zero, aparece uma confirmação explicando a divergência. O gestor ainda pode confirmar — nada é bloqueado, apenas fica explícito.

---

## Detalhes técnicos

**Arquivos alterados**
- `src/lib/use-chat-global.ts` — intervalo e gravação condicional de presença.
- `src/components/tasks/task-attachments.tsx` — cache de miniatura.
- `src/routes/_app.reports.tsx` — colunas, alertas, painel de conferência, impressão.

**Migration** (uma só, totalmente aditiva)
- Dois índices novos.
- `CREATE OR REPLACE` da função `get_pj_tasks_for_report` com as novas colunas de referência. Substituir a função não apaga dado algum; ela só lê.

**Garantia de preservação**
- Nenhum `DELETE`, nenhum `DROP TABLE`, nenhum `UPDATE` em tarefas, pagamentos ou fechamentos.
- As tarefas canceladas continuam canceladas e os pagamentos existentes continuam intactos — elas apenas passam a **aparecer** no relatório com o devido destaque.

**Fora deste escopo** (fica para depois, se você quiser): automações no servidor, alertas de WhatsApp, melhorias de UX/mobile e revisão geral de permissões.
