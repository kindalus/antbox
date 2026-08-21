# Cobertura de regressão de nodes

## 1. Leitura e navegação

- [x] Cobrir breadcrumbs ordenados, inexistência e ACL.
- [x] Cobrir conteúdos de embeddings com autorização.
- [x] Cobrir ordenação de list e pesquisa textual/paginada.
- [x] Executar testes focados e autoreview.

## 2. Consistência das mutações

- [x] Cobrir rollback de createFile e ausência de evento em falha.
- [x] Cobrir persistência de URL CDN.
- [x] Cobrir falha de storage em delete e ausência de evento.
- [x] Cobrir proteção dos campos e operações de workflow.
- [x] Executar testes focados e autoreview.

## 3. Bloqueio recursivo

- [x] Cobrir lock de descendentes pelo utilizador de sistema.
- [x] Cobrir rejeição de unlock direto.
- [x] Cobrir unlock recursivo sem remover locks independentes.
- [x] Executar testes focados e autoreview.

## 4. NodeServiceProxy

- [x] Cobrir binding e cópia defensiva do contexto.
- [x] Cobrir indisponibilidade de RAG.
- [x] Cobrir filtragem ACL de resultados semânticos.
- [x] Executar testes focados e autoreview.

## 5. Markdown

- [x] Cobrir filtragem YAML e frontmatter com e sem corpo.
- [x] Executar testes focados e autoreview.

## Verificação final

- [x] `deno fmt --check`
- [x] `deno lint`
- [x] `deno check main.ts`
- [x] `deno task test`
- [x] `deno task build:antbox`
- [x] Autoreview final do diff.
