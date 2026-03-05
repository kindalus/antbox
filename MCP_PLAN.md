# MCP Plan

Last updated: 2026-03-05

## Progress Snapshot (Done So Far)

### Goal

Stabilize MVP reliability and correctness across core areas (node lifecycle, semantic search,
aspects, features, security), then improve docs and AI skill loading. The current active direction
is to support Agent Skills spec frontmatter, expose skills through a `skillLoader` tool, and treat
docs as discoverable skills.

### Constraints and Decisions Already Applied

- Semantic threshold is provider-owned (not client-controlled).
- Use reviewer validation after major test work.
- Skill frontmatter follows Agent Skills spec with strict validation.
- Skills are exposed to agents via tooling (`skillLoader`) and loaded text is injected into context
  at runtime.
- `docs/index.ts` is the source of truth for doc and doc-skill registration.
- Docs used as skills keep only spec-safe metadata (`name`, `description`).
- Builtin `node-querying` skill was migrated into docs.

### Key Outcomes Implemented

- Semantic search now uses `EmbeddingsProvider.relevanceThreshold()`.
- Semantic result ordering and pagination behavior corrected.
- Permission checks are enforced in semantic search path.
- RAG defaults to provider threshold when caller does not pass one.
- OCR tool path in features engine hardened with safer error handling.
- Skills system refactored from pre-baked agent tools to metadata discovery + runtime loader.
- `skillLoader` is always available in agent toolset and returns full skill body (frontmatter
  stripped).
- Docs now support skill frontmatter and are discoverable as skills.
- Docs API output remains clean markdown body (frontmatter stripped during serving).
- `node-querying` moved to `docs/node-querying.md`; builtin copy removed.

### Commits in This Sequence

- `5b41078` feat(ai): provider-driven relevance threshold
- `67137a4` docs(llm): docs alignment + curl cookbook
- `b3f2bf7` docs(readme): setup/API examples aligned
- `f19ccc3` refactor(ai): skills to Agent Skills spec + skillLoader behavior
- `fd6acb2` refactor(skills): docs as discoverable skills + node-querying migration

### MCP Status (Implemented)

MCP support is now implemented for the first iteration:

- Oak endpoint: `POST /mcp`
- Bearer auth path (`Authorization: Bearer <access_token>`) for MCP
- Current bearer validation mode uses API key secrets (OAuth discovery/challenge deferred)
- Optional tenant selection through `X-Tenant` header
- JSON-RPC methods: `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`,
  `resources/templates/list`, `resources/read`
- Initial tools: `nodes.get`, `nodes.find`, `nodes.updateMetadata`, `nodes.exportText`
- Resources: `antbox://docs/<uuid>` + node template `antbox://nodes/{uuid}`
- Permission checks and tenant routing are enforced through existing services/context
- Structured MCP request logging added (`tenant`, `principal`, `method`, `status`, `elapsedMs`)

Open follow-ups:

- Add explicit timeout/cancellation policy for long-running MCP calls
- Add request size/rate guardrails for production hardening
- Expand MCP capability set beyond first-iteration node/docs surface

---

## MCP Implementation Plan

### 1) Scope and Protocol Shape

- Add an MCP endpoint in Oak while preserving existing REST APIs.
- Support bearer authentication for MCP.
- Keep tenant isolation with optional `X-Tenant` header.
- Expose a focused initial tool/resource set mapped to existing services.

### 2) Adapter Layer: MCP Server Integration

- Add an MCP adapter under `src/adapters/mcp/`.
- Initialize MCP server in tenant setup flow similarly to other adapter wiring.
- Register MCP handler route in `src/adapters/oak/server.ts` (or a dedicated router).
- Keep protocol-facing code in adapter layer; call application services through ports.

### 3) Authentication and Tenant Resolution

- Enforce `Authorization: Bearer <access_token>`.
- Validate current bearer token as API key secret (partial auth model).
- Reject query/cookie auth for MCP requests.
- Resolve tenant by optional `X-Tenant` header (default tenant fallback).
- Ensure audit/event context includes principal + tenant for MCP actions.

### 4) Tool Mapping (First Iteration)

- Define MCP tool registry with stable names and zod-validated inputs.
- Map tools to existing application services, for example:
  - node lookup/search
  - metadata read/update
  - safe content retrieval primitives
- Use existing permission checks; no bypass path for MCP.

### 5) Resource Mapping (First Iteration)

- Expose read-only MCP resources for high-value context (docs and selected node context).
- Keep resource URIs predictable and tenant-aware.
- Strip frontmatter where required (consistent with docs serving behavior).

### 6) Error Model and Safety

- Translate `Either`-style failures into MCP-compliant error responses.
- Avoid throwing exceptions across domain/application boundaries.
- Add explicit timeout/cancellation behavior for long-running calls.

### 7) Observability and Auditing

- Emit structured logs for MCP method calls, latency, tenant, and outcome.
- Persist relevant domain events for auditable mutations.
- Include guardrails for payload size and request rate if needed.

### 8) Tests

- Unit tests for tool/resource registry and request validation.
- Integration tests for auth, tenant routing, permission enforcement.
- Protocol-level tests for MCP handshake, listing tools/resources, and execution.
- Regression tests for docs-as-skills interoperability.

### 9) Documentation and Rollout

- Add `docs/mcp.md` with auth, tenant header, examples, and tool/resource catalog.
- Update README with MCP quickstart.
- Roll out in phases:
  1. read-only resources + no-op tools,
  2. core node tools,
  3. broader capability set.

---

## Primary Files Touched So Far

- `src/application/ai/skills_loader.ts`
- `src/application/ai/skills_loader_test.ts`
- `src/application/ai/agents_engine.ts`
- `src/application/ai/agents_engine_test.ts`
- `src/setup/setup_tenants.ts`
- `docs/index.ts`
- `docs/agent-skills.md`
- `docs/node-querying.md`
- `src/application/ai/builtin_skills/sdk-consumer/SKILL.md`
- `src/application/ai/builtin_skills/node-querying/SKILL.md` (removed)

## Primary MCP Files Added/Updated

- `src/adapters/mcp/mcp_server.ts`
- `src/adapters/mcp/mcp_server_test.ts`
- `src/adapters/mcp/mcp_http_handler.ts`
- `src/adapters/mcp/mcp_http_handler_test.ts`
- `src/adapters/oak/mcp_v2_router.ts`
- `src/adapters/oak/server.ts`
- `docs/mcp.md`
- `docs/index.ts`
- `README.md`

## Open Note

- `.gitignore` has unrelated local modifications and remains intentionally uncommitted.
