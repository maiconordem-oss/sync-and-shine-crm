# Chat estilo MSN

Transformar o chat atual (sala única) num messenger com conversas individuais, status online, sons e o clássico "chamar atenção" que treme a tela.

## O que muda na experiência

- **Lista de contatos** à esquerda (igual MSN): todos os membros da equipe, com bolinha de status (online/ausente/offline), última mensagem e contador de não lidas.
- **Conversa individual** à direita ao clicar num contato. O chat global atual vira a aba "Sala geral" no topo da lista.
- **Status de presença**: online (ativo agora), ausente (5 min sem interagir), offline. Atualiza em tempo real.
- **"Está digitando…"** aparece embaixo da conversa quando o outro está escrevendo.
- **Chamar atenção (nudge)**: botão de sino na conversa. Ao clicar:
  - Toca um som forte (estilo "nudge" do MSN).
  - A janela do destinatário treme por ~1s (shake na tela inteira).
  - Aparece uma mensagem no chat tipo "Fulano chamou sua atenção".
  - Toast notificando.
  - Limite: 1 nudge a cada 10s para não virar spam.
- **Sons**:
  - Mensagem recebida → som suave de "ding".
  - Sua mensagem enviada → som curtinho de "swoosh".
  - Nudge recebido → som alto + tremida.
  - Contato ficou online → som discreto (opcional, ligado por padrão).
  - Todos respeitam o botão de volume já existente no header.
- **Notificações não lidas**: badge no menu lateral do app (no item "Chat") com total de mensagens não lidas em todas as conversas.
- **Notificação de navegador** opcional quando a aba não está ativa.

## Layout

```text
┌──────────────────────────────────────────────────────┐
│  Chat                                                │
├──────────────┬───────────────────────────────────────┤
│ # Sala geral │  João Silva           🟢 online       │
│              │  ─────────────────────────────────    │
│ 🟢 João   2  │                                       │
│ 🟡 Maria     │  oi, tudo bem?              10:32     │
│ ⚫ Pedro     │                                       │
│ 🟢 Ana    1  │              tudo, e você?  10:33     │
│              │                                       │
│              │  está digitando…                      │
│              │  ─────────────────────────────────    │
│              │  [😀] [📎] mensagem...    [🔔] [➤]   │
└──────────────┴───────────────────────────────────────┘
```

## Detalhes técnicos

**Banco (nova migração):**
- `direct_messages` (sender_id, recipient_id, content, created_at, read_at, kind: 'text' | 'nudge').
- `user_presence` (user_id PK, status: 'online'|'away'|'offline', last_seen_at).
- Índice em `(sender_id, recipient_id, created_at)` para histórico rápido.
- RLS: só vê mensagens onde for sender ou recipient; só envia como si mesmo.
- Realtime habilitado em `direct_messages` e `user_presence`.

**Frontend (`src/routes/_app.chat.tsx`):**
- Reescrever com layout em 2 colunas. Sala geral preservada (usa `chat_messages` atual).
- Hook `usePresence`: faz upsert `online` ao montar, `away` após 5 min sem atividade, `offline` no `beforeunload`. Heartbeat a cada 30s.
- "Digitando": canal Supabase Realtime broadcast (efêmero, sem gravar no DB), debounce 2s.
- Nudge: insere mensagem `kind='nudge'`. Receptor escuta INSERT, toca som, aplica classe `animate-shake` no `<body>` por 1s.
- Sons novos em `src/lib/use-sound.ts`: `dm_received`, `dm_sent`, `nudge`, `contact_online`.
- Keyframe `shake` em `src/styles.css` (translate X/Y rápido).

**Menu lateral (`src/routes/_app.tsx`):** badge com contador de DMs não lidas (count de `direct_messages` onde `recipient_id = me AND read_at IS NULL`).

**Permissões:** todos os membros podem conversar com todos. Sem restrição por papel (admin pode apagar mensagens dele igual hoje).

## Fora de escopo (posso fazer depois se quiser)

- Envio de arquivos/imagens na DM.
- Emojis animados / "winks" do MSN.
- Chamadas de voz/vídeo.
- Histórico exportável.

Confirma que é isso que você quer? Se sim, eu já mando a migração e implemento.
