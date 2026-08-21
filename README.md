# Antbox

**Open-source, API-first content platform for documents, workflows, and AI**

Antbox is an open-source, API-first content platform for managing documents, metadata, workflows,
search, and AI-powered knowledge across tenant-isolated environments. Built with Deno and
TypeScript, it combines ECM/DAM primitives, workflow orchestration, MCP access for LLM clients,
custom server-side features, and pluggable infrastructure in a single runtime.

## Highlights

- **Document Management** - Files, folders, smart folders, metadata, and permissions
- **Search** - Structured filters, full-text search, and semantic search
- **AI Agents + Skills** - Pi-powered agents, built-in RAG agents, and custom skills
- **MCP Server** - JSON-RPC endpoint with tenant-aware tools/resources for LLM clients
- **Custom Features** - Run JavaScript/TypeScript modules as actions/extensions/AI tools
- **Workflows** - Workflow definitions + runtime instances with transitions
- **Multi-Tenant** - Tenant-level isolation for repositories, storage, and keys
- **Pluggable Storage** - S3, Google Drive, flat-file, in-memory, null
- **Pluggable Repositories** - SQLite, PostgreSQL, MongoDB, flat-file, in-memory
- **Security** - JWT, API keys, group-based authorization, and audit endpoints

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.0+
- `jq` (optional, used in examples)

### Run Demo Server

```bash
git clone https://github.com/kindalus/antbox.git
cd antbox

# SQLite repositories + flat-file storage
./start_server.sh --demo
```

Server URL: `http://localhost:7180`

Demo tenant/password:

- tenant: `demo`
- root password: `demo`

### Authenticate as root

Root login endpoint expects the SHA-256 hex of `rootPasswd` in the request body.

```bash
BASE_URL="http://localhost:7180"
TENANT="demo"
ROOT_PASSWORD="demo"

ROOT_HASH=$(printf "%s" "$ROOT_PASSWORD" | shasum -a 256 | cut -d' ' -f1)

JWT=$(curl -sS -X POST "$BASE_URL/v2/login/root" \
  -H "X-Tenant: $TENANT" \
  --data "$ROOT_HASH" | jq -r '.jwt')
```

### First API Calls

```bash
# List root children
curl -sS "$BASE_URL/v2/nodes" \
  -H "X-Tenant: $TENANT" \
  -H "Authorization: Bearer $JWT"

# Semantic search
curl -sS -X POST "$BASE_URL/v2/nodes/-/find" \
  -H "X-Tenant: $TENANT" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"filters":"?contract approval policy","pageSize":10,"pageToken":1}'

# MCP handshake
MCP_TOKEN="<api-key-secret>"

curl -sS -X POST "$BASE_URL/mcp" \
  -H "X-Tenant: $TENANT" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}'
```

For a complete first workflow, see
[`docs/tutorial-upload-to-search.md`](docs/tutorial-upload-to-search.md) or run
`./examples/upload-to-search/upload-to-search.sh` after starting the demo server.

## Running the Server

Use `start_server.sh`:

```bash
./start_server.sh [OPTIONS]
```

| Option                 | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `--demo`               | Demo config directory (`.config/demo/`)                     |
| `--sandbox`            | Sandbox config directory (`.config/sandbox/`)               |
| `-c, --config-dir DIR` | Custom config directory (default `$HOME/.config/antbox`)    |
| `-d, --data-dir DIR`   | Custom data directory (default `$HOME/.local/share/antbox`) |
| `--keys`               | Generate and print crypto keys, then exit                   |
| `-h, --help`           | Show help                                                   |

Examples:

```bash
./start_server.sh --demo
./start_server.sh --sandbox
./start_server.sh -c /etc/antbox -d /var/lib/antbox
./start_server.sh --keys
```

### Debug logging and agent traces

Antbox supports environment-variable-based logging and agent tracing:

- `ANTBOX_LOG_LEVEL`
  - global log verbosity
  - valid values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- `ANTBOX_AGENT_DEBUG_TRACE`
  - enables extra debug logs for AI agent runs when set to `1`, `true`, `yes`, or `on`
  - includes selected tool names, lifecycle events, finish reasons, provider errors, token usage,
    and response-size summaries without logging prompts or tool payloads

Example:

```bash
ANTBOX_AGENT_DEBUG_TRACE=1 ANTBOX_LOG_LEVEL=debug ./start_server.sh --demo
```

If `config.toml` defines `logLevel`, Antbox uses it when `ANTBOX_LOG_LEVEL` is not set in the shell
environment.

### OpenTelemetry

The launcher includes Deno's `--unstable-otel` flag. Set `OTEL_DENO=true` and OTLP environment
variables such as `OTEL_EXPORTER_OTLP_ENDPOINT` to export Deno runtime telemetry, Antbox HTTP route
spans, and AI model telemetry. See `docs/observability.md` for details.

## Configuration

Antbox is configured via a central configuration directory. By default, it uses
`$HOME/.config/antbox` (or `%USERPROFILE%\.config\antbox` on Windows).

When you start Antbox for the first time, it will automatically:

1. Create this directory if it doesn't exist.
2. Generate a default `config.toml` file inside it.
3. Create `tenants.d/tenant.toml.sample`.
4. Generate cryptographic keys (`antbox.key`, `antbox.jwks`, and `antbox-private.jwk`).

You can override the configuration directory using `-c, --config-dir`. Persistent adapter data is
stored under `$HOME/.local/share/antbox` by default and can be overridden with `-d, --data-dir`.
Antbox creates only the data subdirectories that configured adapters actually use.

Each tenant defines these core adapters:

- `storage`
- `repository`
- `configurationRepository`
- `eventStoreRepository`

Module configuration format:

- `["module/path.ts", "param1", "param2"]`
- every tenant must define `limits`
- when AI is disabled, set `limits.tokens = 0`
- when AI is enabled, `limits.tokens` must be greater than `0` or `"pay-as-you-go"`

Minimal example of `config.toml`:

```toml
engine = "oak"
port = 7180
logLevel = "info"
rootPasswd = "demo"

[[tenants]]
name = "demo"
storage = ["flat_file/flat_file_storage_provider.ts", "demo/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "demo/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "demo/config"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "demo/events"]

[tenants.limits]
storage = "pay-as-you-go"
tokens = 0

[tenants.ai]
enabled = false
defaultModel = ["google/gemini-2.5-flash"]
```

Tenants can also be stored individually in `<config-dir>/tenants.d/<name>.toml`. These files contain
one tenant without the `tenants` prefix:

```toml
name = "company-a"
storage = ["flat_file/flat_file_storage_provider.ts", "company-a/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "company-a/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "company-a/config"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "company-a/events"]

[limits]
storage = "pay-as-you-go"
tokens = 0
```

Only regular `.toml` files are loaded. The filename must match `name`. Relative flat-file, SQLite,
and session paths resolve from `dataDir`; keys, JWKS, skills, S3 configuration, and Google
credentials resolve from `configDir`. A tenant file overrides an inline tenant with the same name.
Tenant names may contain lowercase letters, numbers, and internal hyphens only.

## API Overview

Base path: `/v2`

Full contract: `openapi.yaml`

### Authentication methods

| Method         | Format                           |
| -------------- | -------------------------------- |
| Bearer token   | `Authorization: Bearer <jwt>`    |
| Cookie         | `token=<jwt>`                    |
| API key header | `Authorization: ApiKey <secret>` |
| API key query  | `?api_key=<secret>`              |

MCP endpoint (`/mcp`) accepts optional `Authorization: Bearer <token>`. Current implementation uses
this bearer token as an API key secret. A valid bearer token exposes tools and resources; an invalid
bearer token is rejected; no bearer token exposes resources only. OAuth discovery/challenge flow for
MCP is not implemented yet.

Optional tenant selection:

- header: `X-Tenant: <tenant-name>`
- query: `?x-tenant=<tenant-name>`
- tenant name must match the configured tenant `name` exactly (for example `demo`, `sandbox`,
  `production`)
- if omitted, MCP falls back to the first configured tenant

### Common endpoint groups

- **Login**
  - `POST /v2/login/root`
  - `POST /v2/login/logout`
  - `GET /v2/login/me`
- **Nodes**
  - `GET /v2/nodes`
  - `POST /v2/nodes`
  - `POST /v2/nodes/-/upload`
  - `POST /v2/nodes/-/find`
  - `GET/PATCH/DELETE /v2/nodes/{uuid}`
- **Aspects / Features / Actions / Extensions**
  - `POST /v2/aspects/-/upload`, `GET /v2/aspects`
  - `POST /v2/features/-/upload`, `GET /v2/features`
  - `GET /v2/actions`, `POST /v2/actions/{uuid}/-/run`
  - `GET /v2/extensions`, `GET|POST /v2/extensions/{uuid}/-/exec`
  - uploads for aspects and features use `multipart/form-data` with a file in the `file` field
  - aspect upload expects a JSON file; feature upload expects a JavaScript module file
  - a feature must be exposed as action, extension, or AI tool; automatic triggers are only valid
    for actions
- **Agents**
  - `POST /v2/agents/-/upload`, `GET /v2/agents`
  - `POST /v2/agents/{uuid}/-/chat`
  - `POST /v2/agents/{uuid}/-/answer`
- **Workflows**
  - `GET|POST /v2/workflow-definitions`
  - `POST /v2/workflow-instances/{uuid}/-/start`
  - `POST /v2/workflow-instances/{uuid}/-/transition`
  - `POST /v2/workflow-instances/{uuid}/-/cancel`
- **Security admin**
  - `/v2/users`, `/v2/groups`, `/v2/api-keys`
- **Other APIs**
  - `/v2/articles`, `/v2/notifications`, `/v2/user-preferences`, `/v2/audit`, `/v2/templates`,
    `/v2/docs`
  - `/mcp`
  - `/webdav/*`

## Development

### Test commands

```bash
# All tests
deno task test

# Service-focused tests
deno task test:services

# Watch mode
deno task test:watch

# Coverage
deno task test:coverage

# Adapter contract tests
deno task test-node-repository
deno task test-storage-provider
```

### Lint and format

```bash
deno lint
deno fmt
```

## Project Structure

```text
src/
├── api/            # HTTP handlers and middleware
├── application/    # Business services and engines
│   ├── ai/
│   ├── features/
│   ├── nodes/
│   ├── workflows/
│   └── security/
├── domain/         # Domain models and contracts
├── adapters/       # Storage/repository/http adapter implementations
├── integration/    # WebDAV and integration utilities
└── shared/         # Shared primitives/utilities
```

## Built-in Documentation

- API endpoints:
  - `GET /v2/docs`
  - `GET /v2/docs/{uuid}`
- Source files: `docs/*.md`
- Start here:
  - [Getting started](docs/getting-started.md)
  - [Upload to search tutorial](docs/tutorial-upload-to-search.md)
  - [Product strategy and API usability](docs/product-strategy-ux-analysis.md)

## Architecture

Antbox follows hexagonal architecture (ports and adapters):

- domain contracts (`src/domain/`)
- application services/engines (`src/application/`)
- adapters implementing contracts (`src/adapters/`)
- transport in API handlers and Oak routing (`src/api/`, `src/adapters/oak/`)

## License

MIT License. See [LICENSE](LICENSE).

## Contributing

Contributions are welcome. Please run tests and lint before opening a PR.

## Links

- [OpenAPI specification](openapi.yaml)
- [Documentation index source](docs/index.ts)
