
# Chat MSN — fase 2: presença global, nudge em qualquer aba e anexos

Hoje o "chamar atenção", o som e o status só funcionam quando você está com a página `/chat` aberta. A ideia é levar tudo isso para o layout do app, e além disso permitir envio de mídia nas DMs.

## O que muda na experiência

### 1. Presença e DMs ficam globais (vivem no `_app.tsx`, não só no `/chat`)
- Assim que você loga, seu status vira **online** automaticamente, em qualquer página (Dashboard, Tarefas, Relatórios…).
- Heartbeat a cada 30s + "ausente" após 5 min sem mexer + "offline" ao fechar a aba — sempre, não só dentro do chat.
- O item **Chat** no menu lateral ganha:
  - Bolinha verde/amarela/cinza ao lado do ícone mostrando **seu próprio** status (pode clicar pra alternar online/ausente manualmente).
  - **Badge vermelho** com o total de DMs não lidas (já tem pra notificações, faltava pra DMs).

### 2. Nudge funciona em qualquer tela
- Você pode estar na tela de Relatórios e mesmo assim:
  - **Toca o som forte** do nudge.
  - **A tela inteira treme** (~1s, animação no `<body>`).
  - **Toast** "Fulano chamou sua atenção" com botão "Abrir conversa" → leva direto pro `/chat` com aquele contato.
  - Se a aba estiver em segundo plano: **título da aba pisca** ("💬 Fulano te chamou!") até você voltar, e dispara uma **notificação nativa do navegador** (com permissão).
- O mesmo vale pra DMs normais recebidas: som suave + toast + badge + título piscando se estiver em outra aba.

### 3. Envio de mídia nas DMs
Caixa de mensagem ganha botões:
- 📎 **Anexar arquivo** (qualquer tipo, até 20MB).
- 🖼️ **Foto** (abre seletor de imagem; preview antes de enviar).
- 🎤 **Gravar áudio** (segura pra gravar, solta pra enviar — estilo WhatsApp; usa `MediaRecorder`).
- 🎬 **Vídeo** (upload de arquivo de vídeo; gravação fica fora de escopo agora).

Na conversa:
- Imagem → renderiza inline, clica abre em tela cheia.
- Áudio → player com play/pause e duração.
- Vídeo → player nativo.
- Arquivo genérico → card com nome, tamanho e botão de download.

## Detalhes técnicos

**Banco (nova migração):**
- `direct_messages` ganha colunas: `attachment_url TEXT`, `attachment_type TEXT` ('image'|'audio'|'video'|'file'), `attachment_name TEXT`, `attachment_size BIGINT`, `attachment_mime TEXT`.
- `kind` passa a aceitar `'attachment'` (mensagem onde o conteúdo principal é a mídia).
- Novo bucket `chat-attachments` (privado), com policies:
  - INSERT: usuário autenticado pode subir em `{auth.uid()}/...`.
  - SELECT: só sender ou recipient da DM associada (via path convention `{sender_id}/{recipient_id}/{filename}`).

**Frontend — refactor de presença e DM listener pra `_app.tsx`:**
- Novo hook `usePresenceGlobal()` montado no `_app.tsx`: heartbeat, idle, beforeunload. Sai do `_app.chat.tsx`.
- Novo hook `useDirectMessageListener()` também no `_app.tsx`:
  - Subscreve `direct_messages` onde `recipient_id = me`.
  - Mantém contador de não lidas → expõe via context pra sidebar mostrar o badge.
  - Em INSERT:
    - Toca som (`dm_received` ou `nudge`).
    - Se `kind === 'nudge'`: adiciona `animate-shake` no `<body>` por 1s.
    - Toast com action "Abrir conversa" → `navigate({ to: '/chat', search: { with: senderId } })`.
    - Se `document.hidden`: começa a piscar `document.title` (interval que alterna entre título original e "💬 Fulano…"), para quando `visibilitychange` voltar.
    - Se permissão concedida: `new Notification(...)`.
- `/chat` lê o param `?with=<userId>` pra abrir a conversa direto.
- Pedir permissão de notificação na primeira vez que o usuário ativa som (não no load).

**Sidebar (`_app.tsx`):**
- Bolinha de status no item "Chat" lendo a row própria de `user_presence`.
- Badge de DMs não lidas vindo do context.

**Componentes novos:**
- `src/components/chat/attachment-uploader.tsx`: lida com seleção/preview/upload pro bucket.
- `src/components/chat/audio-recorder.tsx`: usa `MediaRecorder`, gera blob `audio/webm`, mostra waveform simples ou só duração.
- `src/components/chat/message-attachment.tsx`: renderiza inline conforme `attachment_type`.

**`src/styles.css`:** keyframe `nudge-shake` já existe; garantir que aplica no `<body>` e não só num container do chat.

## Fora de escopo (deixo pra depois se quiser)

- Gravação de vídeo direto no navegador (só upload por enquanto).
- Compressão de imagem/vídeo no cliente.
- Transcrição automática de áudio.
- Mensagens encaminhadas, resposta com citação, edição.
- Indicador "visto às HH:MM" (já temos `read_at`, mas não exibimos por mensagem).
- Reações com emoji.

Confirma que é isso? Se sim eu já mando a migração + bucket e implemento.
