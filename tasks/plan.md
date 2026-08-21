# Plano: dataDir, sessões e modelos geridos pelo Pi

## Estado

Implementado e validado localmente. A configuração remota já inclui `sessionsPath`; falta publicar e
arrancar a nova imagem do backend em produção.

## Objectivo

Separar dados persistentes da configuração através de `dataDir` e entregar ao Pi a resolução de
modelos, autenticação, thinking level, skills e sessões dos agentes. O Antbox mantém as regras de
tenant, autorização, ferramentas, limites de tokens e telemetria, mas deixa de registar providers de
chat e de manter histórico conversacional próprio.

## Decisões fechadas

- Remover apenas os providers de chat mantidos pelo Antbox. Embeddings e OCR permanecem.
- Migrar em duas fases internas:
  1. adoptar `ModelRuntime` e resolução nativa do Pi;
  2. executar interacções através de `createAgentSession()`.
- Representar modelos como tuples:
  - `["google/gemini-flash-latest"]` equivale a thinking level `off`;
  - `["google/gemini-flash-latest", "medium"]` define o nível explicitamente.
- Aceitar temporariamente o formato antigo em string e normalizá-lo para tuple.
- Aplicar o mesmo contrato a `AgentData.model`.
- Criar um `ModelRuntime` por tenant. As credenciais vêm apenas das variáveis de ambiente.
- Resolver apenas skills built-in do Antbox e o `skillsPath` do tenant.
- Introduzir `dataDir`, independente de `configDir`, com default `~/.local/share/antbox`.
- Expor `-d, --data-dir <dir>` tal como `-c, --config-dir <dir>`.
- Resolver caminhos de dados relativos contra `dataDir`; caminhos absolutos permanecem inalterados.
- Aceitar `vcrm`, `./vcrm` e `./data/vcrm`; rejeitar qualquer caminho relativo com um segmento `..`.
- Aplicar `dataDir` apenas a paths dos adapters flat-file/SQLite e a `sessionsPath`.
- Continuar a resolver keys, JWKS, `skillsPath`, configurações S3 e credenciais Google contra
  `configDir`. URLs, IDs e restantes parâmetros não são paths e não são alterados.
- Não criar `dataDir` no carregamento; cada consumidor cria apenas a directoria que usa.
- Guardar sessões Pi em JSONL sob `sessionsPath`.
- Usar `<dataDir>/{tenant}/ai-sessions` quando `sessionsPath` não estiver configurado.
- Sessões expiram 24 horas após a criação. Não há extensão por actividade.
- Cada execução tem timeout interno de cinco minutos.
- Uma sessão fixa a definição do agente, selecção de ferramentas e skills no momento da criação.
- Features usadas como ferramentas são validadas por identidade e versão. Uma alteração ou remoção
  produz `StaleSession`; o Antbox não arquiva código executável de features.
- Skills seleccionadas são copiadas para os recursos da sessão, incluindo ficheiros referenciados.
- Remover `temperature`, `maxTokens` e `maxLlmCalls` das interfaces públicas e persistidas.
- Remover a chamada adicional de síntese final. Uma execução Pi incompleta devolve erro.
- Adicionar endpoints de sessões sem remover já `/chat` e `/answer`.
- A criação da sessão inclui obrigatoriamente a primeira mensagem.

## Arquitectura proposta

### Directórios e resolução de paths

Sem argumentos CLI:

```text
configDir = ~/.config/antbox
dataDir   = ~/.local/share/antbox
```

O runtime transporta ambos os directórios como valores derivados; não os grava no TOML. O reload
recebe os mesmos valores usados no arranque. Os modos `--demo` e `--sandbox` mantêm dados isolados
nas respectivas directorias de desenvolvimento, salvo override explícito de `--data-dir`. A
resolução de um data path segue uma única função:

```text
vcrm             -> <dataDir>/vcrm
./vcrm           -> <dataDir>/vcrm
./data/vcrm      -> <dataDir>/data/vcrm
/vcrm            -> /vcrm
../vcrm          -> erro
foo/../../vcrm   -> erro
```

A validação rejeita lexicalmente qualquer segmento `..` antes da normalização. Não expande `~`.
Paths relativos de configuração continuam a usar `configDir`. Como os parâmetros dos adapters também
podem ser URLs, IDs ou nomes de bases de dados, apenas os parâmetros de path conhecidos dos adapters
flat-file e SQLite passam pelo resolver de dados.

A configuração inicial passa a usar paths por tenant sem o prefixo redundante `data`:

```toml
storage = ["flat_file/flat_file_storage_provider.ts", "default/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "default/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "default/config"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "default/events"]
```

### Selecção de modelo

Um tipo partilhado representa a selecção:

```typescript
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type ModelSelection = readonly [model: string, thinkingLevel?: ThinkingLevel];
```

O loader normaliza strings antigas para `[model, "off"]`. A escrita administrativa grava apenas o
novo formato. O Pi resolve a string `provider/model`; o Antbox não analisa providers nem constrói
modelos desconhecidos.

### Runtime por tenant

`setupTenant()` cria um `ModelRuntime` com credenciais em memória e autenticação por variáveis de
ambiente. Não serão lidos `~/.pi/agent/auth.json`, extensões, prompts, contexto ou skills do host. O
runtime vive durante a vida do tenant e é partilhado pelas suas sessões.

### Organização das sessões

```text
<dataDir>/vcrm/ai-sessions/
└── <session-id>/
    ├── <timestamp>_<session-id>.jsonl
    └── resources/
        ├── manifest.json
        └── skills/
            └── <skill>/
                ├── SKILL.md
                └── ...
```

O identificador é gerado pelo servidor e validado antes de ser usado num caminho. Cada pasta contém
uma única sessão Pi. O manifest inclui tenant, utilizador, agente, criação, expiração, `AgentData`
normalizado, ferramentas seleccionadas e versões das feature tools. Os mesmos metadados essenciais
são registados como custom entry na sessão Pi.

O Antbox não mantém um índice ou histórico paralelo. A localização deriva de tenant e session ID. Ao
abrir uma sessão, o servidor valida o manifest, autorização, prazo e versões das features antes de
chamar o Pi.

### Snapshot de skills e ferramentas

Na criação:

1. Resolver skills built-in e do `skillsPath` do tenant.
2. Aplicar a whitelist do agente.
3. Copiar as directorias seleccionadas para `resources/skills` sem seguir symlinks para fora das
   raízes permitidas.
4. Guardar nomes e metadados no manifest.
5. Guardar as feature tools seleccionadas com UUID e versão.

Ao retomar:

- carregar apenas as skills copiadas;
- reconstruir ferramentas built-in pelos nomes guardados;
- confirmar que cada feature tool ainda existe com a mesma versão;
- falhar com `StaleSession` se não for possível reconstruir o snapshot.

### Fluxos de execução

#### Sessão persistida

```http
POST /agents/{uuid}/-/sessions
POST /agents/{uuid}/-/sessions/{sessionId}/messages
DELETE /agents/{uuid}/-/sessions/{sessionId}
```

A primeira operação cria, faz snapshot e executa a primeira mensagem. A segunda abre o JSONL e envia
apenas a nova mensagem. A terceira elimina o JSONL e recursos após validar o proprietário.

#### Compatibilidade

`/chat` continua a aceitar histórico enviado pelo cliente e usa uma `AgentSession` in-memory.
`/answer` continua one-shot e também usa uma sessão in-memory. Ambos deixam de aceitar
`temperature`, `maxTokens` e `sessionId` do store antigo.

### Timeout e expiração

Um temporizador de cinco minutos chama `session.abort()`. O engine aguarda o encerramento, faz
`dispose()` em `finally` e devolve um erro estável de timeout.

Sessões com 24 horas ou mais não podem ser abertas. O sistema remove sessões expiradas no arranque
do tenant e antes de criar uma nova sessão. Isto evita um processo de limpeza por tenant sempre
activo; a expiração de acesso é exacta, enquanto a remoção física é oportunista.

## Dependências

```text
Viabilidade Deno do SDK Pi
        |
Contrato de configDir/dataDir
        |
Contrato ModelSelection
        |
Runtime Pi por tenant
        |
Workspace e snapshots de sessão
        |
Factory de AgentSession + skills
        |
Migração do AgentsEngine
        |
Endpoints e OpenAPI
        |
Remoções, documentação e rollout
```

## Fases

### Fase 1: provar integração e fechar contratos

- Validar `@earendil-works/pi-coding-agent` no Deno usado pelo projecto.
- Introduzir `dataDir`, CLI, resolução segura e configuração inicial actualizada.
- Introduzir `ModelSelection` e migração compatível.
- Introduzir runtime Pi por tenant sem credenciais ou recursos globais do host.

### Fase 2: persistência e recursos

- Criar workspace seguro por sessão.
- Persistir manifest e custom entry.
- Copiar e resolver snapshots de skills.
- Validar versões de feature tools e expiração.

### Fase 3: execução

- Criar uma factory de `AgentSession` para sessões in-memory e persistidas.
- Migrar `AgentsEngine` preservando autorização, ferramentas, limites de tenant, eventos e
  telemetria.
- Remover os parâmetros de geração, o limite de chamadas e a síntese final.

### Fase 4: interface e rollout

- Adicionar endpoints e actualizar OpenAPI no mesmo commit.
- Manter endpoints antigos durante a transição.
- Remover runtime e store antigos quando os testes de paridade passarem.
- Actualizar documentação e configurações local/remota.

## Riscos e mitigação

| Risco                                                               | Impacto | Mitigação                                                                     |
| ------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| SDK completo do Pi falhar sob Deno                                  | Alto    | Spike executável antes da refactorização                                      |
| Loop de ferramentas sem `maxLlmCalls`                               | Alto    | Timeout interno de cinco minutos e limites de tokens do tenant                |
| Fuga de sessão entre tenants/utilizadores                           | Alto    | Caminho por tenant, ID validado e manifest autenticado antes de abrir         |
| Skills do host entrarem num tenant                                  | Alto    | Resource loader isolado, apenas raízes Antbox configuradas                    |
| Feature tool mudar durante a sessão                                 | Médio   | Guardar versão e devolver `StaleSession`                                      |
| Skill conter symlink ou árvore excessiva                            | Alto    | Validar `realpath`, rejeitar symlinks externos e aplicar limites de cópia     |
| Sessões antigas ocuparem disco                                      | Médio   | Sweep no arranque e na criação; DELETE explícito                              |
| Formato novo quebrar configurações e agentes existentes             | Alto    | Leitura compatível de strings, escrita canónica em tuple                      |
| Migração perder telemetria ou cobrança                              | Alto    | Testes de uso, eventos e `TenantLimitsGuard` antes de remover o engine antigo |
| Path relativo existente mudar de localização e abrir uma base vazia | Alto    | Migração explícita; nenhuma movimentação automática                           |
| Parâmetro de adapter que não é path ser alterado                    | Alto    | Resolver apenas posições conhecidas de adapters de filesystem                 |

## Fora do âmbito

- Substituir embeddings ou OCR pelo Pi.
- Credenciais diferentes por tenant.
- Copiar e executar versões antigas do código de features.
- Listar, partilhar, ramificar ou importar sessões pela API nesta entrega.
- Remover já `/chat` e `/answer`.
- Usar skills, extensões, prompts ou contexto de `~/.pi` e do projecto anfitrião.
- Migrar sessões antigas do `SessionStore`, pois eram apenas in-memory.
- Mover automaticamente dados existentes de `configDir` para `dataDir`.
- Tratar parâmetros arbitrários de adapters como paths.

## Critérios globais de conclusão

- `configDir` e `dataDir` têm defaults e overrides CLI independentes.
- Data paths relativos usam `dataDir`, absolutos são preservados e traversal é rejeitado.
- Configurações antigas em string continuam a arrancar e são normalizadas.
- Configurações novas controlam modelo e thinking level no Pi.
- Uma segunda mensagem recupera contexto apenas pelo `sessionId`.
- Reiniciar o processo não perde sessões com menos de 24 horas.
- Outro tenant, utilizador ou agente não consegue abrir ou apagar a sessão.
- Agente, ferramentas e skills permanecem fixos; alterações de feature geram `StaleSession`.
- Timeout aborta a execução em cinco minutos e liberta recursos.
- Não restam registos explícitos de providers de chat no Antbox.
- Embeddings, OCR, RAG, limites, eventos e telemetria continuam funcionais.
- OpenAPI, README e documentação descrevem o contrato real.
- `deno task test`, `deno lint`, `deno fmt --check`, `deno check main.ts` e build passam.

## Rollout

1. Inventariar todos os paths relativos existentes antes da actualização.
2. Preservar cada path como absoluto ou mover os dados manualmente para o novo `dataDir`.
3. Publicar uma imagem com suporte simultâneo ao formato antigo e novo.
4. Arrancar localmente com o default `~/.local/share/antbox` ou `--data-dir` explícito.
5. Arrancar a produção com `--data-dir /data`; paths absolutos existentes continuam válidos.
6. Executar testes reais de sessão, isolamento e Gemini.
7. Confirmar expiração e remoção numa sessão criada com relógio controlado em teste.
8. Só numa entrega posterior remover suporte ao modelo em string e os endpoints legados.
