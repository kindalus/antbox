---
name: mcp
description: Model Context Protocol endpoint and tool/resource catalog
---

# MCP Endpoint

Antbox exposes a Model Context Protocol (MCP) endpoint over HTTP using JSON-RPC 2.0.

## Endpoint

- `POST /mcp`

## Authentication and tenant routing

- MCP accepts optional bearer auth in header: `Authorization: Bearer <token>`
- When a bearer token is present and valid, MCP exposes both tools and resources
- When a bearer token is present but invalid, the request is rejected
- When no bearer token is present, MCP runs in anonymous resource-only mode
- In anonymous mode, resources remain available but tools are not exposed
- Cookie auth and query auth are not accepted on this endpoint
- Tenant selection uses optional `X-Tenant: <tenant-name>` or `?x-tenant=<tenant-name>`
- Tenant name must match the configured tenant `name` exactly (for example `demo`, `sandbox`,
  `production`)
- If omitted, MCP falls back to the first configured tenant

Current scope note:

- OAuth token discovery/challenge flow is not implemented yet

## Supported MCP methods

Always available:

- `initialize`
- `notifications/initialized`
- `ping`
- `resources/list`
- `resources/templates/list`
- `resources/read`

Available only with a valid bearer token:

- `tools/list`
- `tools/call`

## Tool catalog (initial)

- `nodes.get` - read node metadata by UUID/FID
- `nodes.find` - search nodes by filters or query text
- `nodes.list` - list nodes under a parent folder

All tool calls use existing Antbox authorization checks.

## Resources

Listed resources:

- `antbox://docs/llms`
- `antbox://docs/webdav`
- `antbox://docs/node-querying`
- `antbox://docs/nodes-and-aspects`
- `antbox://docs/overview`

Resource template:

- `antbox://nodes/{uuid}` - node metadata by UUID/FID

## Example flow

Authenticated flow:

```bash
BASE_URL="http://localhost:7180"
TENANT="demo"
MCP_TOKEN="<api-key-secret>"

# 1) initialize
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}'

# 2) list tools
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3) call nodes.find
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nodes.find","arguments":{"filters":[["parent","==","root"]],"pageSize":10,"pageToken":1}}}'
```
