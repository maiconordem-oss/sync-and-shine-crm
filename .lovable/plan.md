## Diagnóstico

Encontrei dois problemas principais no chat:

1. **Nenhum arquivo é enviado como mensagem**
   - O upload no armazenamento acontece, mas a mensagem não entra na conversa porque o banco ainda tem uma regra antiga que só permite `kind = 'text'` ou `kind = 'nudge'`.
   - O código tenta gravar `kind = 'attachment'`, então a criação da mensagem falha. Por isso nenhum tipo de arquivo aparece funcionando.

2. **Status de leitura/entrega não atualiza**
   - As colunas `delivered_at` e `read_at` existem, mas os registros recentes continuam com esses campos vazios.
   - A atualização depende do listener global/local e pode falhar silenciosamente ou não refletir na tela se o estado local não for sincronizado após marcar como lido.
   - O contador de não lidas também depende desse mesmo campo, então se `read_at` não atualiza, o badge não apaga.

## Plano de correção

### 1. Corrigir suporte real a anexos
- Atualizar a regra do banco em `direct_messages` para permitir também `kind = 'attachment'`.
- Manter os anexos privados no bucket atual `chat-attachments`.
- Preservar o layout e a lógica já criada para imagem, áudio, vídeo e arquivo.

### 2. Tornar o envio de arquivo mais confiável
- Ajustar o tratamento de erro no envio para exibir uma mensagem clara quando a criação da mensagem falhar após o upload.
- Se o upload funcionar mas a mensagem falhar, remover o arquivo recém-enviado para evitar lixo no armazenamento.
- Garantir que o áudio gravado continue usando `audio/webm` e que vídeos/imagens preservem o MIME correto.

### 3. Corrigir confirmação de entrega e leitura
- Ao receber uma DM nova, marcar `delivered_at` como agora.
- Ao abrir uma conversa, marcar as mensagens recebidas daquela pessoa como `read_at` imediatamente.
- Atualizar o estado local depois do `UPDATE`, para o badge sumir e os ícones mudarem sem depender só do realtime.
- Recalcular a contagem global de não lidas após mensagens serem marcadas como lidas.

### 4. Melhorar sincronização em tempo real
- Manter `direct_messages` no Realtime, que já está habilitado.
- Garantir que o listener local reflita `INSERT`, `UPDATE` e `DELETE` corretamente.
- Revalidar o fluxo: enviada → entregue → lida.

### 5. Validação final
- Conferir no banco que mensagens com `kind = 'attachment'` estão sendo criadas.
- Conferir que `delivered_at` e `read_at` passam a preencher.
- Verificar que o contador de não lidas apaga quando a conversa é aberta.

## Arquivos/áreas a alterar

- Migração do banco: regra de `kind` em `direct_messages`.
- `src/routes/_app.chat.tsx`: envio de anexos e marcação local de leitura.
- `src/lib/use-chat-global.ts`: entrega/contagem global de não lidas.

Não vou refazer o layout nem remover funcionalidades existentes.