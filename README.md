# Antbox

**API-first Enterprise Content Management for TypeScript teams**

Antbox is an open-source ECM/DAM platform built with Deno and TypeScript. It combines document
management, workflow orchestration, AI-powered retrieval/agents, and multi-tenant isolation in a
single API-first runtime.

## Highlights

- **Document Management** - Files, folders, smart folders, metadata, and permissions
- **Search** - Structured filters, full-text search, and semantic search
- **AI Agents + Skills** - ADK-based agents, built-in RAG agents, and custom skills
- **MCP Server** - JSON-RPC endpoint with tenant-aware tools/resources for LLM clients
- **Custom Features** - Run JavaScript/TypeScript modules as actions/extensions/AI tools
- **Workflows** - Workflow definitions + runtime instances with transitions
- **Multi-Tenant** - Tenant-level isolation for repositories, storage, and keys
- **Pluggable Storage** - S3, Google Drive, flat-file, in-memory, null
- **Pluggable Repositories** - SQLite, PostgreSQL, MongoDB, PouchDB, flat-file, in-memory
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

## Running the Server

Use `start_server.sh`:

```bash
./start_server.sh [OPTIONS]
```

| Option              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `--demo`            | Demo config (`.config/demo.toml`)                  |
| `--sandbox`         | Sandbox config (`.config/sandbox.toml`)            |
| `-f, --config FILE` | Custom config file (default `.config/antbox.toml`) |
| `--keys`            | Generate and print crypto keys, then exit          |
| `-h, --help`        | Show help                                          |

Examples:

```bash
./start_server.sh --demo
./start_server.sh --sandbox
./start_server.sh -c /etc/antbox
./start_server.sh --keys
```

## Configuration

Antbox is configured via a central configuration directory. By default, it uses
`$HOME/.config/antbox` (or `%USERPROFILE%\.config\antbox` on Windows).

When you start Antbox for the first time, it will automatically:

1. Create this directory if it doesn't exist.
2. Generate a default `config.toml` file inside it.
3. Generate cryptographic keys (`antbox.key` and `antbox.jwks`).

You can override the configuration directory using the `-c, --config-dir` CLI flag.

Each tenant defines these core adapters:

- `storage`
- `repository`
- `configurationRepository`
- `eventStoreRepository`

Module configuration format:

- `["module/path.ts", "param1", "param2"]`

Minimal example of `config.toml`:

```toml
engine = "oak"
port = 7180
logLevel = "info"
rootPasswd = "demo"

[[tenants]]
name = "demo"
storage = ["flat_file/flat_file_storage_provider.ts", "./data/storage"]
repository = ["sqlite/sqlite_node_repository.ts", "./data/repository"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "./data/config"]
eventStoreRepository = ["sqlite/sqlite_event_store_repository.ts", "./data/events"]

[tenants.ai]
enabled = false
defaultModel = "google/gemini-2.5-flash"
```

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

MCP endpoint (`/mcp`) requires `Authorization: Bearer <token>` on every request. Current
implementation treats this bearer token as an API key secret. OAuth discovery/challenge flow for MCP
is not implemented yet.

Optional tenant selection:

- header: `X-Tenant: <tenant-name>`
- query: `?x-tenant=<tenant-name>`

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
