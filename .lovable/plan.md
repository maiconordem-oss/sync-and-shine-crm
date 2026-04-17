
# CRM de Tarefas + Automações de Fluxo

Adiciono ao plano anterior um **motor de automações** que dispara ações quando eventos acontecem (ex.: tarefa concluída → cria nova tarefa para outro responsável, ou insere registro em pagamentos).

## Novo módulo: Automações

### Conceito
Cada automação tem três partes:
- **Gatilho (When)**: o que aconteceu.
- **Condições (If)**: filtros opcionais.
- **Ações (Then)**: o que executar (uma ou várias em sequência).

### Gatilhos suportados
- Tarefa criada
- Tarefa concluída
- Status alterado (de X para Y)
- Responsável alterado
- Prazo vencido
- Comentário adicionado
- Tarefa movida para projeto X

### Condições (filtros)
- Projeto = X
- Prioridade = alta/urgente
- Tag contém X
- Responsável = usuário X
- Campo personalizado = valor

### Ações suportadas
- **Criar nova tarefa** (com título/descrição template, responsável, prazo relativo "+3 dias", projeto, prioridade)
- **Atribuir a outro usuário**
- **Mudar status** da tarefa atual ou pai
- **Adicionar comentário automático**
- **Notificar usuário** (in-app)
- **Inserir registro em Pagamentos** (valor, descrição, beneficiário, status pendente, vínculo com a tarefa)
- **Webhook HTTP** (POST para URL externa com payload da tarefa) — para integrações futuras
- **Adicionar tag**

### Tabela de Pagamentos (novo)
Como há ação "inserir pagamento", crio módulo simples:
- Campos: descrição, valor, moeda (BRL), beneficiário (usuário ou texto livre), status (pendente/pago/cancelado), data prevista, data pagamento, tarefa_origem (FK opcional), projeto (FK opcional), criado_por, anexo comprovante.
- Página **Pagamentos** na sidebar com lista/filtros (status, período, beneficiário) e totais.
- Permissões: Admin/Gestor gerenciam; Membro vê apenas os próprios.

## UI das Automações
- Página **Automações** (sidebar, somente Admin/Gestor).
- Lista de automações com toggle ativar/desativar, contador de execuções, último disparo.
- Editor visual em 3 passos (Gatilho → Condições → Ações), com pré-visualização em linguagem natural:  
  *"Quando uma tarefa for concluída no projeto Vendas com tag 'fechamento', criar tarefa 'Emitir NF' para Financeiro com prazo +2 dias e inserir pagamento de R$ X em Pagamentos."*
- **Templates prontos**: "Tarefa concluída → próxima etapa", "Venda fechada → registrar pagamento", "Prazo vencido → notificar gestor".
- Aba **Histórico de execuções** por automação (sucesso/erro, payload, timestamp).

## Variáveis de template
Em títulos/descrições de ações, suporte a placeholders:
`{{tarefa.titulo}}`, `{{tarefa.responsavel}}`, `{{tarefa.projeto}}`, `{{tarefa.prazo}}`, `{{usuario.nome}}`, `{{data.hoje}}`, `{{data.hoje+3d}}`.

## Como o motor roda (técnico)
- Tabelas: `automations`, `automation_runs` (log).
- Engine implementado em **server functions** do TanStack Start, chamado a partir de hooks de mutação (criar/atualizar tarefa, comentar) — execução síncrona logo após a ação do usuário.
- Cada execução é registrada em `automation_runs` com status e payload, garantindo rastreabilidade.
- Proteção contra loop: limite de profundidade de encadeamento (máx. 5 ações em cascata por evento original).
- Erros não bloqueiam a ação do usuário; ficam registrados no histórico.

## Atualizações no plano original
- Sidebar ganha itens **Pagamentos** e **Automações**.
- Dashboard ganha card "Pagamentos pendentes" e "Automações executadas (7d)".
- Permissões: criar/editar automações = Admin/Gestor; ver histórico = mesmos papéis.

## Resumo do que muda
- Novo módulo Automações (engine + UI + templates + histórico).
- Novo módulo Pagamentos (tabela, página, permissões).
- Integração entre os dois via ação "Inserir pagamento".
- Tudo o mais do plano anterior permanece.
