# Reutilização de conteúdo RAG e execução interna de agentes

## 1. Extrair o corpo do Markdown de embedding

**Descrição:** Adicionar ao módulo de Markdown um helper mínimo que remova apenas o primeiro bloco
de frontmatter gerado por `toEmbeddingMarkdown()` e devolva o corpo armazenado.

**Critérios de aceitação:**

- [ ] Markdown com frontmatter e corpo devolve o corpo sem o delimitador YAML.
- [ ] Markdown metadata-only devolve corpo vazio.
- [ ] Conteúdo com `---` no corpo não é truncado.

**Verificação:**

- [ ] `deno test --allow-all --unstable-raw-imports src/application/nodes/node_markdown_test.ts`

**Dependências:** Nenhuma.

**Ficheiros prováveis:**

- `src/application/nodes/node_markdown.ts`
- `src/application/nodes/node_markdown_test.ts`

**Âmbito:** Pequeno.

## 2. Reutilizar conteúdo existente ao reindexar ficheiros

**Descrição:** Consultar `getEmbeddingContents()` antes da reindexação de um ficheiro. Em updates de
metadados, reconstruir o Markdown com o corpo existente sem exportação/OCR. Em alterações reais do
ficheiro, tentar exportação/OCR e usar o corpo anterior como fallback se essa tentativa falhar.

**Critérios de aceitação:**

- [ ] Um `NodeUpdatedEvent` sem alteração de `size` reutiliza o corpo armazenado e não chama
      export/OCR.
- [ ] Um update de ficheiro com `size` chama export/OCR e armazena o conteúdo novo.
- [ ] Falha de export/OCR preserva o corpo anterior; metadata-only é usado apenas sem cache
      anterior.

**Verificação:**

- [ ] Testes focused em `src/application/ai/rag_service_test.ts` cobrem os três caminhos.
- [ ] O Markdown reindexado contém metadados actuais e o corpo esperado.
- [ ] `deno test --allow-all --unstable-raw-imports src/application/ai/rag_service_test.ts`

**Dependências:** Tarefa 1.

**Ficheiros prováveis:**

- `src/application/ai/rag_service.ts`
- `src/application/ai/rag_service_test.ts`

**Âmbito:** Médio.

## Checkpoint RAG

- [ ] Testes de Markdown e RAG passam.
- [ ] Reindexação metadata-only não consulta storage.
- [ ] Uma falha de storage não destrói conteúdo previamente extraído.

## 3. Usar execução interna de agentes nas actions

**Descrição:** Alterar o contrato mínimo usado pelo `FeaturesEngine` para exigir
`runInternalAnswer()` e substituir todas as chamadas built-in a `answer()`, incluindo auto-tag e
call-agent síncrono/assíncrono.

**Critérios de aceitação:**

- [ ] Auto-tag consegue chamar `Aspect Field Extractor` com `exposedToUsers: false`.
- [ ] Call-agent síncrono e assíncrono usam o caminho interno.
- [ ] Chamadas HTTP directas a agentes não expostos continuam bloqueadas.

**Verificação:**

- [ ] Os mocks de `features_engine_test.ts` implementam somente o contrato interno esperado.
- [ ] Teste de auto-tag confirma chamada interna e utilização do `contentMd` armazenado.
- [ ] Testes de `AgentsEngine` confirmam `answer()` bloqueado e `runInternalAnswer()` permitido.

**Dependências:** Nenhuma.

**Ficheiros prováveis:**

- `src/application/features/builtin_feature_executor.ts`
- `src/application/features/features_engine_test.ts`

**Âmbito:** Pequeno.

## Checkpoint final

- [ ] `deno fmt --check`
- [ ] `deno lint`
- [ ] `deno check main.ts`
- [ ] `deno task test`
- [ ] `deno task build:antbox`
- [ ] Autoreview confirma que handlers HTTP não recebem o executor interno.
- [ ] Após deploy, um ficheiro com embedding existente executa auto-tag sem novo export e sem erro
      de exposição.
