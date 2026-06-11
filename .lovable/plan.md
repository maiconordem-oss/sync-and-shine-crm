## Problema

O preview do link (quando não há imagem anexada) usa `api.microlink.io` em modo screenshot. Para sites como Mercado Livre, esse modo:

- Exige plano pago do microlink para screenshot real (sem chave costuma falhar/retornar placeholder).
- É bloqueado por anti-bot do ML, então a imagem nunca renderiza.

## Solução

Usar a API pública do microlink (gratuita, sem chave) para extrair o **og:image** da página em vez de tirar screenshot. Praticamente todo produto do ML tem `og:image` com a foto do anúncio, então o preview vai mostrar a foto real do produto.

Fluxo do hook `useTaskThumbnail` em `src/components/tasks/task-attachments.tsx`:

1. Se a tarefa tem anexo de imagem → usa o anexo (como hoje).
2. Senão, se tem link:
   - Faz `fetch("https://api.microlink.io/?url=<link>")` (JSON, sem chave).
   - Lê `data.image.url` (og:image) ou `data.logo.url` como fallback.
   - Se nada disso existir, cai para o screenshot embed atual como último recurso.
3. Cancelamento mantido com flag `canceled` para evitar setState após unmount.

## Arquivos

- `src/components/tasks/task-attachments.tsx` — atualizar o hook `useTaskThumbnail` para buscar og:image via microlink JSON antes de tentar screenshot.

## Notas técnicas

- A API pública do microlink tem rate limit baixo (~50 req/dia por IP). Para um CRM interno isso costuma bastar; se virar gargalo, o próximo passo seria cachear o resultado em uma coluna nova `task_links.preview_image_url` populada via server function. Fora do escopo desta correção.
- Sem mudanças de schema, sem migrations.
