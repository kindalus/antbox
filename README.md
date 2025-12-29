# Antbox

**API-first Enterprise Content Management for TypeScript teams**

Antbox is an open-source ECM/DAM platform built with Deno and TypeScript. It provides document management, AI-powered processing, workflow automation, and multi-tenant isolation in a lightweight, embeddable package.

## Features

- **Document Management** - Files, folders, metadata, versioning, and full-text search
- **AI Agents** - Built-in RAG, chat, and tool calling with Google Gemini
- **Workflows** - State machines with entry/exit actions and transitions
- **Multi-Tenant** - Native tenant isolation with per-tenant configuration
- **Pluggable Storage** - S3, Google Drive, or flat-file adapters
- **Pluggable Database** - MongoDB, PouchDB, or flat-file repositories
- **Custom Features** - Execute JavaScript/TypeScript modules as actions
- **Multi-Language** - Article system with locale-based content
- **Security** - JWT, API keys, RBAC with groups and permissions
- **Audit Trail** - Admin-accessible event logging

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) 2.0 or later

### Run Demo Server

```bash
# Clone the repository
git clone https://github.com/kindalus/antbox.git
cd antbox

# Start demo server (flat-file storage, no external dependencies)
./start_server.sh --demo
```

The server starts at `http://localhost:7180`. Demo credentials:
- **Username:** `root`
- **Password:** `demo`

### First API Call

```bash
# Login and get JWT token
curl -X POST http://localhost:7180/v2/login \
  -H "Content-Type: application/json" \
  -d '{"email": "root", "password": "demo"}'

# List root folder contents (use token from login response)
curl http://localhost:7180/v2/nodes \
  -H "Authorization: Bearer <your-token>"
```

## Installation

### From Source

```bash
git clone https://github.com/kindalus/antbox.git
cd antbox

# Generate crypto keys (required for production)
./start_server.sh --keys

# Run with default configuration
./start_server.sh
```

### Using Deno Directly

```bash
deno run --unstable-raw-imports \
  --allow-net --allow-read --allow-write --allow-env --allow-sys \
  main.ts --demo
```

## Running the Server

Use `start_server.sh` to launch Antbox:

```bash
./start_server.sh [OPTIONS]
```

### Options

| Option | Description |
|--------|-------------|
| `--demo` | Run with demo configuration (flat-file, no setup required) |
| `--sandbox` | Run with sandbox configuration |
| `-f, --config FILE` | Use custom configuration file |
| `--keys` | Generate and print crypto keys, then exit |
| `-h, --help` | Show help message |

### Examples

```bash
# Development/demo mode
./start_server.sh --demo

# Sandbox environment
./start_server.sh --sandbox

# Production with custom config
./start_server.sh -f /etc/antbox/production.toml

# Generate new crypto keys
./start_server.sh --keys
```

## Configuration

Antbox uses TOML configuration files. Default location: `.config/antbox.toml`

### Basic Configuration

```toml
engine = "oak"
port = 7180

[[tenants]]
name = "mytenant"
rootPasswd = "secure_password_here"
key = "./.config/antbox.key"
jwk = "./.config/antbox.jwk"
storage = ["flat_file/flat_file_storage_provider.ts", "./data/storage"]
repository = ["flat_file/flat_file_node_repository.ts", "./data/repository"]
```

### Production Configuration (MongoDB + S3)

```toml
engine = "oak"
port = 7180

[[tenants]]
name = "production"
rootPasswd = "secure_password"
key = "./.config/antbox.key"
jwk = "./.config/antbox.jwk"
storage = ["s3/s3_storage_provider.ts", "/path/to/s3_config.json"]
repository = ["mongodb/mongodb_node_repository.ts", "mongodb://localhost:27017/antbox"]
```

### Storage Adapters

| Adapter | Use Case | Configuration |
|---------|----------|---------------|
| `flat_file` | Development, demos | `["flat_file/flat_file_storage_provider.ts", "./data/storage"]` |
| `s3` | Production (AWS/MinIO) | `["s3/s3_storage_provider.ts", "/path/to/config.json"]` |
| `google_drive` | Google Workspace | `["google_drive/google_drive_storage_provider.ts", "/path/to/creds.json"]` |

### Repository Adapters

| Adapter | Use Case | Configuration |
|---------|----------|---------------|
| `flat_file` | Development | `["flat_file/flat_file_node_repository.ts", "./data/repository"]` |
| `mongodb` | Production | `["mongodb/mongodb_node_repository.ts", "mongodb://host:port/db"]` |
| `pouchdb` | Embedded/Edge | `["pouchdb/pouchdb_node_repository.ts", "./data/pouchdb"]` |

## API Overview

Antbox exposes a REST API at `/v2`. Full OpenAPI 3.1 specification available at `openapi.yaml`.

### Authentication

Four methods supported (use any one):

| Method | Header/Parameter |
|--------|------------------|
| Bearer Token | `Authorization: Bearer <jwt>` |
| Cookie | `antbox_token` cookie |
| API Key Header | `X-API-Key: <key>` |
| API Key Query | `?api_key=<key>` |

### Core Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v2/login` | Authenticate and get JWT |
| `GET /v2/nodes` | List/search nodes |
| `POST /v2/nodes` | Create node |
| `GET /v2/nodes/{uuid}` | Get node metadata |
| `POST /v2/nodes/{uuid}/files` | Upload file |
| `PUT /v2/nodes/{uuid}` | Update node |
| `DELETE /v2/nodes/{uuid}` | Delete node |

### AI Agents

| Endpoint | Description |
|----------|-------------|
| `GET /v2/agents` | List agents |
| `POST /v2/agents/-/upload` | Create/replace agent |
| `POST /v2/agents/{uuid}/-/chat` | Chat with agent |
| `POST /v2/agents/{uuid}/-/answer` | One-shot answer |
| `POST /v2/agents/rag/-/chat` | RAG-powered chat |

### Workflows

| Endpoint | Description |
|----------|-------------|
| `POST /v2/workflows/{uuid}/-/start` | Start workflow on node |
| `POST /v2/workflows/{uuid}/-/transition` | Transition state |
| `POST /v2/workflows/{uuid}/-/cancel` | Cancel workflow |

### Features & Actions

| Endpoint | Description |
|----------|-------------|
| `GET /v2/actions` | List available actions |
| `POST /v2/actions/{uuid}/-/run` | Execute action on nodes |
| `GET /v2/features` | List features |
| `POST /v2/features` | Create feature |

## Development

### Run Tests

```bash
# Run all tests
deno task test

# Run with coverage
deno task test:coverage

# Watch mode
deno task test:watch

# Service tests only
deno task test:services
```

### Project Structure

```
src/
├── api/           # HTTP handlers and middleware
├── application/   # Business logic (services and engines)
│   ├── ai/        # Agents, RAG, embeddings
│   ├── features/  # Custom feature execution
│   ├── nodes/     # Document management
│   ├── workflows/ # Workflow automation
│   └── security/  # Auth, users, groups
├── domain/        # Domain models and entities
├── adapters/      # Storage and database implementations
├── shared/        # Utility classes
└── integration/   # WebDAV support
```

### Code Style

```bash
# Format code
deno fmt

# Lint
deno lint
```

## Architecture

```
┌─────────────────────────────────────┐
│     API Layer (Oak HTTP Server)     │
└─────────────────────────────────────┘
                  │
┌─────────────────────────────────────┐
│   Application Layer (Services)      │
│   - NodeService, AgentsService      │
│   - FeaturesEngine, AgentsEngine    │
│   - WorkflowInstancesEngine         │
└─────────────────────────────────────┘
                  │
┌─────────────────────────────────────┐
│      Domain Layer (Models)          │
│   - Node, FileNode, FolderNode      │
│   - Agent, Feature, Workflow        │
└─────────────────────────────────────┘
                  │
┌─────────────────────────────────────┐
│     Adapter Layer (Pluggable)       │
│   - Storage: S3, GDrive, FlatFile   │
│   - Repository: MongoDB, PouchDB    │
└─────────────────────────────────────┘
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Google Gemini API key for AI agents | - |
| `ANTBOX_PORT` | Server port | 7180 |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read the codebase structure above and ensure tests pass before submitting PRs.

## Links

- [OpenAPI Specification](openapi.yaml)
- [Product Analysis](FINDINGS.md)
