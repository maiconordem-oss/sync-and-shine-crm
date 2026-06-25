## Correções no Chat — persistência das mensagens

**Problema:** Após dar refresh, mensagens recebidas somem da tela mesmo estando salvas no banco.

**Causa raiz identificada:**
1. O `useEffect` de carga inicial roda em paralelo com o `useEffect` do realtime. O callback `SUBSCRIBED` do realtime sobrescreve `roomMsgs` com `LIMIT 200` ordenado ASC — mas a carga inicial faz o mesmo. Se uma INSERT chegar entre os dois fetches, o segundo fetch pode rodar antes do INSERT ser persistido em replica e a mensagem "some" até o próximo evento.
2. Pior: o fetch dos DMs no carregamento inicial não filtra por par de conversa e tem `LIMIT 500`, então em contas com muito histórico (já temos 761 DMs no banco) **as mensagens mais antigas são cortadas** e, ao trocar de conversa, parecem ter desaparecido.
3. O re-sync no `SUBSCRIBED` substitui o array inteiro em vez de fazer merge, descartando mensagens otimistas ainda não confirmadas.
4. Não há refetch quando a aba volta ao foco (`visibilitychange`), então conexões realtime caídas em background nunca se recuperam até refresh manual.

### Mudanças em `src/routes/_app.chat.tsx`

1. **DMs paginados por conversa, não global:**
   - Remover o fetch global de 500 DMs no load inicial.
   - Buscar DMs sob demanda quando o usuário abre uma conversa (`selectedPeer`), com `LIMIT 200` filtrando `(sender,recipient)` do par.
   - Manter um cache `Record<peerId, DirectMessage[]>` para evitar refetch ao alternar.

2. **Merge em vez de replace nos re-syncs:**
   - Trocar `setRoomMsgs(data)` por uma função de merge que: mantém mensagens otimistas (id temporário), deduplica por id real, e preserva ordem por `created_at`.
   - Mesma lógica para DMs.

3. **Refetch ao voltar foco / reconectar:**
   - Adicionar listener `document.visibilitychange` → quando `visible`, refazer fetch da sala atual e da conversa aberta.
   - Adicionar listener `window.online` com a mesma ação.

4. **Subscription robusta:**
   - Tratar status `CHANNEL_ERROR` e `TIMED_OUT` chamando `supabase.removeChannel` + recriar canal (backoff simples 2s).
   - Garantir que o canal de DMs use filtro por `recipient_id=eq.${user.id}` E um segundo handler para `sender_id=eq.${user.id}` (mensagens próprias enviadas em outro dispositivo).

5. **Carga inicial determinística:**
   - Fazer o fetch inicial da sala APÓS o `subscribe` confirmar, eliminando a corrida entre os dois `useEffect`.

### Verificação
- Abrir o chat, enviar mensagem, dar F5 → mensagem deve continuar visível.
- Abrir DM antiga (>200 mensagens atrás) → histórico carrega ao rolar.
- Minimizar a aba por 1 minuto, voltar → mensagens recebidas no intervalo aparecem.
- Console sem warnings de canal duplicado.

Sem mudanças de schema nem de RLS.
