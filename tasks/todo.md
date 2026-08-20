# Tarefas: migração do runtime de agentes para Pi

Este checklist só deve avançar depois da aprovação de `tasks/plan.md`.

## Tarefa 1: estabilizar o teste de accounting

**Descrição:** Diagnosticar a falha preexistente no fluxo
`AgentInteractionCompletedEvent -> AuditLoggingService -> TenantLimitsGuard` e corrigir o teste ou o
defeito de produto sem misturar alterações do runtime Pi.

**Critérios de aceitação:**

- [x] A causa da falha atual em `agent_usage_loop_test.ts` está identificada.
- [x] O teste passa isoladamente e junto dos restantes testes de agentes.
- [x] A semântica mensal e por tenant do limite de tokens permanece coberta.

**Verificação:**

- [x] `deno test --allow-all --unstable-raw-imports src/application/ai/agent_usage_loop_test.ts`
- [x] Testes focados de AI passam.

**Dependências:** Nenhuma.

**Ficheiros prováveis:**

- `src/application/ai/agent_usage_loop_test.ts`
- Eventual ficheiro da causa, apenas se o teste revelar um defeito real.

**Escopo estimado:** Pequeno.

## Tarefa 2: fixar e provar as dependências Pi em Deno

**Descrição:** Adicionar versões exatas e alinhadas de `pi-agent-core`, `pi-ai` e `pi-telemetry`,
mais um teste que execute o carregamento progressivo de uma skill Antbox no Deno.

**Critérios de aceitação:**

- [x] Core, AI e telemetry ficam fixados diretamente na mesma versão.
- [x] Não existe dependência de `pi-coding-agent`.
- [x] O loader Antbox descobre uma skill e os seus metadados entram em `<available_skills>`.
- [x] Um `Agent` Pi chama a `AgentTool` TypeBox `load_skill` e recebe o corpo do `SKILL.md`.
- [x] O agent completa o segundo turno usando uma marca presente apenas no conteúdo carregado.
- [x] O teste falha se os pacotes deixarem de ser importáveis ou executáveis pelo Deno.

**Verificação:**

- [x] Teste de compatibilidade Pi passa.
- [x] `deno check main.ts`
- [x] `deno task build:antbox`

**Dependências:** Tarefa 1.

**Ficheiros prováveis:**

- `deno.json`
- `deno.lock`
- `src/application/ai/pi_runtime_compat_test.ts`

**Escopo estimado:** Médio.

## Tarefa 3: migrar o resolver de modelos e providers

**Descrição:** Manter Google, OpenAI, Anthropic e Ollama como providers que enumeram modelos e
fornecem credenciais ao runtime Pi, substituindo os adapters Vercel no resolver.

**Critérios de aceitação:**

- [x] A interface usada pelo `AgentsEngine` expõe catálogo, estado de configuração e credencial.
- [x] O provider não contém loop de agente, conversão de mensagens nem lifecycle de tools.
- [x] O dispatch HTTP permanece encapsulado no runtime `pi-ai`.
- [x] `<provider>/<model>` continua obrigatório.
- [x] Providers desconhecidos mantêm erro `UnknownModelProvider`.
- [x] Google aceita `GEMINI_API_KEY` e `GOOGLE_API_KEY`.
- [x] OpenAI e Anthropic disponibilizam as API keys ao callback `getApiKey` do Agent.
- [x] Ollama respeita `OLLAMA_BASE_URL` e aceita IDs configurados.
- [x] Modelos conhecidos usam metadados Pi; IDs desconhecidos recebem defaults conservadores.

**Verificação:**

- [x] Testes unitários do resolver passam sem chamadas externas.
- [x] Testes comprovam enumeração de modelos e resolução de credenciais para os quatro providers.
- [x] Um provider falso recebe `temperature` e `maxTokens` esperados.

**Dependências:** Tarefa 2.

**Ficheiros prováveis:**

- `src/application/ai/resolve_model.ts`
- `src/application/ai/resolve_model_test.ts`
- Eventual helper Pi pequeno, se o resolver deixar de caber num módulo coeso.

**Escopo estimado:** Médio.

## Tarefa 4: migrar a ponte de mensagens e usage

**Descrição:** Converter `ChatHistory` para mensagens Pi e mensagens Pi para o domínio Antbox, sem
alterar os tipos públicos.

**Critérios de aceitação:**

- [x] User, assistant text, tool calls e tool results fazem round-trip.
- [x] Vários tool calls no mesmo turno preservam ordem e IDs.
- [x] IDs opcionais recebem pares determinísticos ou são rejeitados com erro claro.
- [x] Thinking não é exposto na API.
- [x] Usage agrega input, cache, output e total sem dupla contagem.

**Verificação:**

- [x] `messages_test.ts` cobre texto, tools, erros, thinking e usage.
- [x] Não existem imports de tipos Vercel em `messages.ts`.

**Dependências:** Tarefa 2.

**Ficheiros prováveis:**

- `src/application/ai/messages.ts`
- `src/application/ai/messages_test.ts`

**Escopo estimado:** Médio.

## Tarefa 5: migrar tools para AgentTool e TypeBox

**Descrição:** Reescrever o builder de tools para o contrato Pi, preservando nomes, aliases,
allow-lists, ACLs e feature-backed tools.

**Critérios de aceitação:**

- [x] `tools: true|false|undefined|[]|string[]` mantém a semântica atual.
- [x] `load_skill` continua sempre disponível.
- [x] Schemas das tools são TypeBox e validados antes da execução.
- [x] Resultados estruturados chegam ao modelo como JSON.
- [x] Erros de serviços/features tornam-se tool errors Pi.
- [x] Tools com efeitos mutáveis não correm em paralelo quando isso criar races.

**Verificação:**

- [x] Testes cobrem tools built-in, aliases, colisões e uma feature AI tool.
- [x] Teste cobre `load_skill` apenas para skills descobertas e permitidas pelo agente.
- [x] Teste cobre o conteúdo completo sem frontmatter e a diretoria base para referências relativas.
- [x] `SessionStore` compila com snapshots de `AgentTool[]`.

**Dependências:** Tarefas 2 e 4.

**Ficheiros prováveis:**

- `src/application/ai/build_tools.ts`
- `src/application/ai/build_tools_test.ts`
- `src/application/ai/session_store.ts`
- `src/application/ai/session_store_test.ts`

**Escopo estimado:** Médio.

## Checkpoint A: adapters Pi prontos

- [x] Tarefas 1 a 5 concluídas.
- [x] Testes focados verdes.
- [x] Bundle Deno passa.
- [x] Revisão humana antes do cutover do engine.

## Tarefa 6: trocar o loop do AgentsEngine para Pi

**Descrição:** Substituir `generateText` pelo `Agent` de `pi-agent-core`, usando o resolver,
mensagens e tools das tarefas anteriores.

**Critérios de aceitação:**

- [x] Chat simples, chat com histórico e answer funcionam com Pi.
- [x] Tool loop produz sequência `model -> tool -> model` no domínio Antbox.
- [x] `maxLlmCalls` limita o loop e uma síntese sem tools fecha respostas terminais.
- [x] `temperature` e `maxTokens` chegam ao provider.
- [x] A credencial é obtida por `getApiKey` em cada pedido, sem entrar no prompt ou histórico.
- [x] Erros e aborts Pi tornam-se `AntboxError` sem expor stack traces.
- [x] Custom agents deixam de depender de `ModelMessage` Vercel.

**Verificação:**

- [x] `agents_engine_test.ts` usa um stream/modelo Pi falso determinístico.
- [x] Testes cobrem texto, tools, limite, síntese, erros e métodos internos.
- [x] O último item de todo chat bem-sucedido é uma mensagem `model`.

**Dependências:** Tarefas 3, 4 e 5.

**Ficheiros prováveis:**

- `src/application/ai/agents_engine.ts`
- `src/application/ai/agents_engine_test.ts`
- `src/application/ai/custom_agents/base_antbox_agent.ts`
- `src/application/ai/agent_usage_loop_test.ts`

**Escopo estimado:** Médio, com revisão dedicada.

## Tarefa 7: preservar telemetria, debug e segurança de sessão

**Descrição:** Ligar eventos/usage Pi à telemetria Antbox, manter o debug trace sem conteúdo
sensível e validar tenant, agente e utilizador ao reutilizar uma session.

**Critérios de aceitação:**

- [x] Spans mantêm tenant, agente, tipo de interação, modelo e usage.
- [x] Prompts e resultados não entram em atributos de telemetria.
- [x] Debug trace regista lifecycle e contagens, não credenciais.
- [x] Uma session aberta por um utilizador é rejeitada para outro utilizador.
- [x] `AgentInteractionCompletedEvent` continua publicado uma vez por interação.

**Verificação:**

- [x] Testes de telemetria e usage passam.
- [x] Teste de session cross-user retorna `InvalidSession`.
- [x] Teste de limites confirma accounting Pi.

**Dependências:** Tarefa 6.

**Ficheiros prováveis:**

- `src/application/ai/agents_engine.ts`
- `src/application/ai/agents_engine_test.ts`
- `src/application/ai/ai_telemetry.ts` ou substituto Pi
- `src/application/ai/ai_telemetry_test.ts`

**Escopo estimado:** Médio.

## Checkpoint B: cutover funcional

- [x] O engine usa Pi em todos os caminhos LLM.
- [x] Autorização e isolamento por tenant revistos.
- [x] Accounting e resposta terminal verificados.
- [x] Testes focados e bundle verdes.

## Tarefa 8: remover Vercel AI SDK do runtime

**Descrição:** Apagar adapters/helpers sem uso e remover dependências Vercel depois de confirmar que
nenhum runtime ou teste ainda as importa.

**Critérios de aceitação:**

- [x] `rg` não encontra imports de `ai` nem `@ai-sdk/*` na implementação de agentes.
- [x] Dependências `ai` e `@ai-sdk/*` saem do `deno.json` e lockfile.
- [x] `@google/genai` permanece porque OCR/embeddings ainda o usam.
- [x] Setup de tenants instancia apenas o runtime Pi.

**Verificação:**

- [x] `deno check main.ts`
- [x] `deno task build:antbox`
- [x] Testes de `setup_tenants` passam.

**Dependências:** Tarefas 6 e 7.

**Ficheiros prováveis:**

- `deno.json`
- `deno.lock`
- `src/setup/setup_tenants.ts`
- `src/setup/setup_tenants_test.ts`

**Escopo estimado:** Médio.

## Tarefa 9: atualizar documentação e contrato

**Descrição:** Documentar o runtime Pi, providers, opções funcionais e telemetria. Não alterar paths
nem schemas públicos sem uma decisão separada.

**Critérios de aceitação:**

- [x] Documentação já não chama o engine de Vercel AI SDK-backed.
- [x] Providers e env vars suportados estão explícitos.
- [x] Limite de turnos, síntese final e accounting estão descritos.
- [x] `openapi.yaml` continua alinhado com os handlers.
- [x] A limitação atual de `files` fica registada sem prometer suporte inexistente.

**Verificação:**

- [x] Pesquisa não encontra referências runtime desatualizadas ao Vercel AI SDK.
- [x] Exemplos de configuração continuam válidos.

**Dependências:** Tarefa 8.

**Ficheiros prováveis:**

- `docs/ai-agents.md`
- `docs/agent-skills.md`
- `docs/observability.md`
- `docs/llms.md`
- `openapi.yaml`, apenas se descrições precisarem de correção.

**Escopo estimado:** Médio.

## Tarefa 10: verificação final e matriz de providers

**Descrição:** Executar todos os gates locais e, quando existirem credenciais, smoke tests reais dos
quatro providers suportados.

**Critérios de aceitação:**

- [x] Formatação, lint, testes e bundle passam.
- [x] Google, OpenAI, Anthropic e Ollama têm pelo menos um caminho de configuração verificado.
- [x] Não há regressões conhecidas em API, auth, multi-tenancy, event bus ou limites.
- [x] Revisão de qualidade e segurança não encontra bloqueadores.

**Verificação:**

- [x] `deno fmt --check`
- [x] `deno lint`
- [x] `deno task test`
- [x] `deno task build:antbox`
- [x] Smoke tests reais não executados: nenhuma das quatro credenciais/endpoints estava configurada
      no ambiente; providers foram verificados com runtime falso e resolução de configuração.

**Dependências:** Tarefa 9.

**Ficheiros prováveis:** Nenhum, salvo correções encontradas pelos gates.

**Escopo estimado:** Médio.

## Checkpoint final

- [x] Todos os critérios de `tasks/plan.md` foram auditados.
- [x] Nenhum trabalho obrigatório ficou pendente.
- [x] Migração pronta para revisão e merge.
