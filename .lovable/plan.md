## Problema encontrado

As mensagens estão gravadas no banco, mas a tela do chat carrega apenas as **primeiras** mensagens por ordem crescente:

- `direct_messages` tem mais de 700 mensagens salvas.
- O código fazia `.order("created_at", { ascending: true }).limit(500)`.
- Isso trazia as 500 mensagens mais antigas, deixando as mensagens recentes fora do estado local.
- Quando a outra pessoa recebia em tempo real, via a mensagem. Ao atualizar a página, a busca inicial voltava para mensagens antigas e a mensagem recente “sumia” da tela.

## Melhorias necessárias

Atualizar `src/routes/_app.chat.tsx` para:

1. Buscar mensagens pela data **decrescente** no banco, com limite, e depois ordenar no frontend em ordem cronológica para exibição.
2. Aumentar o histórico geral de DMs carregado inicialmente de 500 para 1000.
3. Criar funções de sincronização reutilizáveis:
   - `loadRoomMessages`
   - `loadDirectMessages`
   - `loadDirectConversation`
4. Ao abrir uma conversa individual, buscar o histórico específico daquela conversa separadamente, garantindo que conversas antigas/recentes não fiquem cortadas pelo limite global.
5. Fazer merge por `id` nas mensagens recebidas por realtime e re-sincronizações, evitando duplicadas e evitando sobrescrever mensagens já recebidas localmente.
6. Manter o re-sync quando o canal realtime assinar novamente, mas usando merge em vez de substituir o estado por uma janela incompleta.
7. Adicionar logs/toasts de erro se a sincronização falhar, para não falhar silenciosamente.

## Arquivo a alterar

- `src/routes/_app.chat.tsx`

## Resultado esperado

Após atualizar a página, o chat passa a mostrar as mensagens mais recentes e o histórico correto da conversa aberta, em vez de parecer que mensagens enviadas desapareceram.