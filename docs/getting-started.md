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
cryptographic keys (`antbox.key`, `antbox.jwks`, and `antbox-private.jwk`), creates a default
`config.toml` file, and creates `tenants.d/tenant.toml.sample`.

You can override the configuration directory using `--config-dir` (`-c`). Persistent data defaults
to `$HOME/.local/share/antbox` and can be overridden with `--data-dir` (`-d`). The `--demo` and
`--sandbox` modes isolate both configuration and data under their project directories.

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
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "local/config"]
eventStoreRepository = ["inmem/inmem_event_store_repository.ts"]

[tenants.limits]
storage = "pay-as-you-go"
tokens = 0
```

Notes:

- `repository`, `storage`, `configurationRepository`, and `eventStoreRepository` are required for
  every tenant.
- `limits` is required for every tenant.
- `rootPasswd`, `key`, and `jwks` can be defined globally and inherited by tenants, or overridden
  per tenant.
- If `key` and `jwks` are not provided anywhere, the server will default to loading them from the
  configuration directory or generate them if they don't exist.
- Relative flat-file and SQLite paths resolve against `dataDir`; absolute paths are preserved.
- Relative data paths containing a `..` segment are rejected.
- Relative keys, JWKS, skills, S3 configuration, and Google credentials resolve against `configDir`.
- When AI is disabled, `limits.tokens` must be `0`.
- When AI is enabled, `limits.tokens` must be greater than `0` or `"pay-as-you-go"`.

For larger installations, place one tenant in each `<config-dir>/tenants.d/<name>.toml` file:

```toml
name = "company-a"
repository = ["inmem/inmem_node_repository.ts"]
storage = ["inmem/inmem_storage_provider.ts"]
configurationRepository = ["sqlite/sqlite_configuration_repository.ts", "company-a/config"]
eventStoreRepository = ["inmem/inmem_event_store_repository.ts"]

[limits]
storage = "pay-as-you-go"
tokens = 0
```

The file contains a tenant directly, so its tables are `[limits]` and `[ai]`, not `[tenants.limits]`
and `[tenants.ai]`. Antbox reads only regular `.toml` files. The filename must match `name`, and
tenant files override inline tenants with the same name. Path resolution follows the same
`dataDir`/`configDir` rules as inline tenants.

## Start the Server

Recommended (uses required Deno flags):

```bash
./start_server.sh --config-dir /path/to/your/config --data-dir /path/to/your/data
```

Or run directly:

```bash
deno run -A --unstable-raw-imports main.ts \
  --config-dir /path/to/your/config --data-dir /path/to/your/data
```

You should see:

```
WebDAV path cache cleanup started
Antbox Server (oak) started successfully on http://localhost:7180
- http://localhost:7180/v2 for REST API
- http://localhost:7180/mcp for MCP
- http://localhost:7180/webdav for WebDAV
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

- Complete upload/search walkthrough: `docs/tutorial-upload-to-search.md`
- Runnable upload/search example: `examples/upload-to-search/upload-to-search.sh`
- Authentication details: `docs/authentication.md`
- Nodes and aspects: `docs/nodes-and-aspects.md`
- Features: `docs/features.md`
- AI agents: `docs/ai-agents.md`
- Workflows: `docs/workflows.md`
- Security administration: `docs/security-administration.md`
- Storage providers: `docs/storage-providers.md`
