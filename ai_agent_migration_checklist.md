# Antbox AI Agent Migration Checklist

A tight execution checklist derived from `ai_gent_migration_plan.md`.

## Pre-implementation decisions
- [ ] Decide how to handle persisted workflow agents:
  - [ ] hard fail
  - [ ] one-time migration
  - [ ] temporary compatibility shim
- [ ] Decide whether code-defined custom agents like `--rag-agent--` stay
- [ ] Confirm restricted skill loader approach (Pi-style metadata + Antbox-local content loader)
- [ ] Confirm tool results stay out of default API responses
- [ ] Confirm both `/chat` and `/answer` remain public endpoints

## Phase 1: LLM-only agent contract
### Domain and validation
- [ ] Remove `AgentType` variants except LLM semantics
- [ ] Remove `type` from `src/domain/configuration/agent_data.ts`
- [ ] Remove `agents` from `src/domain/configuration/agent_data.ts`
- [ ] Make `systemPrompt` required for all agents in `src/domain/configuration/agent_schema.ts`
- [ ] Remove workflow-agent validation branches from schema

### Service/CRUD cleanup
- [ ] Update `AgentsService.createAgent()` assumptions
- [ ] Update `AgentsService.updateAgent()` assumptions
- [ ] Remove any normalization logic tied to workflow agents

### Tests
- [ ] Update domain/schema tests
- [ ] Update service tests for create/update/get/list
- [ ] Remove or rewrite composition-related agent tests

### Verification
- [ ] LLM-only agent schema passes tests
- [ ] CRUD tests pass with no `type`/`agents` assumptions

## Phase 2: Remove composition runtime
### Engine
- [ ] Remove imports/usages of `SequentialAgent`, `ParallelAgent`, `LoopAgent`
- [ ] Remove recursive sub-agent lookup/building from `AgentsEngine`
- [ ] Ensure `#buildAdkAgent()` builds only LLM agents or approved custom coded agents
- [ ] Audit built-in/custom agent registry for composition assumptions

### Tests
- [ ] Update `agents_engine_test.ts`
- [ ] Remove tests that depend on workflow agent composition
- [ ] Add tests proving plain LLM agents still work

### Verification
- [ ] No composition code paths remain in `AgentsEngine`
- [ ] Engine tests pass

## Phase 3: Unify `answer` and `chat`
### Engine refactor
- [ ] Introduce one private shared interaction runner in `AgentsEngine`
- [ ] Route `chat()` through shared runner with history
- [ ] Route `answer()` through shared runner with empty/ignored history
- [ ] Centralize:
  - [ ] exposure checks
  - [ ] tenant limit checks
  - [ ] tool building
  - [ ] runner setup
  - [ ] usage event publication

### API/docs alignment
- [ ] Update `docs/ai-agents.md` to explain `answer` vs `chat`
- [ ] Update `openapi.yaml` descriptions
- [ ] Confirm handlers remain compatible

### Tests
- [ ] Add parity tests for `answer` and `chat`
- [ ] Add explicit test that `answer` ignores history

### Verification
- [ ] Shared runner exists
- [ ] Answer/chat tests pass

## Phase 4: Snake_case tool and parameter exposure
### Tool aliasing
- [ ] Add snake_case conversion helper for tool names
- [ ] Expose built-in tools in snake_case
- [ ] Expose `runCode` as `run_code`
- [ ] Expose feature-backed AI tools in snake_case
- [ ] Add collision detection for tool aliases
- [ ] Add mapping from snake_case alias back to internal tool name/UUID

### Parameter aliasing
- [ ] Add snake_case conversion helper for parameter names
- [ ] Expose feature parameters in snake_case
- [ ] Map incoming snake_case args back to original parameter names
- [ ] Add collision detection for parameter aliases

### Tests
- [ ] Test `run_code` exposure
- [ ] Test feature UUID camelCase → snake_case aliasing
- [ ] Test feature param camelCase → snake_case aliasing
- [ ] Test alias collision failures

### Verification
- [ ] All agent-facing tools are snake_case
- [ ] All agent-facing feature params are snake_case
- [ ] `run_code` still works

## Phase 5: Add built-in retrieval tools
### Implement tools
- [ ] Add `find_nodes`
- [ ] Add `get_node`
- [ ] Add `semantic_search`
- [ ] Make all three tools use snake_case schemas and param names
- [ ] Ensure permission behavior matches existing services

### Tool descriptions
- [ ] Describe `find_nodes` as the simple structured search tool
- [ ] Describe `get_node` as the simple single-node retrieval tool
- [ ] Describe `semantic_search` as the simple semantic retrieval tool
- [ ] Describe `run_code` as the advanced multi-step workflow tool

### Tests
- [ ] Test `find_nodes`
- [ ] Test `get_node`
- [ ] Test `semantic_search`
- [ ] Test `run_code` remains available alongside them

### Verification
- [ ] Simple retrieval tools work
- [ ] `run_code` remains available and documented

## Phase 6: Pi-style skills
### Discovery/indexing
- [ ] Refactor `skills_loader.ts` to support Pi-style metadata indexing
- [ ] Ensure skills carry at least:
  - [ ] `name`
  - [ ] `description`
  - [ ] `location`
  - [ ] `baseDir`
- [ ] Add stable precedence/collision handling
- [ ] Preserve diagnostics for invalid skill files

### Prompt presentation
- [ ] Add `<available_skills>`-style metadata block to the agent prompt/system prompt path
- [ ] Ensure only metadata is injected by default
- [ ] Exclude hidden/non-invokable skills if needed by policy

### On-demand loading
- [ ] Add restricted built-in skill-loading tool
- [ ] Ensure it only loads discovered skills
- [ ] Include relative-path/baseDir guidance in returned content
- [ ] Do not expose arbitrary filesystem reads

### Tests
- [ ] Test skill discovery
- [ ] Test precedence/collision resolution
- [ ] Test prompt skill metadata generation
- [ ] Test on-demand full skill load
- [ ] Test missing/invalid skill behavior

### Verification
- [ ] Skills are discoverable in prompt metadata
- [ ] Full skill bodies load only on demand

## Phase 7: Tool result response policy
### Implementation
- [ ] Confirm no public API response starts returning raw tool results by default
- [ ] Verify final assistant message remains the only answer payload returned to clients
- [ ] If necessary, add explicit internal comments/tests locking this behavior in place

### Tests
- [ ] Add/keep tests asserting final response contains assistant answer, not raw tool traces

### Verification
- [ ] Public answer/chat payload contract remains stable

## Phase 8: Docs and contract cleanup
### Docs/spec
- [ ] Update `openapi.yaml`
- [ ] Update `docs/ai-agents.md`
- [ ] Update `docs/agent-skills.md`
- [ ] Update `docs/llms.md`
- [ ] Update `README.md`
- [ ] Remove all workflow composition examples/docs
- [ ] Update examples to use snake_case tool names

### Verification
- [ ] OpenAPI and implementation match
- [ ] No stale workflow-agent language remains

## Phase 9: Final regression coverage
- [ ] Refresh `agents_engine_test.ts`
- [ ] Refresh `agents_service_test.ts` as needed
- [ ] Refresh `skills_loader_test.ts`
- [ ] Refresh setup tests if skill loading changed during tenant setup
- [ ] Add regression coverage for:
  - [ ] LLM-only agents
  - [ ] unified answer/chat execution
  - [ ] `run_code`
  - [ ] `find_nodes`
  - [ ] `get_node`
  - [ ] `semantic_search`
  - [ ] snake_case tool aliasing
  - [ ] snake_case parameter aliasing
  - [ ] Pi-style skill discovery and loading

## Final validation checklist
- [ ] No composition support remains unless explicitly retained by decision
- [ ] No agent `type` is required anymore
- [ ] `run_code` exists and is documented as advanced
- [ ] Simple retrieval tools exist and are documented as simple
- [ ] Skill discovery/presentation follows Pi-style metadata-first flow
- [ ] `answer` and `chat` share one internal implementation path
- [ ] Default API responses do not include raw tool results
- [ ] `openapi.yaml` updated with implementation
- [ ] Relevant tests pass

## Suggested implementation order
1. [ ] Domain/schema simplification
2. [ ] Engine composition removal
3. [ ] Shared answer/chat runner
4. [ ] Snake_case alias layer
5. [ ] Preserve `run_code`
6. [ ] Add `find_nodes`, `get_node`, `semantic_search`
7. [ ] Pi-style skill discovery/presentation/loading
8. [ ] Docs/spec cleanup
9. [ ] Regression test sweep
