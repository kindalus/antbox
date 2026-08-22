# Plano: reutilização de conteúdo RAG e execução interna de agentes

## Objectivo

Corrigir dois comportamentos:

1. Ao reindexar um ficheiro que já tem embedding, reutilizar o conteúdo Markdown armazenado em vez
   de voltar a exportar o ficheiro para alterações apenas de metadados. Se uma alteração real do
   ficheiro exigir exportação e esta falhar, preservar o conteúdo anterior como fallback.
2. Permitir que actions confiáveis chamem agentes com `exposedToUsers: false`, mantendo esses
   agentes bloqueados nos endpoints HTTP públicos.

## Diagnóstico

- O auto-tag já lê `contentMd` através de `NodeService.getEmbeddingContents()`. A tentativa de
  exportação vem do `RAGService`, que reindexa todos os `NodeUpdatedEvent` como se o conteúdo
  binário tivesse mudado.
- O `RAGService` actualmente substitui conteúdo previamente extraído por metadata-only quando a
  exportação falha.
- As actions built-in chamam `agentsEngine.answer()`, que aplica a barreira pública
  `exposedToUsers`. O engine já fornece `runInternalAnswer()` para chamadas confiáveis, mas o
  `FeaturesEngine` não o usa.

## Decisões

### Conteúdo RAG

- O `contentMd` persistido com o embedding é o cache canónico da última extracção bem-sucedida.
- Em updates apenas de metadados, separar o corpo do frontmatter existente, reconstruir o Markdown
  com metadados actuais e reutilizar o corpo sem exportação nem OCR.
- Considerar que o conteúdo binário mudou quando o `NodeUpdatedEvent` inclui `size` em `newValues`.
  `updateFile()` inclui sempre esse campo, mesmo quando o tamanho não muda, através de `forceEvent`.
- Quando o conteúdo binário mudou, tentar exportação e OCR. Se falhar e existir Markdown anterior,
  manter o corpo anterior; usar metadata-only apenas quando não existe conteúdo anterior.
- Não alterar schemas nem formatos de base de dados.

### Agentes internos

- `exposedToUsers` continua a controlar somente chamadas públicas/directas.
- Actions passam a usar apenas `runInternalAnswer()`.
- A autorização da própria action (`exposeAction`, `runManually`, `groupsAllowed` e `runAs`)
  continua a ser a fronteira para chamadas indirectas.
- Não expor o interface interno aos handlers HTTP.

## Ordem de implementação

1. Adicionar extracção testada do corpo de `contentMd`.
2. Reutilizar conteúdo armazenado no fluxo de reindexação do RAG.
3. Ligar as actions ao método interno do engine.
4. Executar testes focados, suite completa e validação em produção após deploy.

As tarefas 1 e 3 podem ser implementadas em paralelo; a tarefa 2 depende da tarefa 1.

## Riscos e mitigação

| Risco                                                         | Mitigação                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Reutilizar conteúdo antigo após substituição real do ficheiro | Tentar sempre exportação/OCR quando o evento inclui `size`; conteúdo antigo é apenas fallback explícito. |
| Frontmatter conter texto semelhante ao delimitador            | Reconhecer apenas as linhas delimitadoras inicial e final do primeiro bloco YAML gerado pelo Antbox.     |
| Action pública contornar `exposedToUsers`                     | Manter as verificações de autorização da action e restringir `runInternalAnswer` ao executor interno.    |
| Regressão nos endpoints `/chat` e `/answer`                   | Manter testes que confirmam bloqueio público para agentes não expostos.                                  |

## Fora de âmbito

- Alterar a configuração `exposedToUsers` dos agentes built-in.
- Criar novos endpoints.
- Reprocessar retroactivamente embeddings metadata-only; poderão ser reindexados depois do deploy.
