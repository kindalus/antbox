---
name: mcp
description: Model Context Protocol endpoint and tool/resource catalog
---

# MCP Endpoint

Antbox exposes a Model Context Protocol (MCP) endpoint over HTTP using JSON-RPC 2.0. The endpoint
implements the exclusive `2026-07-28` protocol revision: every request carries its protocol version
and client capabilities in `params._meta`, and capabilities are computed per request.

## Endpoint

- `POST /mcp`

Responses are JSON. The endpoint advertises no list-change notifications and keeps deterministic
list ordering.

## Request metadata

Every request MUST carry `params._meta`:

| Field                                        | Required | Notes                                                                   |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `io.modelcontextprotocol/protocolVersion`    | Yes      | MUST be `2026-07-28`                                                    |
| `io.modelcontextprotocol/clientCapabilities` | Yes      | Object; `{}` means the client declares no optional features             |
| `io.modelcontextprotocol/clientInfo`         | No       | `{name, version}`; display/logging only, never used for auth or routing |
| `io.modelcontextprotocol/logLevel`           | No       | Optional requested log level                                            |
| `traceparent`, `tracestate`, `baggage`       | No       | W3C/OpenTelemetry trace context                                         |

Missing or invalid metadata is rejected with HTTP 400 and JSON-RPC error `-32602`.

## HTTP headers

| Header                                        | Required for                   | Rule                                                            |
| --------------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `Content-Type: application/json`              | All requests                   | Body is a single JSON-RPC request or notification               |
| `Accept: application/json, text/event-stream` | All requests                   | MUST list both media types                                      |
| `MCP-Protocol-Version`                        | All requests                   | MUST be supported and match the body's `_meta` protocol version |
| `Mcp-Method`                                  | All requests                   | MUST match the JSON-RPC `method`                                |
| `Mcp-Name`                                    | `tools/call`, `resources/read` | MUST match `params.name` / `params.uri`                         |
| `Authorization: Bearer <token>`               | Optional                       | Antbox API key secret; enables the tools capability             |
| `X-Tenant: <tenant-name>`                     | Optional                       | Tenant selection                                                |

Header names are case-insensitive; header values are compared to the body case-sensitively.

`Mcp-Name` is conditionally required: it MUST be present for `tools/call` and `resources/read`,
where it must match `params.name` and `params.uri` respectively, and it MUST be omitted for every
other method.

A value that cannot be carried safely as a plain ASCII header value is Base64-encoded from its UTF-8
representation using the sentinel form `=?base64?{Base64EncodedValue}?=`. The `=?base64?` prefix and
`?=` suffix are case-sensitive and MUST appear exactly as shown. Clients MUST use the sentinel form
when the value contains non-ASCII or control characters, has leading or trailing whitespace, or
itself matches the sentinel pattern — a plain ASCII value that starts with `=?base64?` and ends with
`?=` is encoded too, so decoding stays unambiguous. The server decodes `Mcp-Name` before comparing
it to the body.

A required header that is missing or malformed, or whose value does not match the request body, is
rejected with HTTP 400 and JSON-RPC error `-32020` (`HeaderMismatch`).

## Authentication and tenant selection

- Bearer auth: `Authorization: Bearer <token>`, where `<token>` is an Antbox API key secret
- A valid bearer token exposes tools and resources
- An invalid bearer token is rejected with HTTP 401
- Without a bearer token the endpoint runs in resource-only mode and does not advertise tools
- Cookie auth and query auth are not accepted on this endpoint
- Tenant selection uses `X-Tenant: <tenant-name>` or `?x-tenant=<tenant-name>`
- The tenant name must match a configured tenant `name` exactly (for example `demo`, `sandbox`,
  `production`); if omitted, the first configured tenant is used

Capabilities are computed per request from that request's authentication.

## Origin policy

`Origin` is validated before authentication. A request without an `Origin` header — the normal case
for non-browser clients — is accepted. A request with an `Origin` header must match the server-level
`mcpAllowedOrigins` allowlist; otherwise it is rejected with HTTP 403.

## Request body limit

`mcpMaxRequestBodyBytes` is a positive integer that defaults to `1048576` bytes. A request whose
body exceeds the limit is rejected with HTTP 413 before JSON parsing.

## Supported methods

Always available:

- `server/discover`
- `resources/list`
- `resources/templates/list`
- `resources/read`

Available only with a valid bearer token:

- `tools/list`
- `tools/call`

Clients must send JSON-RPC requests or notifications only; JSON-RPC response envelopes are rejected.
A notification that the server accepts returns HTTP 202 with no body.

## Errors

| Condition                                              | HTTP | JSON-RPC                                  |
| ------------------------------------------------------ | ---- | ----------------------------------------- |
| Header missing, malformed, or mismatched with the body | 400  | `-32020`                                  |
| Unsupported protocol version                           | 400  | `-32022` with `supported` and `requested` |
| Missing or invalid `_meta` metadata                    | 400  | `-32602`                                  |
| Resource not found                                     | 200  | `-32602`                                  |
| Unknown method                                         | 404  | `-32601`                                  |
| Invalid `Origin`                                       | 403  | —                                         |
| Request body over `mcpMaxRequestBodyBytes`             | 413  | —                                         |
| Invalid bearer token                                   | 401  | —                                         |
| Accepted notification                                  | 202  | no body                                   |

Tool business failures are returned as results with `isError: true`, not as JSON-RPC errors.

## Result metadata and caching

Every successful result has `resultType: "complete"` and
`_meta["io.modelcontextprotocol/serverInfo"]`. Cacheable results also carry `ttlMs` and
`cacheScope`:

| Method                     | `ttlMs` | `cacheScope` |
| -------------------------- | ------- | ------------ |
| `server/discover`          | 0       | `private`    |
| `tools/list`               | 300000  | `private`    |
| `resources/list`           | 300000  | `private`    |
| `resources/templates/list` | 300000  | `private`    |
| `resources/read` (docs)    | 300000  | `public`     |
| `resources/read` (nodes)   | 0       | `private`    |

## Tool catalog

- `nodes.get` — read node metadata by UUID/FID
- `nodes.find` — search nodes by filters or query text
- `nodes.list` — list nodes under a parent folder

All tool calls use existing Antbox authorization checks.

## Resources

Listed resources:

- `antbox://docs/llms`
- `antbox://docs/webdav`
- `antbox://docs/node-querying`
- `antbox://docs/nodes-and-aspects`
- `antbox://docs/overview`

Resource template:

- `antbox://nodes/{uuid}` — node metadata by UUID/FID

Node resources are authorized per request and are never publicly cacheable.

## Examples

```bash
BASE_URL="http://localhost:7180"
TENANT="demo"
MCP_TOKEN="<api-key-secret>"

# Common per-request metadata, shared by every example below
META='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{},"io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1.0.0"}}'

# 1) Discover protocol versions, capabilities, and server identity
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: server/discover" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"server/discover\",\"params\":{$META}}"

# 2) List resources (works anonymously)
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: resources/list" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"resources/list\",\"params\":{$META}}"

# 3) Read a documentation resource
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: resources/read" \
  -H "Mcp-Name: antbox://docs/overview" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"resources/read\",\"params\":{\"uri\":\"antbox://docs/overview\",$META}}"

# 4) List tools (requires a valid bearer token)
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/list" \
  -H "X-Tenant: $TENANT" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/list\",\"params\":{$META}}"

# 5) Call nodes.find (requires a valid bearer token)
curl -sS -X POST "$BASE_URL/mcp" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Mcp-Name: nodes.find" \
  -H "X-Tenant: $TENANT" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"nodes.find\",\"arguments\":{\"filters\":[[\"parent\",\"==\",\"root\"]],\"pageSize\":10,\"pageToken\":1},$META}}"
```
