---
name: getting-started
description: Getting started guide
---

# Getting Started

This guide walks you through running Antbox locally.

## Prerequisites

- Deno installed: https://deno.land/

## Installation

```bash
git clone https://github.com/kindalus/antbox.git
cd antbox
```

## Configuration

Antbox uses a central configuration directory. By default, it manages its configuration in
`$HOME/.config/antbox` (or `%USERPROFILE%\.config\antbox` on Windows).

When you start Antbox for the first time, it automatically creates this directory, generates
cryptographic keys (`antbox.key` and `antbox.jwks`), and creates a default `config.toml` file.

You can override the configuration directory using the `--config-dir` (or `-c`) flag. You can also
pass `--demo` or `--sandbox`, which map to `./.config/demo` and `./.config/sandbox` directories
relative to the execution path.

Minimal example (`config.toml`):

```toml
engine = "oak"
port = 7180
logLevel = "info"
rootPasswd = "demo"

[[tenants]]
name = "local"

# Required for every tenant
repository = ["inmem/inmem_node_repository.ts"]
storage = ["inmem/inmem_storage_provider.ts"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "./data/config"]
eventStoreRepository = ["inmem/inmem_event_store_repository.ts"]
```

Notes:

- `repository`, `storage`, `configurationRepository`, and `eventStoreRepository` are required for
  every tenant.
- `rootPasswd`, `key`, and `jwks` can be defined globally and inherited by tenants, or overridden
  per tenant.
- If `key` and `jwks` are not provided anywhere, the server will default to loading them from the
  configuration directory or generate them if they don't exist.
- Module paths that start with `./` or `../` are automatically resolved relative to the
  configuration directory.

## Start the Server

Recommended (uses required Deno flags):

```bash
./start_server.sh --config-dir /path/to/your/config
```

Or run directly:

```bash
deno run -A --unstable-raw-imports main.ts --config-dir /path/to/your/config
```

You should see:

```
Antbox Server (oak) started successfully on port :: 7180
```

## Authentication (Quick Login)

Root login expects the SHA-256 hash of the root password (`rootPasswd` in config).

Linux:

```bash
curl -X POST http://localhost:7180/v2/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)"
```

macOS:

```bash
curl -X POST http://localhost:7180/v2/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | shasum -a 256 | cut -d' ' -f1)"
```

Response:

```json
{
	"jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Note: the server sets a `Secure` cookie, which browsers do not send over plain HTTP. For local
browser testing, use the Bearer token or run behind HTTPS.

## Basic API Usage

```bash
# Create a folder
curl -X POST http://localhost:7180/v2/nodes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "title": "My Folder",
    "mimetype": "application/vnd.antbox.folder",
    "parent": "--root--"
  }'
```

```bash
# List nodes in root
curl "http://localhost:7180/v2/nodes?parent=--root--" \
  -H "Authorization: Bearer $JWT"
```

## Next Steps

- Authentication details: `docs/authentication.md`
- Nodes and aspects: `docs/nodes-and-aspects.md`
- Features: `docs/features.md`
- AI agents: `docs/ai-agents.md`
- Workflows: `docs/workflows.md`
- Security administration: `docs/security-administration.md`
- Storage providers: `docs/storage-providers.md`
