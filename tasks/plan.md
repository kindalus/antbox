# Plano de implementação: migrar o runtime de agentes para Pi

## Estado

Implementado e verificado. Este documento regista a migração executada.

## Objetivo

Substituir o loop de agentes e os adapters de modelos do Vercel AI SDK pelo runtime do Pi, sem
alterar os endpoints públicos, o formato de `ChatHistory`, as regras de autorização, os nomes das
ferramentas ou o modelo de skills do Antbox.

## Constatações verificadas

- O runtime atual depende diretamente de `ai@5` e dos adapters `@ai-sdk/google`, `@ai-sdk/openai`,
  `@ai-sdk/anthropic` e `@ai-sdk/openai-compatible`.
- O acoplamento está concentrado em `agents_engine.ts`, `build_tools.ts`, `messages.ts`,
  `resolve_model.ts`, `session_store.ts`, `ai_telemetry.ts` e nos respetivos testes.
- `@earendil-works/pi-agent-core` e `@earendil-works/pi-ai` executam em Deno 2.7.14. Um spike
  temporário completou um ciclo `user -> assistant/toolCall -> toolResult -> assistant`.
- Um segundo spike, com modelo determinístico falso, integrou o `skills_loader.ts` atual com um
  `Agent` Pi. O runtime descobriu `sdk-consumer`, recebeu os metadados em `<available_skills>`,
  chamou `load_skill`, carregou o `SKILL.md` completo e produziu a resposta final após dois pedidos
  ao modelo.
- O suporte nativo de descoberta de skills está em `pi-coding-agent`, não em `pi-agent-core`. O core
  executa normalmente uma tool de carregamento fornecida pelo host, que é o desenho já usado pelo
  Antbox.
- `@earendil-works/pi-coding-agent` completo não executa no Deno atual. O import falhou dentro de
  `undici@8.9.0` com `webidl.util.markAsUncloneable is not a function`.
- Os pacotes Pi declaram oficialmente Node `>=22.19.0`; Deno não consta como runtime suportado. Por
  isso, a compatibilidade Deno precisa de um teste permanente e de um gate no build.
- O conjunto focado de testes de agentes tem uma falha anterior à migração em
  `agent_usage_loop_test.ts`. A falha reproduz-se isoladamente e precisa de ser estabilizada antes
  do cutover.
- `temperature`, `maxTokens` e `files` constam do contrato, mas o engine atual não os encaminha ao
  Vercel AI SDK. A migração pode ligar `temperature` e `maxTokens`; `files` exige uma correção de
  transporte HTTP separada.

## Decisões de arquitetura

### 1. Usar o núcleo do Pi, não o coding harness completo

Dependências novas, inicialmente fixadas em `0.84.1`:

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-telemetry`, fixada diretamente para evitar drift transitivo

Não adicionar `@earendil-works/pi-coding-agent` ao servidor. O Antbox não precisa do TUI, das
ferramentas de filesystem, de extensões, de descoberta de `.pi`, de sessões JSONL ou de comandos do
coding agent. Além do peso desnecessário, o pacote completo falhou no spike com Deno.

O carregamento de skills do Antbox será mantido como integração do host com o core Pi. É o mesmo
modelo de progressive disclosure documentado pelo Pi: metadados no prompt e conteúdo completo
carregado por uma tool apenas quando necessário. A diferença intencional é usar `load_skill`, que é
restrita à allow-list do tenant, em vez da tool genérica `read` do coding agent.

### 2. Manter Antbox como dono dos contratos e do estado

O Pi substitui:

- o loop `generateText`;
- a execução iterativa de tool calls;
- os adapters de Google, OpenAI, Anthropic e OpenAI-compatible;
- os tipos internos de mensagens e tools ligados ao Vercel AI SDK.

O Antbox continua dono de:

- `IAgentsEngine` e dos endpoints `/chat` e `/answer`;
- `ChatMessage` e `ChatHistory` públicos;
- `AgentData`, limites mensais e eventos de uso;
- autorização por tenant e utilizador;
- descoberta de skills e a ferramenta restrita `load_skill`;
- snapshots de tools em `SessionStore`.

Cada interação cria um `Agent` efémero do Pi com histórico convertido, modelo, prompt e tools
específicos daquele pedido. Não serão gravadas sessões Pi no disco.

### 3. Manter providers como catálogo de modelos e fonte de credenciais

Cada `AgentsEngine` recebe um registo Pi com apenas os providers já suportados pelo Antbox:

- `google`
- `openai`
- `anthropic`
- `ollama`

Na arquitetura Antbox, a responsabilidade visível desses providers fica limitada a:

- enumerar os modelos disponíveis e respetivos metadados;
- disponibilizar a API key ou credencial do provider ao `Agent` através de `getApiKey`;
- informar se o provider está configurado.

O loop, mensagens, tools, retries e lifecycle pertencem ao runtime Pi. O dispatch HTTP fica
encapsulado em `pi-ai`, porque o contrato oficial `Provider` do Pi ainda contém `streamSimple`, mas
não será tratado como lógica de negócio dos providers Antbox. Não serão adotados login OAuth,
credential store persistente ou ficheiros globais de autenticação do coding agent.

A migração não expõe automaticamente todos os providers do catálogo Pi. Isso seria uma expansão de
produto, não uma troca de runtime.

Compatibilidade a preservar:

- identificadores no formato `<provider>/<model>`;
- `GEMINI_API_KEY` e fallback para `GOOGLE_API_KEY`;
- `OPENAI_API_KEY`;
- `ANTHROPIC_API_KEY`;
- `OLLAMA_BASE_URL`, com default `http://localhost:11434/v1`;
- modelos explícitos em `AgentData.model` e fallback para `defaultModel`.

Modelos conhecidos usam metadados do catálogo Pi. Para IDs não presentes no catálogo, o resolver
cria uma definição conservadora para o provider suportado, mantendo o comportamento atual de aceitar
IDs configurados sem uma allow-list fechada.

### 4. Adaptar tools diretamente para `AgentTool`

`buildToolSet` passa a devolver `AgentTool[]` com schemas TypeBox. Mantêm-se os nomes e aliases:

- `run_code`
- `find_nodes`
- `get_node`
- `semantic_search`
- `load_skill`
- feature tools convertidas para snake_case

Resultados estruturados serão serializados como JSON no bloco de texto enviado ao modelo e podem
permanecer em `details` para diagnóstico. Uma tool sinaliza erro lançando uma exceção, como exige o
Pi. Os proxies Antbox continuam a aplicar ACLs e o contexto do utilizador.

### 5. Traduzir mensagens apenas na fronteira

`messages.ts` será o único tradutor entre o domínio Antbox e as mensagens Pi:

- `user` -> `UserMessage`
- `model` -> `AssistantMessage`
- `tool` -> `ToolResultMessage`

Na saída:

- blocos `thinking` não entram na API pública;
- texto e tool calls preservam a ordem;
- tool results preservam IDs, nomes e texto;
- erros de tool continuam no histórico como respostas de tool;
- usage Pi é agregado no `TokenUsage` Antbox.

Cache read e cache write contam como tokens de prompt para que `totalTokens` permaneça coerente e os
limites não subestimem consumo.

### 6. Preservar o limite de chamadas e a resposta terminal

`maxLlmCalls` contará respostas do modelo no loop principal. O hook `shouldStopAfterTurn` interrompe
o Pi quando atingir o limite. Se o último turno terminar em tool results, o engine executa uma única
chamada Pi sem tools para sintetizar a resposta final, preservando o comportamento atual.

A resposta pública de `/chat` termina sempre num `model`; `/answer` devolve apenas essa resposta.

### 7. Manter telemetria sem conteúdo sensível

Preservar os spans e atributos Antbox:

- `antbox.tenant`
- `antbox.agent.uuid`
- `antbox.ai.interaction_type`
- `gen_ai.operation.name`
- `gen_ai.request.model`
- usage de tokens

Prompts, documentos, argumentos de tools, tool results e respostas não serão adicionados a spans. O
helper Vercel `ai_telemetry.ts` será removido depois de os spans equivalentes estarem cobertos pelo
engine Pi.

## Fluxo proposto

```text
HTTP /chat ou /answer
  -> AgentsEngine valida agente, exposição, tenant, limites e histórico
  -> provider enumera/resolve o modelo e fornece a API key ao Agent
  -> buildToolSet cria AgentTool[] vinculadas ao AuthenticationContext
  -> messages.ts converte ChatHistory para mensagens Pi
  -> Agent do pi-agent-core executa modelo e tools
  -> messages.ts converte novas mensagens para ChatHistory
  -> AgentsEngine agrega usage e publica AgentInteractionCompletedEvent
  -> resposta pública mantém o formato atual
```

## Contrato de compatibilidade

### Deve permanecer igual

- Paths, métodos HTTP e formatos de resposta.
- Semântica de `chat` com histórico e `answer` sem histórico.
- Guardas `exposedToUsers` e métodos internos.
- `Either<AntboxError, ...>` na fronteira do engine.
- Nomes, allow-list e aliases de tools.
- `load_skill` sempre disponível.
- Descoberta, allow-list e carregamento on-demand de skills pelo Antbox.
- Prompt do agente, skills disponíveis e instrução de data.
- Snapshot de agente/tools durante uma chat session.
- Evento de uso e enforcement de limites.

### Mudanças deliberadas

- `temperature` e `maxTokens` passam a ser enviados ao provider Pi.
- Respostas do provider com `stopReason: error` ou `aborted` tornam-se erros Antbox explícitos.
- Tool arguments passam pela validação TypeBox do Pi antes da execução.
- O check de chat session passa também a validar o utilizador, além de tenant e agente.

### Fora do escopo

- Adotar o TUI, extensions, prompts ou SessionManager do Pi.
- Persistir sessões em JSONL.
- Expor tools de filesystem ou shell do Pi.
- Adicionar providers além dos quatro já suportados.
- Corrigir o transporte de `files` no endpoint JSON.
- Alterar endpoints ou criar streaming HTTP.
- Alterar o formato público de `ChatMessage` para expor thinking ou metadata do provider.

## Estratégia de implementação

A migração será feita na mesma branch em incrementos verificáveis. O Vercel AI SDK permanece até o
engine Pi passar os testes de contrato. Depois do cutover, as dependências e adapters Vercel são
removidos no mesmo trabalho. Não haverá uma opção pública para escolher entre runtimes.

### Fase 0: estabilizar a linha de base

1. Diagnosticar e corrigir a falha preexistente de accounting em `agent_usage_loop_test.ts`.
2. Registar o resultado dos testes focados antes de alterar o runtime.

Checkpoint: testes focados de agentes verdes.

### Fase 1: provar a fundação Pi em Deno

3. Fixar versões exatas e alinhadas de `pi-agent-core`, `pi-ai` e `pi-telemetry` no `deno.json` e
   lockfile.
4. Adicionar um teste Deno com modelo falso que descubra uma skill Antbox, chame `load_skill` e
   termine depois de consumir o conteúdo do `SKILL.md`.
5. Validar `deno check` e `deno task build:antbox` cedo.

Checkpoint: Pi core funciona em testes e no bundle Deno sem importar o coding-agent completo.

### Fase 2: adapters Antbox para Pi

6. Adaptar os providers de Google, OpenAI, Anthropic e Ollama para enumerarem modelos e fornecerem
   credenciais ao runtime Pi.
7. Reescrever a conversão de mensagens e usage.
8. Reescrever `buildToolSet` para `AgentTool[]` e ajustar snapshots de sessão.

Checkpoint: resolver, mensagens e tools passam em testes unitários sem mudar o engine público.

### Fase 3: cutover do engine

9. Trocar `generateText` pelo `Agent` de `pi-agent-core`.
10. Implementar contagem de turnos, síntese terminal, options, erros, debug trace e usage.
11. Ajustar o seam de custom agents para tipos Pi.
12. Revalidar sessões seladas, tenant, utilizador e tool snapshots.

Checkpoint: todos os testes de contrato do `AgentsEngine` passam usando apenas o loop Pi.

### Fase 4: remover Vercel e documentar

13. Remover imports, helpers e dependências Vercel sem uso.
14. Atualizar documentação de agentes, modelos e observabilidade.
15. Confirmar que `openapi.yaml` não precisa de mudança estrutural. Atualizar apenas descrições que
    estejam incorretas sobre options agora funcionais.

Checkpoint: nenhuma referência runtime a `ai` ou `@ai-sdk/*`; bundle e documentação coerentes.

### Fase 5: verificação final

16. Executar format, lint, testes focados, suite completa e bundle.
17. Fazer smoke tests opcionais com credenciais reais para Google, OpenAI, Anthropic e Ollama.
18. Rever segurança, multi-tenancy, accounting e diferenças de comportamento.

## Rollback

- Manter o cutover e a remoção de dependências em commits separados e atómicos.
- Se o Pi falhar no build Deno ou nos testes de contrato, parar antes do cutover.
- Depois do cutover, rollback é feito revertendo os commits do engine e das dependências. Não há
  migração de dados nem alteração do contrato HTTP.

## Riscos e mitigação

| Risco                                             | Impacto | Mitigação                                                        |
| ------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| Pi declara suporte a Node, não Deno               | Alto    | Teste Deno permanente e bundle como gate antes do cutover        |
| `pi-coding-agent` completo falha em Deno          | Alto    | Usar apenas `pi-agent-core` e `pi-ai`                            |
| Core Pi não descobre skills sozinho               | Alto    | Manter loader, prompt e `load_skill` Antbox; teste end-to-end    |
| Drift entre versões Pi transitivas                | Alto    | Fixar core, AI e telemetry em versões compatíveis                |
| Diferenças no formato de mensagens/tool calls     | Alto    | Tradutor isolado e testes de round-trip com vários tool calls    |
| Loop termina após tool result                     | Alto    | Limite explícito e síntese final sem tools                       |
| Usage Pi inclui cache tokens                      | Médio   | Regra de agregação documentada e testes do evento de limites     |
| Modelo configurado não está no catálogo Pi        | Médio   | Definição conservadora para IDs de providers suportados          |
| Ollama tem compatibilidade variável               | Médio   | Provider `openai-completions`, flags conservadoras e smoke test  |
| Tool calls paralelas alteram efeitos              | Médio   | Marcar tools mutáveis como sequenciais quando necessário         |
| Session snapshot reutilizado por outro utilizador | Alto    | Validar `userEmail` no acesso à session                          |
| Pi ganha acesso indevido ao host                  | Alto    | Não carregar coding tools, extensions, `.pi` ou recursos globais |
| Teste de accounting já falha                      | Médio   | Estabilizar antes da migração e manter como gate                 |

## Impacto em autenticação, multi-tenancy e eventos

- Autenticação: tools continuam fechadas sobre `AuthenticationContext`; chat sessions passam a
  verificar também o principal.
- Multi-tenancy: cada tenant mantém o seu `AgentsEngine`, registo de providers, skills, serviços e
  snapshots. Nenhum estado de conversa Pi é partilhado ou persistido globalmente.
- Event bus: `AgentInteractionCompletedEvent` mantém o mesmo payload e continua a alimentar audit e
  limites. A origem do usage muda para mensagens Pi.

## Decisões aplicadas

1. O runtime usa `pi-agent-core` + `pi-ai` e mantém o loader de skills Antbox.
2. `temperature` e `maxTokens` são encaminhados ao provider Pi.
3. Chat sessions validam tenant, agente e utilizador.

## Fontes oficiais consultadas

- Pi SDK: https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/sdk.md
- Skills Pi:
  https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/skills.md
- Tipos e loop do agente:
  https://github.com/earendil-works/pi-mono/blob/main/packages/agent/src/types.ts
- Sessões e mensagens Pi:
  https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/session-format.md
- Providers customizados:
  https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md
- Modelos customizados:
  https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/models.md
