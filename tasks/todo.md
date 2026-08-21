# Tarefas: simplificar `application/features`

Este checklist só avança depois da aprovação de `tasks/plan.md`.

## Tarefa 1: simplificar `FeaturesService`

**Critérios de aceitação:**

- [x] A validação Zod duplicada está centralizada.
- [x] Os três wrappers sem consumidores foram removidos sem quebrar o SDK ou callers internos.
- [x] CRUD, export, autorização e listagens mantêm o comportamento.

**Verificação:**

- [x] Testes focados, suite completa, lint e type-check.
- [x] Autoreview sem findings obrigatórios.

**Dependências:** Nenhuma.

## Tarefa 2: extrair validação de parâmetros

**Critérios de aceitação:**

- [x] Uma única função interna valida defaults e tipos suportados.
- [x] `FeaturesEngine` mantém os mesmos erros e valores convertidos.
- [x] Não foi criada uma classe ou interface pública nova.

**Verificação:**

- [x] Testes focados, suite completa, lint e type-check.
- [x] Autoreview sem findings obrigatórios.

**Dependências:** Tarefa 1.

## Tarefa 3: extrair ferramentas internas de AI

**Critérios de aceitação:**

- [x] O dispatcher vive num módulo com uma entrada.
- [x] Todos os nomes e erros existentes permanecem cobertos.
- [x] O dispatcher não usa `any`, salvo prova de que a alternativa piora a interface.

**Verificação:**

- [x] Testes focados, suite completa, lint e type-check.
- [x] Autoreview sem findings obrigatórios.

**Dependências:** Tarefa 2.

## Tarefa 4: extrair features built-in

**Critérios de aceitação:**

- [x] `call_agent` e `auto_tag` deixam de ocupar o engine.
- [x] `AgentAnswerExecutor` mantém compatibilidade de import.
- [x] Execução sync/background, prompts e updates mantêm o comportamento.

**Verificação:**

- [x] Testes focados, suite completa, lint e type-check.
- [x] Autoreview sem findings obrigatórios.

**Dependências:** Tarefa 3.

## Tarefa 5: caracterizar eventos

**Critérios de aceitação:**

- [x] Folder hooks têm cobertura positiva.
- [x] Triggers de embeddings têm cobertura positiva.
- [x] Os testes observam resultados públicos, não estado privado.

**Verificação:**

- [x] Testes focados e suite completa.
- [x] Autoreview dos testes sem findings obrigatórios.

**Dependências:** Tarefa 4.

## Tarefa 6: simplificar eventos e profundidade

**Critérios de aceitação:**

- [x] O estado de profundidade pertence à instância e não mistura tenants.
- [x] Timestamp e dimensão de execução sem uso foram removidos.
- [x] Triggers automáticos partilham um pipeline.
- [x] Folder hooks partilham um pipeline.

**Verificação:**

- [x] Testes focados, suite completa, lint e type-check.
- [x] Autoreview sem findings obrigatórios.

**Dependências:** Tarefa 5.

## Tarefa 7: extrair adapter de extensions

**Critérios de aceitação:**

- [x] Parsing HTTP e serialização de respostas vivem num módulo com uma entrada.
- [x] Status, headers, ficheiros, JSON e void não mudam.
- [x] `runExtension` continua a interface externa.

**Verificação:**

- [x] Testes focados, suite completa, lint e type-check.
- [x] Autoreview sem findings obrigatórios.

**Dependências:** Tarefa 6.

## Tarefa 8: verificação final

**Critérios de aceitação:**

- [x] O engine ficou materialmente menor e cada módulo interno esconde lógica substancial.
- [x] Não há código morto, imports órfãos ou duplicação óbvia restante.
- [x] Nenhum contrato HTTP ou persistido mudou.

**Verificação:**

- [x] `deno fmt --check`
- [x] `deno lint`
- [x] `deno check main.ts`
- [x] `deno task test`
- [x] `deno task build:antbox`
- [x] Bundle integral e smoke de runtime.
- [x] Autoreview final do diff completo.

**Dependências:** Tarefa 7.
