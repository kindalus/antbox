---
name: mcp
description: Model Context Protocol endpoint and tool/resource catalog
---

# MCP Endpoint

Antbox exposes a Model Context Protocol (MCP) endpoint over HTTP using JSON-RPC 2.0.

## Endpoint

- `POST /mcp`

## Authentication and tenant routing

- MCP is bearer-only: `Authorization: Bearer <jwt>`
- API keys and cookie auth are not accepted on this endpoint
- Tenant selection uses `X-Tenant: <tenant-name>`

## Supported MCP methods

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/templates/list`
- `resources/read`

## Tool catalog (initial)

- `nodes.get` - read node metadata by UUID/FID
- `nodes.find` - search nodes by filters or query text
- `nodes.updateMetadata` - update node metadata fields
- `nodes.exportText` - export text content from textual files with byte limits

All tool calls use existing Antbox authorization checks.

## Resources

Listed resources:

- `antbox://docs/<uuid>` - markdown docs from `docs/index.ts`

Resource template:

- `antbox://nodes/{uuid}` - node metadata by UUID/FID

## Example flow

```bash
BASE_URL="http://localhost:7180"
TENANT="demo"
JWT="<root-or-user-jwt>"

# 1) initialize
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'

# 2) list tools
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3) call nodes.find
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $JWT" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nodes.find","arguments":{"filters":[["parent","==","root"]],"pageSize":10,"pageToken":1}}}'
```
