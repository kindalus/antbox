# Configuração distribuída de tenants

## Problema

Permitir a gestão manual e administrativa de tenants sem transformar `config.toml` num ficheiro
demasiado grande, preservando instalações existentes.

## Direcção recomendada

O Antbox continua a carregar tenants inline de `config.toml` e acrescenta suporte a ficheiros
individuais em `<configDir>/tenants.d/`.

Cada tenant externo usa `<name>.toml`. A API preserva a origem dos tenants existentes e cria novos
tenants na directoria. A configuração externa vence quando o mesmo nome existe nas duas origens.

## Contrato de carregamento

1. Carregar `config.toml`.
2. Tentar criar `tenants.d`.
3. Se não for possível criar, emitir warning e continuar.
4. Recriar `tenant.toml.sample` sempre que estiver ausente.
5. Ler apenas ficheiros regulares terminados em `.toml`.
6. Validar cada configuração.
7. Exigir correspondência exacta entre `name` e o nome do ficheiro.
8. Resolver caminhos relativos contra `<configDir>`.
9. Exigir pelo menos um tenant válido.

Um ficheiro TOML inválido ou uma directoria existente mas ilegível aborta o arranque com `ERROR`.

## Nomes permitidos

Todos os tenants, incluindo os definidos em `config.toml`, devem cumprir:

```regex
^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$
```

## Precedência e ordenação

- `tenants.d/<name>.toml` vence uma definição inline com o mesmo nome.
- O sistema emite warning quando encontra essa duplicação.
- A substituição externa mantém a posição do tenant inline.
- Tenants apenas externos são acrescentados por ordem alfabética.
- `GET /admin/tenants` devolve esta ordem canónica.

## Tenant administrativo

O sistema escolhe o tenant administrativo nesta ordem:

1. tenant efectivo chamado `default`;
2. primeiro tenant definido em `config.toml`;
3. nenhum tenant administrativo, se as condições anteriores falharem.

Nesse último caso, o servidor continua a funcionar, mas regista um warning e os endpoints
administrativos devolvem `404`.

## Escrita pela API

O actual `PUT /admin/tenants` continua a substituir a lista completa:

- tenant novo: criar `tenants.d/<name>.toml`;
- tenant existente: actualizar o ficheiro de origem efectiva;
- tenant omitido: remover todas as definições com esse nome;
- tenant renomeado: eliminar o nome anterior e criar um novo ficheiro;
- tenant duplicado alterado: actualizar a definição externa;
- tenant duplicado eliminado: remover tanto o ficheiro externo como a definição inline.

Antes da escrita, o sistema valida o conjunto completo. As alterações usam ficheiros temporários e
cópias para rollback se uma escrita ou o reload falhar.

## Sample

O sample omite `[ai]` quando AI estiver desactivada:

```toml
name = "tenant"
storage = ["flat_file/flat_file_storage_provider.ts", "tenant/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "tenant/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "tenant/configuration"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "tenant/events"]

[limits]
storage = "pay-as-you-go"
tokens = 0
```

## Não incluído

- Preservação de comentários nos ficheiros alterados pela API.
- Detecção de edições manuais concorrentes.
- ETags ou bloqueios de configuração.
- Monitorização automática da directoria.
- Subdirectorias, links simbólicos ou includes recursivos.
- Migração automática dos tenants inline.
- Novos endpoints CRUD por tenant.

## Hipóteses aceites

- Edições concorrentes usam last-write-wins.
- A API pode normalizar a formatação do ficheiro alterado.
- Nomes antigos que não cumpram o novo formato impedem o arranque.
- A remoção do tenant administrativo pode deixar a API administrativa indisponível até haver uma
  correcção manual.

## Critérios de aceitação

- Configurações antigas continuam a carregar se os nomes dos tenants forem válidos.
- Novos tenants administrativos criam ficheiros individuais.
- Alterações preservam a origem.
- Eliminações não fazem tenants antigos reaparecer.
- Falhas durante a escrita restauram todos os ficheiros afectados.
- Restart e reload produzem a mesma lista e ordem.
- `openapi.yaml` documenta a nova semântica administrativa.
