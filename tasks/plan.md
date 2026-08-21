# Plano: cobertura de regressão de nodes

## Estado

Implementado e verificado.

## Objetivo

Acrescentar testes comportamentais nos contratos públicos de `src/application/nodes` sem duplicar a
cobertura existente. Alterar produção apenas quando um teste demonstrar uma falha real de correção
ou autorização.

## Decisões

- Testar `NodeService`, `NodeServiceProxy` e as funções públicas de `node_markdown.ts`.
- Exercitar pesquisa apenas através de `NodeService.find`, não através do `FindService` interno.
- Usar adapters in-memory e observar resultados públicos, eventos e estado recuperado pelo serviço.
- Não criar helpers partilhados até existir repetição que os justifique.

## Etapas

1. Cobrir navegação, ACL de breadcrumbs, conteúdo de embeddings, ordenação e pesquisa textual.
2. Cobrir consistência entre repositório, storage, eventos e campos de workflow.
3. Cobrir lock e unlock recursivos de pastas.
4. Cobrir a fronteira de segurança do `NodeServiceProxy`.
5. Cobrir serialização Markdown usada pelos embeddings.
6. Executar suite completa, lint, type-check e autoreview.

## Riscos

- `breadcrumbs` não usa atualmente o contexto de autenticação. Se o teste confirmar fuga de
  metadados, será aplicada a menor correção no `NodeService`.
- Testes de eventos são assíncronos. Será usado o mesmo padrão de sincronização já presente no
  repositório.
- Os ficheiros de testes existentes já são grandes. Novos grupos independentes ficarão em ficheiros
  próprios.
