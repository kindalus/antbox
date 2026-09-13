# Plano: substituir integralmente MCP 2025-11-25 por MCP 2026-07-28

## Objectivo

Migrar o Antbox e o Lightray para MCP `2026-07-28` e **remover por completo** a implementação, os
testes, a documentação e os comportamentos de compatibilidade com `2025-11-25` e versões anteriores.

O resultado final suporta uma única era e uma única versão:

- protocolo: `2026-07-28`;
- transporte: Streamable HTTP moderno, apenas `POST /mcp`;
- sem `initialize`, `notifications/initialized`, `ping`, sessões, GET MCP, DELETE MCP,
  `Last-Event-ID` ou fallback legacy;
- sem adaptador dual-era, feature flag ou tradução de pedidos antigos.

Esta é uma alteração incompatível. Clientes antigos devem ser actualizados antes do corte; o
servidor não os manterá funcionais.

## Estado actual

### Antbox

- anuncia `MCP_PROTOCOL_VERSION = "2025-11-25"` em `src/adapters/mcp/mcp_server.ts`;
- implementa `initialize`, `notifications/initialized` e `ping`;
- aceita pedidos sem metadata moderna;
- trata `MCP-Protocol-Version` como opcional;
- não implementa `server/discover`;
- não devolve `resultType`, hints de cache ou metadata do servidor em cada resultado;
- devolve HTTP 200 para erros de método e aceita respostas JSON-RPC enviadas pelo cliente;
- não valida os cabeçalhos espelhados nem `Origin`.

### Lightray

- encaminha `/mcp` e qualquer `/mcp/**`;
- usa H3 `1.15.11`, cujo `proxyRequest` remove o cabeçalho `Accept`;
- não tem testes MCP;
- aparenta encaminhar SSE, mas cancelamento e ausência de buffering não estão verificados.

## Decisões fechadas

1. **Modern-only:** não implementar detecção de era nem responder segundo contratos anteriores.
2. **Uma versão:** `supportedVersions` contém apenas `2026-07-28`.
3. **Sem SDK novo:** manter a implementação pequena existente e validar os tipos necessários com
   Zod; não importar a totalidade do protocolo nem adicionar dependência sem necessidade.
4. **Sem funcionalidades especulativas:** não implementar prompts, MRTR, tasks, sampling, roots,
   logging MCP, `subscriptions/listen` ou `x-mcp-header` enquanto as capacidades actuais não os
   exigirem.
5. **Sem SSE no Antbox nesta entrega:** respostas continuam `application/json`; Lightray deve ficar
   preparado e testado para SSE, mas o Antbox anuncia `listChanged: false` e `subscribe: false`.
6. **Autorização preservada:** bearer/API key continua a activar tools; acesso anónimo continua
   limitado a resources; autorização e tenant são recalculados em cada pedido.
7. **Endpoint único:** Lightray e Antbox expõem apenas `POST /mcp`; subpaths deixam de existir.
8. **Corte coordenado:** publicar primeiro o Lightray transparente e depois o Antbox modern-only.

## Contrato final

### Pedido moderno mínimo

Todo pedido aceite contém:

- `jsonrpc: "2.0"`;
- `id` string ou inteiro;
- `method`;
- `params._meta["io.modelcontextprotocol/protocolVersion"] = "2026-07-28"`;
- `params._meta["io.modelcontextprotocol/clientCapabilities"]`;
- `MCP-Protocol-Version: 2026-07-28`;
- `Mcp-Method` igual a `method`;
- `Mcp-Name` igual a `params.name` ou `params.uri` para `tools/call` e `resources/read`;
- `Accept` contendo `application/json` e `text/event-stream`.

`clientInfo` é opcional, mas aceite e registado apenas como diagnóstico. Nunca participa em
identidade, autorização ou routing.

### Resultado moderno mínimo

Todo resultado de sucesso contém:

- `resultType: "complete"`;
- `_meta["io.modelcontextprotocol/serverInfo"]` com nome e versão do Antbox.

`server/discover`, `tools/list`, `resources/list`, `resources/templates/list` e `resources/read`
também contêm `ttlMs >= 0` e `cacheScope`.

### Política inicial de cache

| Método                     | `ttlMs` | `cacheScope` | Razão                                    |
| -------------------------- | ------: | ------------ | ---------------------------------------- |
| `server/discover`          |       0 | `private`    | capacidades variam com bearer            |
| `tools/list`               |  300000 | `private`    | tools só existem no contexto autenticado |
| `resources/list`           |  300000 | `private`    | evitar pressuposto cross-tenant          |
| `resources/templates/list` |  300000 | `private`    | evitar pressuposto cross-tenant          |
| `resources/read` de docs   |  300000 | `public`     | conteúdo curado e público                |
| `resources/read` de nodes  |       0 | `private`    | dados e permissões mutáveis              |

Os valores são hints no payload, não uma ordem para o Lightray criar cache HTTP.

### Erros e estados HTTP

| Condição                                         |          HTTP |                                JSON-RPC |
| ------------------------------------------------ | ------------: | --------------------------------------: |
| JSON inválido                                    |           400 |                                `-32700` |
| envelope/pedido/params inválidos                 |           400 |    `-32600` ou `-32602` conforme o caso |
| `_meta` obrigatório ausente                      |           400 |                                `-32602` |
| versão não suportada                             |           400 | `-32022`, com `supported` e `requested` |
| header obrigatório ausente ou diferente do corpo |           400 |                                `-32020` |
| `Origin` presente e não permitido                |           403 |                 corpo JSON-RPC opcional |
| método não implementado                          |           404 |                                `-32601` |
| URI inexistente em `resources/read` válido       |           200 |                  erro JSON-RPC `-32602` |
| notification aceite                              | 202 sem corpo |                                         |

Eliminar os códigos MCP internos actuais `-32001`, `-32003` e `-32004`. Autenticação HTTP mantém
401/403; erros de tools continuam resultados `isError: true`; erros próprios que precisem de código
JSON-RPC usam valores fora das faixas reservadas.

## Plano de implementação

### Fase 0 — preparar o corte incompatível

#### Tarefa 0.1 — inventariar e actualizar consumidores

- identificar todos os clientes que chamam `/mcp`, incluindo integrações directas e URLs Lightray;
- actualizar cada cliente para emitir metadata e cabeçalhos `2026-07-28`;
- remover configurações ou exemplos que ainda façam `initialize`;
- definir uma janela única de deploy e um responsável pelo go/no-go.

**Aceitação**

- [ ] nenhum consumidor conhecido depende de `initialize` ou `2025-11-25`;
- [ ] existe um smoke test moderno executável contra um ambiente de ensaio;
- [ ] a incompatibilidade consta das notas da release major.

Esta tarefa não cria compatibilidade no servidor. Apenas evita um corte cego.

### Fase 1 — corrigir primeiro o proxy Lightray

Implementar no repositório `../../zafir-co-ao/lightray`.

#### Tarefa 1.1 — tornar `/mcp` transparente

Alterar `server/routes/mcp.ts` para:

- preservar explicitamente o `Accept` recebido, contornando a denylist do H3;
- continuar a encaminhar `Authorization`, `Origin`, `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`
  e qualquer `Mcp-Param-*` sem alteração;
- injectar apenas `x-tenant`;
- não analisar nem reescrever o corpo JSON-RPC;
- encaminhar status, content type e corpo exactamente como recebidos do Antbox.

#### Tarefa 1.2 — remover subpaths MCP

- apagar `server/routes/mcp/[...path].ts`;
- actualizar `README.md`, `AGENTS.md` e docs de instalação para mencionar apenas
  `server/routes/mcp.ts` e `POST /mcp`;
- ajustar as regex PWA para cobrir literalmente `/mcp`, embora o endpoint continue network-only.

#### Tarefa 1.3 — provar forwarding e streaming

Adicionar `tests/mcp-proxy.test.mjs` com upstream HTTP descartável e servidor Lightray/Nitro de
teste. Cobrir:

- corpo binariamente/semanticamente inalterado;
- `Accept` e todos os cabeçalhos MCP preservados;
- bearer preservado e `x-tenant` injectado;
- respostas JSON e erros 400/403/404 preservados;
- SSE entregue por chunks, sem compressão/buffering;
- `X-Accel-Buffering: no` preservado;
- fecho pelo cliente aborta a ligação upstream;
- `/mcp/qualquer-coisa` não é encaminhado.

Se `proxyRequest` não propagar abort, usar um `AbortController` ligado ao fecho do socket e passá-lo
à fetch upstream. Não criar um proxy MCP próprio se a opção `signal` do H3 resolver.

**Aceitação da fase**

- [ ] `npm test` passa;
- [ ] `npm run build` passa;
- [ ] o mesmo teste passa numa cadeia Lightray → Lightray → upstream;
- [ ] nenhuma rota catch-all MCP permanece.

A fase é compatível com o Antbox antigo e pode ser publicada primeiro.

### Fase 2 — substituir a validação HTTP no Antbox

#### Tarefa 2.1 — definir schemas modernos

Em `src/adapters/mcp/mcp_server.ts`:

- mudar `MCP_PROTOCOL_VERSION` para `2026-07-28`;
- criar schema Zod para `_meta` moderno e incorporá-lo em todos os requests;
- exigir `protocolVersion` e `clientCapabilities`;
- aceitar `clientInfo`, `logLevel` e trace metadata sem lhes atribuir autoridade;
- manter schemas de argumentos de tools/resources existentes;
- limitar schemas aos tipos realmente suportados.

#### Tarefa 2.2 — validar o transporte antes do despacho

Em `src/adapters/mcp/mcp_http_handler.ts`:

- validar `Origin` antes de autenticação e processamento;
- exigir `Accept`, `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name` quando aplicável;
- implementar descodificação segura do sentinel Base64 de `Mcp-Name`;
- comparar headers com o corpo e devolver `HeaderMismatch -32020`;
- devolver `UnsupportedProtocolVersion -32022` com a única versão suportada;
- rejeitar envelopes JSON-RPC de resposta enviados pelo cliente;
- mapear método desconhecido para HTTP 404;
- manter 202 apenas para notifications efectivamente aceites;
- manter query auth rejeitado e bearer validado por tenant.

Adicionar configuração explícita de origins permitidas na configuração do servidor. A ausência de
`Origin` é aceite para clientes não-browser; uma origem presente só passa se constar da allowlist.
Incluir a origem pública do Lightray no deployment. Não reutilizar o middleware CORS permissivo
actual como controlo de DNS rebinding.

#### Tarefa 2.3 — limitar a fronteira

No mesmo handler:

- impor limite explícito ao corpo antes de `JSON.parse`;
- nunca incluir bearer, conteúdo de resources ou argumentos completos nos logs;
- manter logs por tenant, principal, método, status e duração;
- documentar o limite escolhido.

**Aceitação da fase**

- [ ] cada validação tem teste positivo e negativo;
- [ ] headers com CR/LF, Base64 inválido ou valor diferente são rejeitados;
- [ ] origem inválida devolve 403 sem chegar a `NodeService`;
- [ ] token de outro tenant não ganha acesso;
- [ ] nenhum pedido moderno sem metadata é executado.

### Fase 3 — implementar o protocolo moderno

#### Tarefa 3.1 — implementar `server/discover`

Adicionar ao dispatcher:

- `supportedVersions: ["2026-07-28"]`;
- capabilities por pedido/contexto de autorização;
- resources sempre anunciados;
- tools apenas com bearer válido;
- `instructions` coerentes com o modo anónimo/autenticado;
- `resultType`, `serverInfo`, `ttlMs` e `cacheScope`.

#### Tarefa 3.2 — normalizar todos os resultados

Alterar o helper central de resultados para acrescentar:

- `resultType: "complete"`;
- `_meta.io.modelcontextprotocol/serverInfo`.

Nos métodos cacheáveis, acrescentar a política definida acima. Confirmar explicitamente que:

- `tools/call` preserva `content`, `structuredContent` e `isError`;
- `resources/read` escolhe scope pela classe de URI, nunca pelo pedido do cliente;
- listas permanecem determinísticas;
- resultados não incluem campos legacy.

#### Tarefa 3.3 — corrigir códigos de erro

- implementar `-32020` e `-32022` apenas com os significados da especificação;
- reservar `-32021` para uma futura operação que realmente exija uma capacidade de cliente não
  declarada; nenhuma operação actual precisa de o emitir;
- mudar resource-not-found para `-32602`;
- retirar `-32001`, `-32003` e `-32004` do dispatcher MCP;
- preservar 401/403 HTTP para falhas de bearer/autorização na fronteira apropriada;
- garantir que erros de negócio de tools continuam em `ToolResult.isError`, não em erros de
  protocolo.

**Aceitação da fase**

- [ ] `server/discover` passa contra o schema oficial;
- [ ] todo resultado de sucesso tem `resultType` e `serverInfo`;
- [ ] todo resultado cacheável tem TTL/scope;
- [ ] node autenticado/restrito nunca recebe scope público;
- [ ] nenhum código MCP reservado é reutilizado indevidamente.

### Fase 4 — apagar integralmente a versão anterior

#### Tarefa 4.1 — apagar código legacy

Remover de `src/adapters/mcp/mcp_server.ts` e do handler:

- `initializeParamsSchema`;
- cases `initialize`, `notifications/initialized` e `ping`;
- qualquer negociação por handshake;
- aceitação de header de versão ausente;
- tratamento de respostas JSON-RPC client→server;
- comentários, tipos e helpers usados apenas pelo contrato anterior.

Não deixar stubs, aliases, warnings de depreciação, fallback ou feature flags.

#### Tarefa 4.2 — substituir, não duplicar, os testes

Em `mcp_server_test.ts` e `mcp_http_handler_test.ts`:

- apagar testes que esperam sucesso de `initialize`/`notifications/initialized`/`ping`;
- converter helpers de request para emitirem metadata e headers modernos por defeito;
- adicionar testes explícitos de remoção:
  - `initialize` sem headers modernos → 400;
  - `initialize` com envelope moderno válido → 404 / `-32601`;
  - `ping` moderno → 404 / `-32601`;
  - `notifications/initialized` não é aceite;
  - `2025-11-25` → 400 / `-32022`, suportando apenas `2026-07-28`;
- manter cobertura dos tools, resources, autorização e tenants existentes.

#### Tarefa 4.3 — remover documentação legacy

Actualizar no mesmo conjunto de mudanças:

- `README.md`;
- `docs/mcp.md`;
- `openapi.yaml`.

Os exemplos curl passam a usar `server/discover` e incluem todos os headers/metadata. Remover toda
instrução para `initialize`, toda referência de suporte a `2025-11-25` e qualquer promessa de
compatibilidade.

**Aceitação da fase**

- [ ] `rg '2025-11-25|notifications/initialized|initializeParamsSchema'` não encontra referências
      fora deste plano/histórico;
- [ ] `rg 'case "initialize"|case "ping"' src/adapters/mcp` não encontra resultados;
- [ ] OpenAPI e docs descrevem exclusivamente `2026-07-28`;
- [ ] nenhum teste legacy foi mantido como compatibilidade.

### Fase 5 — validação integrada e release

#### Tarefa 5.1 — conformance e regressão

Executar:

```bash
# Antbox
deno fmt --check
deno lint
deno task test

# Lightray
npm test
npm run build
```

Além disso, executar uma matriz real através do Antbox directo e do Lightray:

1. `server/discover` anónimo;
2. `server/discover` autenticado;
3. `tools/list` e `tools/call` autenticados;
4. `resources/list`, templates e reads públicos/privados;
5. todos os erros de headers, versão, origem e método;
6. tenant default, tenant explícito e tenant inválido;
7. pedido antigo, que deve falhar determinística e explicitamente.

Validar respostas/resultados contra o
[schema TypeScript oficial](https://github.com/modelcontextprotocol/specification/blob/main/schema/2026-07-28/schema.ts)
ou o JSON Schema gerado correspondente, sem copiar o schema inteiro para o runtime.

#### Tarefa 5.2 — release incompatível

- publicar Lightray primeiro;
- confirmar smoke test legacy e moderno de forwarding contra o Antbox ainda antigo;
- publicar Antbox modern-only;
- executar smoke test moderno via URL público;
- observar 400/404/401/403 e latência MCP;
- publicar release **major** e changelog com secção `Removed`;
- informar que clientes `2025-11-25` deixam de funcionar, sem anunciar janela de compatibilidade.

#### Rollback

O rollback é de release, não de protocolo dentro do mesmo binário:

- Lightray novo pode permanecer, porque o forwarding corrigido é compatível com o backend antigo;
- reverter Antbox restaura temporariamente o artefacto anterior, sabendo que clientes modernos
  deixam de funcionar;
- não introduzir um switch runtime para alternar versões.

**Go/no-go final**

- [ ] consumidores conhecidos actualizados;
- [ ] suites e build verdes;
- [ ] smoke test directo e via Lightray verde;
- [ ] origins de produção configuradas;
- [ ] dashboards/alertas prontos;
- [ ] release major e guia de migração publicados.

## Sequência de mudanças recomendada

1. **Lightray:** corrigir proxy, remover catch-all, adicionar testes.
2. **Antbox:** substituir contrato MCP inteiro e respectivos testes numa mudança atómica.
3. **Antbox:** actualizar OpenAPI/docs e adicionar notas de release no mesmo PR de contrato.
4. **Deploy:** Lightray, depois Antbox.

Não dividir o Antbox de forma que `main` anuncie `2026-07-28` antes de validar o contrato moderno,
ou que remova legacy sem ter `server/discover` funcional.

## Fora de âmbito

- compatibilidade com qualquer versão anterior;
- sessões ou handles de compatibilidade;
- GET/DELETE MCP;
- HTTP+SSE antigo;
- `subscriptions/listen` e notificações de mudança;
- respostas SSE emitidas pelo Antbox;
- prompts;
- MRTR, elicitation, sampling e roots;
- extensão tasks;
- `x-mcp-header` nos schemas dos tools;
- OAuth MCP completo; bearer/API key actual permanece.

## Fontes normativas

- [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)
- [Key Changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Base Protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic)
- [Versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [Caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching)
- [Schema autoritativo](https://github.com/modelcontextprotocol/specification/blob/main/schema/2026-07-28/schema.ts)
