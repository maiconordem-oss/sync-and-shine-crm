# Corrigir retorno indevido à tela de login

## Objetivo
Garantir que, após informar credenciais válidas, a sessão permaneça ativa e o usuário acesse o painel sem ser devolvido à tela de entrada.

## Implementação
- Evitar que a verificação inicial de sessão sobrescreva um login concluído enquanto a página ainda está carregando.
- Atualizar a sessão imediatamente com o resultado confirmado do login.
- Manter o estado de carregamento consistente durante entrada, saída e restauração da sessão.
- Exibir uma mensagem clara caso a entrada seja aceita, mas a sessão não possa ser confirmada.

## Validação
- Conferir a tipagem do projeto.
- Testar no navegador a permanência da sessão e o acesso ao painel.
- Preservar usuários, dados e demais telas existentes.
