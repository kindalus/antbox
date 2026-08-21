# Plano de implementação: simplificar `application/features`

## Estado

Implementado e verificado.

## Objetivo

Reduzir a complexidade de `src/application/features` sem alterar os contratos HTTP, a interface
pública de `FeaturesEngine`, a execução de código customizado, ACLs, `runAs`, eventos ou isolamento
por tenant.

## Diagnóstico

- `features_engine.ts` tem 1642 linhas e acumula seis responsabilidades:
  - orquestração de actions, AI tools e extensions;
  - coerção e validação de parâmetros;
  - dispatch de ferramentas internas;
  - execução das features built-in `call_agent` e `auto_tag`;
  - resposta HTTP de extensions;
  - triggers automáticos e hooks de pastas.
- A interface externa do engine é pequena e útil: `runAction`, `runAITool` e `runExtension`. O
  refactor deve manter este seam.
- `FeaturesService` tem três métodos públicos sem consumidores, `getAction`, `getAITool` e
  `getExtension`. Eles não aparecem no SDK gerado nem na documentação. São wrappers de `getFeature`
  e repetem validações já feitas pelo engine.
- A validação Zod de feature está duplicada entre create e update.
- O controlo de profundidade usa estado estático global, inclui timestamp sem leitor e inclui um
  tipo de execução que só recebe o valor `action`. O estado global mistura instâncias de tenants.
- Os handlers de create, update, delete e embeddings repetem a construção dos mesmos contextos.
- Os três handlers de folder hooks repetem lookup da pasta, validação, parsing e execução.
- Os testes cobrem bem o seam público, mas faltam casos positivos para folder hooks e triggers de
  embeddings. Esses caminhos serão caracterizados antes de serem unificados.

## Decisão de desenho

Manter `FeaturesEngine` como módulo profundo com três operações externas. Separar apenas capacidades
internas que escondem lógica substancial atrás de uma única função:

1. `feature_parameters.ts`: valida e converte parâmetros.
2. `system_ai_tools.ts`: executa ferramentas internas permitidas.
3. `builtin_feature_executor.ts`: executa comportamentos built-in que dependem de agentes e
   aspectos.
4. `feature_extension.ts`: adapta Request/Response HTTP ao executor comum.

O engine continua dono da autorização, do `RunContext`, da execução de código customizado e da
subscrição de eventos. Isso evita criar classes, factories ou interfaces públicas novas.

Foram rejeitadas duas alternativas:

- Dividir o engine por action, AI tool e extension duplicaria autorização e execução comum.
- Criar uma classe para cada helper trocaria um ficheiro grande por vários módulos rasos.

## Contratos preservados

- `FeaturesEngine.runAction`, `runAITool` e `runExtension`.
- `FeaturesService` CRUD e listagens usadas por handlers, agentes e engine.
- `Either<AntboxError, T>` e os códigos HTTP atuais.
- Nomes kebab-case/camelCase de actions e nomes `Service:method` das AI tools.
- Validação, defaults e coerção dos parâmetros.
- `runAs`, ACLs, filtros e `NodeServiceProxy`.
- Features built-in, triggers automáticos e folder hooks.
- Registo de handlers no `EventBus` durante a construção do engine.

## Etapas

### 1. Simplificar `FeaturesService`

- Substituir a interface vazia `CreateFeatureData` por um type alias.
- Centralizar a conversão de erros do `FeatureDataSchema`.
- Remover `getAction`, `getAITool` e `getExtension`, depois de repetir a pesquisa de consumidores e
  confirmar que não fazem parte do SDK gerado.
- Manter CRUD, export e listagens sem mudança observável.

Checkpoint:

- Testes de `FeaturesService`.
- Suite completa, lint e type-check.
- Autoreview de correção, simplicidade, arquitetura, segurança e desempenho.

### 2. Isolar validação de parâmetros

- Mover coerção e validação para `feature_parameters.ts`.
- Expor uma única função interna.
- Manter os testes através de `runAITool` e `runExtension`, sem testar métodos privados.

Checkpoint: mesmos gates e autoreview.

### 3. Isolar ferramentas internas de AI

- Mover o switch `NodeService:*`, `OcrModel:*`, `Templates:*` e `Docs:*` para `system_ai_tools.ts`.
- Eliminar o `any` do dispatcher se isso não aumentar a interface.
- Manter nomes, defaults, erros e ACLs.

Checkpoint: mesmos gates e autoreview.

### 4. Isolar execução das features built-in

- Mover `call_agent`, construção do prompt e `auto_tag` para `builtin_feature_executor.ts`.
- Reexportar `AgentAnswerExecutor` por `features_engine.ts` para não quebrar imports atuais.
- Manter execução síncrona e background, parsing do agente e atualização de aspectos.

Checkpoint: mesmos gates e autoreview.

### 5. Caracterizar e simplificar eventos

- Adicionar testes positivos para folder hooks e triggers de embeddings.
- Trocar o mapa estático de profundidade por estado da instância, indexado apenas por UUID.
- Remover timestamp e tipo de execução sem uso.
- Unificar construção de contextos automáticos.
- Unificar o pipeline dos triggers automáticos.
- Unificar o pipeline dos folder hooks.

Checkpoint após os testes de caracterização e outro após o refactor, ambos com suite, lint,
type-check e autoreview.

### 6. Isolar o adapter HTTP de extensions

- Mover parsing de Request, mapeamento de erros e serialização de Response para
  `feature_extension.ts`.
- Corrigir os nomes privados `respondeWithFile` e `respondeWithJson` ao removê-los do engine.
- Preservar status, content types, ficheiros, JSON, void e parâmetros kebab-case.

Checkpoint: mesmos gates e autoreview.

### 7. Revisão final

- Rever os módulos resultantes e eliminar apenas indirection que não tenha ganho profundidade.
- Procurar código morto, imports órfãos e duplicação residual.
- Executar format, lint, type-check, suite completa, `build:antbox`, bundle e smoke de runtime.
- Rever o diff integral e confirmar que não houve mudança de contrato.

## Estratégia de autoreview

Após cada etapa significativa:

1. Rever primeiro os testes e o comportamento que protegem.
2. Rever o diff nos cinco eixos: correção, simplicidade, arquitetura, segurança e desempenho.
3. Corrigir findings obrigatórios antes de avançar.
4. Reverter a etapa se apenas deslocar complexidade ou aumentar o número de conceitos.
5. Registar no relatório final os findings corrigidos e os adiados.

## Riscos e mitigação

| Risco                                     | Impacto | Mitigação                                                             |
| ----------------------------------------- | ------- | --------------------------------------------------------------------- |
| Alterar execução dinâmica ao mover código | Alto    | Mover sem reescrever e testar pelo seam público                       |
| Quebrar eventos assíncronos               | Alto    | Testes de caracterização antes da unificação                          |
| Alterar ACLs ou `runAs`                   | Alto    | Manter autorização no engine e executar suite completa                |
| Misturar profundidade entre tenants       | Alto    | Estado de recursão por instância, sem estado estático                 |
| Criar módulos rasos                       | Médio   | Uma função externa por capacidade; reverter se não reduzir conceitos  |
| Remover método usado fora do repo         | Médio   | Confirmar ausência no SDK/documentação; remoção explícita neste plano |

## Fora do escopo

- Alterar endpoints ou OpenAPI.
- Alterar `FeatureData` persistido.
- Adicionar sandbox para código dinâmico.
- Rever a política privilegiada de `runAs` e features automáticas.
- Adicionar novas tools ou features built-in.
- Mudar o comportamento fire-and-forget do event bus.
