# Recuperação de senha que realmente funciona

## O problema encontrado

Hoje, quando alguém clica em "Esqueci minha senha", o e-mail chega com um link que
leva de volta para a tela de login. O sistema não tem **nenhuma tela para digitar a
senha nova** — o link só entra na conta automaticamente. Resultado: a pessoa acha
que "não funcionou", fecha a página, e continua sem saber a senha.

Observação: o projeto está pausado por falta de créditos no momento, então nenhum
e-mail está sendo enviado. Isso precisa ser resolvido também, senão o e-mail de
recuperação não chega mesmo depois do ajuste.

## O que vai ser feito

1. **Nova tela "Criar nova senha"**
   - O link do e-mail passa a abrir uma página própria com dois campos:
     nova senha e confirmação.
   - Valida tamanho mínimo e se as duas senhas são iguais.
   - Ao salvar, confirma com "Senha alterada!" e leva direto para o painel.
   - Se o link estiver vencido ou já usado, mostra aviso claro com botão para
     pedir um novo e-mail (em vez de tela em branco).

2. **Ajuste na tela de login**
   - O e-mail de recuperação passa a apontar para a nova tela.
   - Mensagem de confirmação mais clara: avisa para conferir também a caixa de spam
     e que o link vale por tempo limitado.

3. **Ajuda para o Admin**
   - Na página de Membros, o Admin ganha a opção "Enviar link de redefinição"
     para um usuário que não está conseguindo sozinho.

## Detalhes técnicos

- Nova rota pública `src/routes/reset-password.tsx`: detecta `type=recovery`
  no hash/query, aguarda a sessão de recuperação via `onAuthStateChange`,
  chama `supabase.auth.updateUser({ password })` (sem `current_password`,
  pois é sessão de recuperação).
- `src/routes/auth.tsx`: `resetPasswordForEmail` com
  `redirectTo: ${window.location.origin}/reset-password`.
- `src/routes/_app.members.tsx`: ação de admin chamando `resetPasswordForEmail`
  para o e-mail do membro.
- Nada é removido; todas as telas atuais continuam iguais.

## Sobre a conexão com o Banco Inter (assunto anterior)

Fica para uma etapa seguinte. Resumo do que apurei: a API oficial do Inter exige
certificado digital (mTLS), que este ambiente não suporta com segurança. O caminho
viável é usar um intermediário de pagamentos (Asaas, Cora, Efi) que envia PIX por
chave de API simples e pode movimentar a conta Inter. Posso detalhar num plano
próprio quando você quiser.
