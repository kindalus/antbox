---
name: mcp
description: Model Context Protocol endpoint and tool/resource catalog
---

# MCP Endpoint

Antbox exposes a Model Context Protocol (MCP) endpoint over HTTP using JSON-RPC 2.0.

## Endpoint

- `POST /mcp`

## Authentication and tenant routing

- MCP requires bearer auth in header: `Authorization: Bearer <token>`
- This header must be sent on every MCP HTTP request
- The bearer token is currently an Antbox API key secret
- Cookie auth and query auth are not accepted on this endpoint
- Tenant selection uses optional `X-Tenant: <tenant-name>`

Current scope note:

- OAuth token discovery/challenge flow is not implemented yet

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
