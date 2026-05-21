Vou implementar as 5 melhorias no chat de forma incremental, sem mexer no layout atual e sem remover funcionalidades existentes.

## 1. Responder a uma mensagem específica (estilo WhatsApp)

**Banco:**
- Adicionar coluna `reply_to_id uuid` em `direct_messages` e em `chat_messages` (auto-referência, `ON DELETE SET NULL`).

**Frontend (`src/routes/_app.chat.tsx`):**
- Estado `replyTo: { id, authorName, preview, kind } | null`.
- Em cada balão (DM e sala), botão "Responder" aparece no hover (ícone reply do lucide).
- Acima do `Textarea`, mostra uma "barra de citação" com nome do autor + trecho (até 80 caracteres) e botão X para cancelar.
- Ao enviar, incluir `reply_to_id` no insert.
- Renderizar dentro do balão um bloco citado clicável (borda lateral colorida + nome + preview). Clique chama `scrollIntoView` no balão original e aplica classe temporária `ring-2 ring-primary` por ~1,5s.
- IDs dos balões: `id={"msg-" + m.id}` para localizar via `document.getElementById`.

## 2. Status de leitura (Enviada / Entregue / Lida)

**Banco:**
- Adicionar `delivered_at timestamptz` em `direct_messages`.

**Frontend:**
- Quando o listener global recebe um INSERT para `recipient_id = me`, marcar `delivered_at = now()` (UPDATE em lote).
- A lógica atual de "marcar lida ao abrir conversa" já zera o contador (já funciona). Garantir que isso aconteça também quando a aba volta ao foco com a conversa aberta.
- No balão das próprias mensagens enviadas: ícone de status à direita do horário:
  - `Check` cinza = enviada (sem `delivered_at`)
  - `CheckCheck` cinza = entregue
  - `CheckCheck` azul = lida (`read_at` preenchido)
- Sala geral: não tem status individual (continua igual).

## 3. Colar imagem (Ctrl+V) no campo de mensagem

**Frontend:**
- Listener `onPaste` no `Textarea`: se `e.clipboardData.items` contiver `image/*`, capturar o blob.
- Mostrar prévia inline acima do textarea (thumbnail + botão X para descartar + botão "Enviar imagem").
- Ao enviar, reusar `sendAttachment(blob, "colado-<timestamp>.png", "image")`.
- Funciona apenas em DM (mesma regra atual de anexos); em sala geral mostra toast informativo.

## 4. Corrigir áudio e vídeo

**Diagnóstico provável:** o caminho de upload em `sendAttachment` (linha 287) faz concatenação frágil com `replace(/\.+$/, "")` que pode gerar paths inválidos para blobs sem nome de arquivo (áudio gravado). Além disso o `MessageAttachment` usa `createSignedUrl` toda hora, sem cache, podendo expirar.

**Correções:**
- Refatorar geração de path: `${user.id}/${peer}/${timestamp}-${random}.${ext}` com `ext` determinado por `type` (audio→webm, video→mp4/webm, image→jpg/png) ou extensão original sanitizada.
- Garantir `contentType` correto (audio/webm para gravações).
- No `MessageAttachment`: cachear URL assinada por `path` em memória (Map) com TTL e renovar antes de expirar.
- Adicionar atributos `playsInline preload="metadata"` nos elementos `<audio>` e `<video>` para evitar problemas em mobile/Safari.
- Pré-visualização antes de enviar para arquivos selecionados via botão de imagem/anexo (mesma barra de prévia do item 3, generalizada para qualquer mídia).

## 5. Agendamento de mensagens (somente admin)

**Banco — nova tabela `scheduled_messages`:**
- Campos: `id`, `created_by` (admin), `target_kind` (`'user' | 'room' | 'all'`), `target_user_id` (nullable), `content`, `recurrence` (`'once' | 'daily' | 'weekly' | 'weekdays'`), `scheduled_at timestamptz` (próxima execução), `time_of_day time` (para recorrentes), `days_of_week int[]` (para weekly), `status` (`'active' | 'paused' | 'cancelled' | 'done'`), `last_run_at`, `run_count`.
- RLS: somente admin (`has_role(uid, 'admin')`) pode SELECT/INSERT/UPDATE/DELETE.

**Execução — pg_cron + função SQL** (executar a cada minuto):
- Função `public.dispatch_scheduled_messages()` (SECURITY DEFINER):
  - Seleciona registros `active` com `scheduled_at <= now()`.
  - Para `target_kind='user'`: insere em `direct_messages` (sender = `created_by`, recipient = `target_user_id`).
  - Para `target_kind='room'` ou `'all'`: insere em `chat_messages` (author = `created_by`).
  - Atualiza `last_run_at`, `run_count`. Calcula próximo `scheduled_at` conforme `recurrence` (ou marca `done` se `once`).
- `pg_cron`: `select cron.schedule('dispatch-scheduled-msgs', '* * * * *', $$ select public.dispatch_scheduled_messages(); $$);`

**Frontend — nova página `src/routes/_app.scheduled-messages.tsx`:**
- Visível somente para admins (link no sidebar com guard); rota com redirect se não-admin.
- Lista de agendamentos com colunas: destinatário, conteúdo (trecho), próxima execução, recorrência, status.
- Ações por linha: editar, pausar/retomar, cancelar, excluir.
- Botão "Novo agendamento": dialog com seletor de destinatário (usuário / sala geral / todos = sala geral), data + hora, recorrência, textarea de mensagem.

## Detalhes técnicos

**Ordem de implementação (incremental, validável passo a passo):**
1. Migração #1: `reply_to_id` + `delivered_at` (itens 1 e 2).
2. UI de responder + status de leitura.
3. Paste de imagem + correções de áudio/vídeo.
4. Migração #2: tabela `scheduled_messages` + função + cron.
5. Página de agendamento.

**Arquivos a alterar:**
- `src/routes/_app.chat.tsx` — adições para itens 1, 2, 3, 4 (sem reescrever).
- `src/components/chat/message-attachment.tsx` — cache de URL assinada, atributos de player.
- `src/lib/use-chat-global.ts` — marcar `delivered_at` no listener global.
- `src/routes/_app.tsx` — link "Mensagens agendadas" no menu (apenas admin).
- `src/routes/_app.scheduled-messages.tsx` — nova página.
- Migrations: 2 migrações SQL.

**Riscos / não escopo:**
- Não vou reescrever o layout existente.
- Recorrência limitada a `once | daily | weekly | weekdays` (como pedido). Sem fuso-horário customizável (usa `timezone` do banco — America/Sao_Paulo por padrão do projeto).
- "Todos os funcionários" será mapeado para uma mensagem na Sala geral (evita explosão de N DMs); se preferir leque de DMs individuais, ajusto.

Confirma este plano para eu implementar?
