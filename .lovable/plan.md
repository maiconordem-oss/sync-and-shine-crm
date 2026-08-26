# Plano de melhorias — FlowCRM

## Resumo

Analisei o código, as migrations e as queries mais lentas do banco. O sistema já tem uma base sólida (tarefas, kanban, chat, pagamentos, automações, relatórios PJ), mas há gargalos de performance, risco de inconsistência financeira e oportunidades de UX que podem ser resolvidos em ciclos curtos. Proponho quatro frentes, priorizadas por impacto.

```text
Impacto alto  → Performance do banco + relatório PJ + automações server-side
Impacto médio → Notificações WhatsApp + UX mobile/busca
Impacto contínuo → Segurança, logs e governança
```

---

## 1. Performance do banco de dados (alto impacto)

Dados reais das queries mais lentas:

- `user_presence` upserts: 167.296 chamadas, 475s totais (média 2,84ms). Causa: heartbeat a cada 30s por usuário ativo.
- `tasks` query de atrasadas: 41.492 chamadas, 130s totais. Faltam índices compostos.
- `direct_messages`: 4.863 chamadas genéricas + 4.367 por conversa, média 15,8ms / 7,99ms. Faltam índices para `(sender_id, recipient_id, created_at)`.
- `attachments`: 365.260 chamadas filtrando `task_id` + `mime_type LIKE 'image/%'`. O `LIKE` impede o uso de índice parcial.

### Ações

1.1. Criar índices direcionados:
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_due
  ON public.tasks(assignee_id, status, due_date)
  WHERE status <> 'done';

CREATE INDEX IF NOT EXISTS idx_direct_messages_conv
  ON public.direct_messages(sender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_read
  ON public.direct_messages(recipient_id, read_at, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_task_image
  ON public.attachments(task_id, created_at)
  WHERE mime_type LIKE 'image/%';
```

1.2. Otimizar o heartbeat de presença:
- Aumentar o intervalo de 30s para 2 minutos.
- Trocar o `upsert` contínuo por atualização apenas quando o status realmente mudar (online → away → offline).
- Usar `sendBeacon` no `beforeunload` já existe; manter.

1.3. Substituir o `LIKE 'image/%'` no `useTaskThumbnail` por uma coluna booleana `is_image` ou um índice funcional, evitando full scan.

---

## 2. Correção do relatório PJ e consistência financeira (alto impacto)

Problemas identificados:

- A função `get_pj_tasks_for_report` ainda contém `is_admin_or_manager(auth.uid())` na cláusula `WHERE`, o que impede o próprio PJ de ver suas tarefas no relatório quando acessa `/reports`.
- O fechamento mensal mostra "Aguardando fechamento do mês", mas a lógica de `totalPaid` assume que, quando o fechamento está `paid`, todo o valor do mês já foi pago. Isso pode mascarar pagamentos parciais.
- Não há validação que impeça um admin de marcar como pago um fechamento cujo total diverge dos pagamentos registrados.

### Ações

2.1. Reescrever `get_pj_tasks_for_report` para permitir que o próprio PJ veja suas tarefas e gestores/admin vejam tudo:
```sql
USING (
  public.is_admin_or_manager(auth.uid())
  OR t.assignee_id = auth.uid()
)
```

2.2. Adicionar uma view/RPC `pj_monthly_summary` que cruze tarefas concluídas, pagamentos e fechamentos, expondo:
- Total de tarefas no mês.
- Soma de valores das tarefas.
- Soma dos pagamentos avulsos.
- Soma dos pagamentos vinculados a tarefas.
- Divergência entre "a pagar" e "pago".

2.3. No painel de fechamento, exibir alerta vermelho quando o valor pago não bater com o total do fechamento, impedindo marcar como pago sem justificativa.

2.4. Adicionar coluna `verified_by` e `verified_at` em `monthly_closures` para rastrear quem confirmou o fechamento.

---

## 3. Automações no servidor (alto impacto)

Hoje o motor de automações (`src/lib/automations.ts`) roda no cliente. Isso significa que, se o usuário fechar o navegador no momento da mudança de status, a automação não executa. Além disso, a deduplicação é feita apenas em memória (`_recentRuns`), não sobrevive a reloads e não funciona entre múltiplos dispositivos.

### Ações

3.1. Criar uma tabela de fila server-side:
```sql
CREATE TABLE public.automation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id),
  trigger_type text NOT NULL,
  task_id uuid REFERENCES public.tasks(id),
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  attempts int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX idx_automation_queue_pending ON public.automation_queue(status, created_at)
  WHERE status IN ('pending','error');
```

3.2. Substituir a execução client-side por inserção na fila. O cliente apenas enfileira; um cron do `pg_cron` (já habilitado para mensagens agendadas) processa as ações a cada minuto.

3.3. Implementar deduplicação persistente: ignorar fila se já existe item `done` para a mesma `automation_id + task_id + trigger_type` nos últimos 10 minutos.

3.4. Adicionar retry com backoff para itens `error` (até 3 tentativas).

---

## 4. Notificações fora do app (médio impacto)

O usuário solicitou alertas no WhatsApp para novas mensagens do chat e novas demandas. Hoje o sistema tem notificações in-app e notificações nativas do navegador, mas nenhum canal externo.

### Ações

4.1. Criar tabela de preferências de notificação:
```sql
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_number text,
  notify_chat boolean NOT NULL DEFAULT false,
  notify_task boolean NOT NULL DEFAULT false,
  notify_payment boolean NOT NULL DEFAULT false
);
```

4.2. Integrar com um gateway de WhatsApp (Evolution API, Z-API ou WhatsApp Business API). Recomendo começar com a Evolution API por ser self-hosted e ter custo baixo.

4.3. Criar uma server route `/api/public/whatsapp-webhook` para receber confirmações de entrega/leitura.

4.4. Adicionar um gatilho no banco (`NOTIFY`) ou enfileirar mensagens em uma tabela `whatsapp_outbox`, processada pelo cron junto com as automações.

4.5. Respeitar horário comercial: não enviar mensagens entre 20h e 8h, exceto para tarefas marcadas como urgente.

---

## 5. Melhorias de UX e qualidade de vida (médio impacto)

### 5.1. Busca global
- Hoje a busca usa `ilike '%termo%'` em tarefas, projetos e membros. Adicionar:
  - Busca por descrição de tarefa e tags.
  - Destaque do termo nos resultados.
  - Atalho `Cmd/Ctrl + K` já existe; adicionar `?` para ajuda de atalhos.

### 5.2. Kanban e listagem de tarefas
- Adicionar contador de itens por coluna no kanban.
- Permitir ordenar a lista por prazo, prioridade, data de criação.
- Salvar a visualização preferida (kanban/lista/calendário) no `localStorage`.

### 5.3. Detalhe da tarefa
- Exibir histórico de alterações (quem mudou status, responsável, prazo).
- Mostrar tempo total registrado em formato legível (horas:minutos).
- Adicionar botão "Duplicar tarefa".

### 5.4. Mobile
- A sidebar atual não colapsa bem em telas pequenas. Adicionar um drawer/bottom sheet para navegação mobile.
- O kanban não é scrollável horizontalmente em telas pequenas; garantir `overflow-x-auto` com snap.

---

## 6. Segurança e governança (impacto contínuo)

### Ações

6.1. Auditar RLS:
- `task_audit_log` permite `INSERT` por qualquer usuário autenticado (`WITH CHECK (true)`). Restringir a triggers/gatilhos ou a usuários envolvidos.
- `comments` ainda tem políticas antigas abertas em algumas migrations. Consolidar para o padrão v3 usado em `tasks`.

6.2. Adicionar rate limiting nas server routes públicas (webhooks) usando `RateLimiter` em memória ou KV.

6.3. Implementar soft delete para tarefas: ao invés de `DELETE`, marcar `deleted_at` e filtrar nas queries. Isso preserva histórico e evita perda acidental de dados financeiros.

6.4. Adicionar logs de auditoria para ações sensíveis: alteração de papel, exclusão de pagamento, mudança de contrato CLT/PJ.

---

## Detalhes técnicos

### Tecnologias já presentes
- TanStack Start + React 19 + Tailwind v4.
- Supabase (Postgres + Auth + Realtime + Storage).
- `pg_cron` já habilitado.

### O que será adicionado
- Novas migrations SQL para índices, tabelas de fila e preferências.
- Server routes para webhooks do WhatsApp.
- Refatoração de `src/lib/automations.ts` para usar fila server-side.
- Ajustes em `src/routes/_app.reports.tsx` e na RPC `get_pj_tasks_for_report`.
- Melhorias pontuais em `src/routes/_app.tasks.tsx`, `_app.tasks.$taskId.tsx` e `_app.chat.tsx`.

### Cronograma sugerido

| Semana | Entrega |
|--------|---------|
| 1 | Índices de banco + otimização de heartbeat + correção do relatório PJ |
| 2 | Fila server-side de automações + deduplicação persistente |
| 3 | Notificações WhatsApp (cadastro de número + gateway + envio) |
| 4 | UX mobile/busca + histórico de tarefa + soft delete |
| 5 | Revisão de RLS + auditoria + testes de regressão |

---

## Próximos passos

Preciso da sua decisão sobre:
1. Aprovar as 5 frentes de uma vez ou começar apenas pela performance + relatório PJ?
2. Qual gateway de WhatsApp prefere usar (Evolution API, Z-API, Twilio ou outro)?
3. Quer que eu implemente o soft delete de tarefas agora ou deixo para o ciclo de governança?
