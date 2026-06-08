## Objetivo
Adicionar/melhorar filtros de listagem em **Tarefas recorrentes** (`/recurring-tasks`) e em **Tarefas** (`/tasks`). Sem mudanças de lógica de negócio — apenas UI/filtragem no frontend.

## Tarefas recorrentes (`src/routes/_app.recurring-tasks.tsx`)
Hoje a lista não tem nenhum filtro. Adicionar barra de busca + filtros:

- **Busca** por título/descrição
- **Frequência**: Todas / Mensal / Semanal
- **Status**: Todas / Ativas / Inativas
- **Responsável**: Todos / lista de profiles
- **Projeto**: Todos / lista de projetos
- **Tipo**: Todos / Interna (CLT) / Externa (PJ)
- Botão **Limpar filtros** quando algum estiver ativo
- Contador "X de Y modelos" no header

Layout: mesmo padrão da página de Tarefas — barra com busca + botão "Filtros" que expande os selects em grid.

## Tarefas (`src/routes/_app.tasks.tsx`)
Já existe busca + filtros (status, projeto, responsável, prioridade). Acrescentar:

- **Tipo**: Todas / Interna / Externa
- **Vencimento**: Todas / Atrasadas / Hoje / Esta semana / Sem prazo
- **Tags**: multi-select com as tags existentes nas tarefas carregadas
- **Criadas em**: range de datas (de/até)
- Busca passa a considerar **título + descrição + tags**
- Salvar o estado dos filtros no `localStorage` para persistir entre navegações (chave por página)
- Chip visual mostrando filtros ativos com X para remover individualmente

## Fora do escopo
- Geração de recorrência, regras (feriados, datas de fim), ações em massa, novas colunas — ficam para outra rodada.
- Card "Pagamentos pendentes" da imagem — ignorado conforme confirmado.

## Arquivos a editar
- `src/routes/_app.recurring-tasks.tsx`
- `src/routes/_app.tasks.tsx`
