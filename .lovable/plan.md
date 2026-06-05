## Problema identificado

A função `get_pj_tasks_for_report` no banco tem uma trava que impede o próprio PJ de ler suas tarefas:

```
AND is_admin_or_manager(auth.uid())
```

Como o PJ não é admin/manager, a função **sempre retorna vazio** para ele — por isso não aparece nenhuma tarefa concluída, nem do mês atual nem dos anteriores. Mesmo navegando pelo seletor de mês, vem zerado.

Além disso, hoje a tabela do PJ mostra só: ID, Título, Criada, Concluída, Valor, Status. Falta o contexto que ajuda a identificar "de qual tarefa é esse valor".

## Solução proposta

### 1. Banco (migration)

Ajustar a função `get_pj_tasks_for_report` para que:
- Admin/manager continue vendo todos os PJs (comportamento atual).
- O próprio PJ veja **as próprias tarefas externas** concluídas ou canceladas-com-execução do período.
- A função passe a retornar campos extras úteis: `description`, `due_date`, `project_id`, `project_name`, `project_color`.

Filtro de período continua: tarefa entra no mês em que foi `completed_at` (ou `approved_at`).

### 2. Tela do PJ (`src/routes/_app.reports.tsx` → `PJView`)

- Continuar usando o seletor de mês (já existe) — agora vai funcionar de verdade para meses passados e atuais.
- Tabela "Tarefas do mês" com colunas novas e mais claras:
  - **#ID** (clique copia o UUID completo) — já existe
  - **Tarefa** — título + projeto (bolinha colorida + nome) + tags se houver — facilita identificar
  - **Descrição** — primeiras linhas, expansível ao clicar
  - **Criada em** / **Concluída em** — já existem
  - **Vencimento** — nova coluna
  - **Valor** — já existe
  - **Status** — Cancelada / ✓ Pago / ⏳ Aguardando fechamento
- Cada linha vira clicável/expansível para ver: descrição completa, motivo de cancelamento (se houver), data de aprovação, e a "trilha" do pagamento (criado em / vencimento / status do fechamento do mês).
- Card de resumo no topo continua igual (Tarefas / A receber / Pago / Total).
- Botão "Imprimir / PDF" passa a incluir as novas colunas (projeto, descrição curta, vencimento) no documento gerado.

### 3. Histórico acessível

A seção "Histórico de fechamentos" já existe e permite clicar "Ver" para abrir o mês. Vou reforçar com um texto curto explicando: "Clique em 'Ver' para abrir o relatório daquele mês com todas as tarefas executadas".

## O que NÃO muda

- Regras de pagamento e fechamento mensal continuam iguais.
- View do admin/manager continua igual (só ganha os campos extras na tabela quando expandir um PJ — opcional, posso manter como está se preferir).
- PJ continua sem poder editar nada (somente leitura).

## Arquivos afetados

- Nova migration: ajuste de `public.get_pj_tasks_for_report` (assinatura nova com campos extras).
- `src/routes/_app.reports.tsx`: atualizar interface `TaskRow`, query, tabela do PJ, e HTML de impressão.
- `src/integrations/supabase/types.ts`: regenerado automaticamente após a migration.

Posso seguir?
