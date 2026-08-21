# dataDir, sessões e modelos geridos pelo Pi

Estado: implementação e testes locais concluídos; rollout da nova imagem de produção pendente.

## 1. Provar o SDK completo do Pi sob Deno

**Descrição:** Criar um teste mínimo que use a mesma versão de `pi-coding-agent`, `pi-agent-core` e
`pi-ai`, sem rede nem credenciais reais. Validar criação, prompt, ferramenta customizada, thinking
level, sessão in-memory, sessão JSONL, abort e dispose.

**Critérios de aceitação:**

- [x] As versões dos três pacotes Pi são iguais e ficam presas no lockfile.
- [x] Uma `AgentSession` funciona nos testes Deno com `--unstable-raw-imports`.
- [x] O teste prova persistência/reabertura e abort sem deixar operações activas.

**Verificação:**

- [x] Teste focado do spike passa.
- [x] `deno check` não introduz incompatibilidades Node/Deno.

**Dependências:** Nenhuma.

**Ficheiros prováveis:** `deno.json`, `deno.lock`, novo teste de compatibilidade Pi.

**Âmbito:** Médio.

## 2. Introduzir `dataDir` e resolução segura de paths

**Descrição:** Adicionar um directório de dados independente do directório de configuração, com
default `~/.local/share/antbox` e override `-d, --data-dir`. Centralizar a resolução de data paths e
aplicá-la apenas aos parâmetros de path dos adapters flat-file/SQLite e a `sessionsPath`.

**Critérios de aceitação:**

- [x] Sem override, `getDefaultDataDir()` devolve `$HOME/.local/share/antbox`.
- [x] `--data-dir` chega ao carregamento inicial, setup e reload sem ser gravado no TOML.
- [x] `vcrm`, `./vcrm` e `./data/vcrm` resolvem contra `dataDir`; absolutos são preservados.
- [x] Qualquer path relativo com um segmento `..` é rejeitado antes da normalização.
- [x] Keys, JWKS, `skillsPath`, S3 e credenciais Google continuam relativos a `configDir`.
- [x] URLs, IDs e argumentos não-path dos adapters não são alterados.
- [x] O loader não cria `dataDir`; adapters e sessões criam apenas as directorias usadas.
- [x] `--demo` e `--sandbox` não partilham dados com o servidor normal nem entre si.
- [x] A configuração inicial usa `default/storage`, `default/repository`, `default/config` e
      `default/events`.

**Verificação:**

- [x] Testes unitários cobrem a matriz de resolução, traversal e paths absolutos.
- [x] Testes de configuração cobrem flat-file, SQLite, Google Drive, S3 e MongoDB.
- [x] Teste de reload confirma que `configDir` e `dataDir` não mudam.

**Dependências:** Nenhuma.

**Ficheiros prováveis:** resolver de paths, loader, `main.ts`, `start_server.sh` e testes.

**Âmbito:** Médio.

## 3. Introduzir o contrato `ModelSelection`

**Descrição:** Definir o tuple de modelo e thinking level. Normalizar strings antigas para
`[model, "off"]` tanto na configuração do tenant como em agentes persistidos. Remover `maxLlmCalls`
de `AgentData`.

**Critérios de aceitação:**

- [x] `defaultModel` aceita string antiga, tuple de um elemento e tuple com thinking level válido.
- [x] A representação interna e todas as escritas novas usam tuple.
- [x] `AgentData.model` usa o mesmo contrato e agentes antigos continuam legíveis.
- [x] Thinking levels desconhecidos e tuples com elementos adicionais são rejeitados.

**Verificação:**

- [x] Testes dos schemas de tenant e agente passam.
- [x] Testes de load/save TOML cobrem leitura antiga e escrita canónica.

**Dependências:** Tarefa 1.

**Ficheiros prováveis:** novo módulo de selecção, schemas de tenant/agente, respectivos testes.

**Âmbito:** Médio.

## 4. Criar um `ModelRuntime` isolado por tenant

**Descrição:** Construir o runtime no setup do tenant usando credenciais em memória e variáveis de
ambiente. Delegar ao Pi resolução de modelo, autenticação e clamp do thinking level. Não carregar
`auth.json` nem recursos do host.

**Critérios de aceitação:**

- [x] Cada tenant com AI recebe exactamente um runtime reutilizável.
- [x] O Antbox não regista Google, OpenAI ou Anthropic manualmente.
- [x] Modelo inexistente, provider sem credencial e thinking incompatível produzem erros estáveis.
- [x] Tenants sem AI não criam directórios de sessões nem fazem pedidos a modelos.

**Verificação:**

- [x] Testes de setup com dois tenants provam isolamento e reutilização.
- [x] Testes de autenticação usam apenas ambiente controlado.

**Dependências:** Tarefas 1 e 3.

**Ficheiros prováveis:** setup de tenants, nova factory de runtime, testes de setup/runtime.

**Âmbito:** Médio.

## Checkpoint: contratos e runtime

- [x] Suite focada passa sem rede.
- [x] Nenhum comportamento de embeddings ou OCR mudou.
- [x] Rever o diff antes de iniciar persistência.

## 5. Implementar o workspace persistente da sessão

**Descrição:** Criar uma pasta por session ID sob `sessionsPath`, com JSONL Pi, manifest e recursos.
Resolver o default `<dataDir>/{tenant}/ai-sessions`, validar IDs e implementar expiração rígida de
24 horas.

**Critérios de aceitação:**

- [x] `sessionsPath` relativo resolve contra `dataDir`; ausente usa
      `<dataDir>/<tenant>/ai-sessions`.
- [x] Criação é atómica e rollback remove pastas parciais.
- [x] Abertura valida tenant, utilizador, agente, criação e expiração antes de ler o JSONL.
- [x] DELETE, sweep no arranque e sweep antes de criar removem JSONL e recursos.

**Verificação:**

- [x] Testes com relógio injectado cobrem 23:59:59, 24:00:00, restart e cleanup.
- [x] Testes cobrem path traversal, IDs inválidos e acesso cruzado.

**Dependências:** Tarefas 2 e 3.

**Ficheiros prováveis:** novo workspace/manifest de sessão e testes.

**Âmbito:** Médio.

## 6. Fixar skills e ferramentas por sessão

**Descrição:** Resolver apenas skills built-in e do tenant, copiar as seleccionadas para o workspace
e guardar o snapshot do agente e ferramentas. Guardar UUID/versão das feature tools e rejeitar
sessões stale.

**Critérios de aceitação:**

- [x] O snapshot usa `AgentData` normalizado e não volta a ler o agente nas mensagens seguintes.
- [x] Apenas skills permitidas pelo agente são copiadas e oferecidas ao Pi.
- [x] A cópia preserva referências internas, rejeita escapes por symlink e tem limites definidos.
- [x] Feature removida ou modificada produz `StaleSession`; código antigo não é arquivado.
- [x] Ferramentas e skills novas não aparecem numa sessão existente.

**Verificação:**

- [x] Testes alteram agente, skills e features após a criação e confirmam o snapshot.
- [x] Testes de segurança cobrem symlinks externos e árvores acima do limite.

**Dependências:** Tarefas 4 e 5.

**Ficheiros prováveis:** loader/snapshot de skills, builder de ferramentas, manifest e testes.

**Âmbito:** Médio.

## 7. Criar a factory de `AgentSession`

**Descrição:** Encapsular `createAgentSession()` para sessões in-memory e persistidas. Fornecer
modelo, thinking level, runtime, system prompt, ferramentas e skills do snapshot. Aplicar timeout de
cinco minutos e dispose obrigatório.

**Critérios de aceitação:**

- [x] Sessões persistidas reabrem o JSONL e recebem apenas a nova mensagem.
- [x] Sessões in-memory aceitam o histórico legado de `/chat`.
- [x] O resource loader não descobre skills, extensões, contexto ou prompts fora do snapshot.
- [x] Aos cinco minutos a factory chama `abort()`, aguarda término e devolve erro de timeout.
- [x] Uma execução terminada sem resposta final do modelo devolve erro, sem chamada de síntese.

**Verificação:**

- [x] Testes com fake clock/agent cobrem timeout, abort, dispose e erro incompleto.
- [x] Teste de integração prova contexto na segunda mensagem após reabrir o ficheiro.

**Dependências:** Tarefas 4, 5 e 6.

**Ficheiros prováveis:** nova factory de sessão, resource loader isolado e testes.

**Âmbito:** Médio.

## Checkpoint: sessão Pi completa

- [x] Criar, fechar processo, reabrir e continuar uma sessão em teste.
- [x] Confirmar que nenhum recurso global de Pi foi carregado.
- [x] Confirmar isolamento de tenant/utilizador/agente.

## 8. Migrar o `AgentsEngine`

**Descrição:** Substituir a construção directa de `Agent` pela factory de sessões. Preservar
ferramentas, autorização, agentes internos/customizados, limites do tenant, eventos, telemetria e
conversão de mensagens.

**Critérios de aceitação:**

- [x] `chat` e `answer` legados funcionam através de sessões in-memory.
- [x] Interacções persistidas usam o snapshot e JSONL Pi.
- [x] `temperature`, `maxTokens`, `maxLlmCalls`, síntese final e store antigo deixam de participar.
- [x] Uso de tokens continua a publicar `AgentInteractionCompletedEvent` uma vez por interacção.
- [x] `TenantLimitsGuard`, exposição pública e execução interna preservam o comportamento.

**Verificação:**

- [x] Testes de regressão do engine cobrem chat, answer, ferramentas, skills, RAG e custom agents.
- [x] Testes confirmam que uma execução tool-only falha sem segunda chamada ao modelo.

**Dependências:** Tarefa 7.

**Ficheiros prováveis:** engine, interface, testes e conversores de mensagens.

**Âmbito:** Grande, dividir por fluxo in-memory e persistido durante a implementação.

## 9. Adicionar a interface HTTP de sessões

**Descrição:** Adicionar criação com primeira mensagem, continuação e DELETE. Manter `/chat` e
`/answer`. Actualizar OpenAPI no mesmo commit.

**Critérios de aceitação:**

- [x] `POST /agents/{uuid}/-/sessions` exige `text` e devolve `sessionId`, `expiresAt` e mensagem.
- [x] `POST /agents/{uuid}/-/sessions/{sessionId}/messages` envia só a nova mensagem.
- [x] `DELETE /agents/{uuid}/-/sessions/{sessionId}` é idempotente para o proprietário.
- [x] Acesso cruzado não revela se a sessão existe.
- [x] Os endpoints antigos deixam de aceitar `temperature`, `maxTokens` e session IDs antigos.
- [x] OpenAPI contém paths, schemas, exemplos, erros e segurança correctos.

**Verificação:**

- [x] Testes de handlers e router cobrem happy path, expiração, stale, timeout e autorização.
- [x] Validar `openapi.yaml` e executar testes HTTP existentes.

**Dependências:** Tarefa 8.

**Ficheiros prováveis:** handlers, router, testes, `openapi.yaml`.

**Âmbito:** Grande, dividir implementação e contrato OpenAPI em commits coordenados.

## 10. Remover implementação antiga e actualizar documentação

**Descrição:** Apagar `SessionStore`, runtime/provider resolver próprio e dependências explícitas de
providers de chat. Actualizar README, documentação de AI e exemplos de configuração.

**Critérios de aceitação:**

- [x] Não há registo manual de providers de chat no código Antbox.
- [x] Não há `SessionStore`, `maxLlmCalls`, `temperature` ou `maxTokens` nas interfaces públicas.
- [x] Embeddings e OCR continuam configuráveis pelos adapters actuais.
- [x] Documentação explica `dataDir`, resolução de paths, tuples, thinking levels, sessionsPath, 24
      horas e timeout.
- [x] Suporte de leitura a strings antigas fica marcado para remoção futura.

**Verificação:**

- [x] `rg` confirma ausência dos símbolos removidos, excepto notas de migração aprovadas.
- [x] README e exemplos são executáveis com a configuração documentada.

**Dependências:** Tarefas 8 e 9.

**Ficheiros prováveis:** módulos antigos, `deno.json`, README e documentação AI.

**Âmbito:** Médio.

## 11. Validar e fazer rollout

**Descrição:** Executar todos os quality gates e testar com Gemini real em dois tenants. Actualizar
configurações local e remota apenas depois de publicar uma imagem compatível.

**Critérios de aceitação:**

- [x] Configuração local usa ou valida `~/.local/share/antbox`.
- [ ] Produção arranca com `--data-dir /data`.
- [x] Paths relativos antigos foram convertidos em absolutos ou os dados foram movidos manualmente.
- [x] Nenhum dado é movido automaticamente pelo Antbox.
- [x] Uma conversa continua depois de restart e permanece isolada entre tenants.
- [x] Sessão stale, expirada e com timeout devolve o erro esperado.
- [ ] Chat, embeddings, OCR e pesquisa semântica Gemini continuam funcionais.

**Verificação:**

- [x] `deno fmt --check`
- [x] `deno lint`
- [x] `deno check main.ts`
- [x] `deno task test`
- [x] `deno task build:antbox`
- [x] Teste real de criação, segunda mensagem, restart, isolamento e DELETE.
- [x] Autoreview final do diff.

**Dependências:** Todas as tarefas anteriores.

**Ficheiros prováveis:** configurações de deployment fora do repositório; nenhuma credencial nova.

**Âmbito:** Médio.
