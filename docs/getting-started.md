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

Antbox loads a TOML configuration file. By default it looks for `./.config/antbox.toml`. You can
also pass `--demo` or `--sandbox`, which map to `./.config/demo.toml` and `./.config/sandbox.toml`.

Minimal example (`.config/antbox.toml`):

```toml
engine = "oak"
port = 7180

[[tenants]]
name = "local"
rootPasswd = "demo"

# Provide crypto material explicitly (recommended)
# key can be a base64 string or a file path
key = "base64-encoded-secret"
# jwk must point to a JSON Web Key file (path or URL)
jwk = "./.config/antbox.jwk"

# Required
eventStoreRepository = ["inmem/inmem_event_store_repository.ts"]

# Optional (defaults to in-memory if omitted)
repository = ["inmem/inmem_node_repository.ts"]
storage = ["inmem/inmem_storage_provider.ts"]
```

Notes:

- `eventStoreRepository` is required for every tenant.
- If `key` and `jwk` are not provided, the server will try to read defaults and exit on failure.
- For production, use persistent `repository` and `storage` adapters.

## Start the Server

Recommended (uses required Deno flags):

```bash
./start_server.sh --config ./.config/antbox.toml
```

Or run directly:

```bash
deno run -A --unstable-raw-imports main.ts --config ./.config/antbox.toml
```

You should see:

```
Antbox Server (oak) started successfully on port :: 7180
```

## Authentication (Quick Login)

Root login expects the SHA-256 hash of the root password (`rootPasswd` in config).

Linux:

```bash
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)"
```

macOS:

```bash
curl -X POST http://localhost:7180/login/root \
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
- Storage providers: `docs/storage-providers.md`
