# Implementation Plan v2: Antbox Agent Engine Simplification

## Overview
Refactor Antbox’s agent engine into a simpler, LLM-only model with:

- **LLM-only agents**; no composition/workflow agent types
- **snake_case** tool and parameter names in the agent-facing interface
- **Pi-style skill discovery, presentation, and on-demand loading**
- **three new simple built-in retrieval tools**:
  - `find_nodes`
  - `get_node`
  - `semantic_search`
- **`run_code` preserved** as the advanced tool for complex multi-step workflows
- **unified internal execution path** for `chat` and `answer`
- user-facing responses that continue to return the **final assistant answer only by default**

I’ll stay with you and keep refining this plan until you say you’re happy.

# Goals

## Primary goals
1. Remove agent composition and support only LLM agents
2. Remove the need to explicitly specify agent type
3. Present all tools and parameters to the model in snake_case
4. Convert camelCase AI tool names and parameters to snake_case before exposing them to agents
5. Adopt Pi’s approach to skill discovery/loading/presentation
6. Add lightweight retrieval tools for common node lookups
7. Keep `run_code` for advanced workflows
8. Make `answer` and `chat` the same internally, with `answer` ignoring history

## Non-goals
- Removing `run_code`
- Changing tenant architecture
- Replacing feature-backed AI tools
- Returning raw tool traces/results to clients by default

# Product decisions

## 1. Agents are LLM-only
All agents become plain LLM agents.

Implications:
- Remove support for:
  - `sequential`
  - `parallel`
  - `loop`
- Remove sub-agent composition from the config model and engine
- Remove the need to explicitly send/store `type` for normal agents

### Proposed contract
An agent becomes conceptually:

- `uuid`
- `name`
- `description?`
- `exposedToUsers`
- `model?`
- `tools?`
- `systemPrompt`
- `maxLlmCalls?`
- timestamps

No `type`, no `agents`.

## 2. Tool interface exposed to the model is snake_case
The model-facing tool namespace should be normalized to snake_case.

### Examples
- `runCode` → `run_code`
- `findNodes` → `find_nodes`
- `getNode` → `get_node`
- `semanticSearch` → `semantic_search`

### Feature-backed AI tools
If a feature is stored with camelCase UUID/params, preserve persistence/runtime names internally, but expose snake_case aliases to the model.

#### Example
Stored feature:
- UUID: `countChildrenTool`
- params:
  - `parentUuid`
  - `includeFolders`

Model sees:
- tool name: `count_children_tool`
- params:
  - `parent_uuid`
  - `include_folders`

Internal execution maps back to:
- `countChildrenTool`
- `parentUuid`
- `includeFolders`

## 3. Keep `run_code`
`runCode` must remain supported and visible to agents as:

- **`run_code`**

This is a hard requirement.

### Why it stays
It is necessary for:
- complex multi-step retrieval
- multi-step node manipulation
- custom branching logic
- conditional workflows
- combining multiple reads/writes in one task
- shaping outputs for advanced use cases

### Tool strategy
Use this hierarchy:

- **simple tasks** → `find_nodes`, `get_node`, `semantic_search`
- **complex tasks** → `run_code`

The new simple tools are **additive**, not replacements.

## 4. Pi-style skills
Adopt Pi’s model:

### Discovery
- discover skills at startup from configured sources
- store metadata:
  - name
  - description
  - file path / location
  - base directory
  - source/diagnostics if useful

### Presentation
- inject only **skill metadata** into the system prompt
- do **not** inject full skill content by default

### Loading
- load full skill content on demand only

### Important design constraint
Pi uses a general `read` tool for this. Antbox does not expose an equivalent general file-read tool to agents.

### Recommendation
Keep a **restricted skill-loading built-in** tool for on-demand loading of discovered skills only.

That gives us Pi-style progressive disclosure without exposing arbitrary filesystem access.

## 5. `answer` and `chat` are one engine path
Internally, there should be one interaction runner.

Semantics:
- `chat` = run with provided history
- `answer` = same path, but ignores history / uses empty history

We can keep both endpoints for API clarity and compatibility.

## 6. Tool results are not part of user answers by default
### Recommendation
**No**, tool results should **not** be returned as part of the normal answer payload by default.

### Default behavior
Client receives:
- final assistant answer
- usage metadata if already part of contract

Client does **not** receive:
- raw tool result payloads
- intermediate tool traces
- internal scratch execution artifacts

### Why
- keeps API contract simple
- avoids coupling clients to execution internals
- reduces accidental leakage of internal/tool-level details
- preserves freedom to change tool orchestration later

### Optional future enhancement
Add opt-in trace/debug mode later if needed.

# Architecture decisions

## Decision A: Simplify the agent domain contract
Remove composition-related fields and validations from the domain layer.

### Result
The schema becomes smaller, less ambiguous, and easier to use.

## Decision B: One internal interaction runner
Introduce one shared internal runner for both public methods.

Conceptually:

- `run_interaction(authContext, agentUuid, text, options, mode)`
- `chat()` passes history
- `answer()` passes empty history

This centralizes:
- agent lookup
- exposure checks
- token-limit checks
- tool construction
- runner setup
- result collection
- usage event publication

## Decision C: Snake_case alias layer
Do not rename stored feature UUIDs or stored parameter names in persistence.

Instead:
- expose snake_case aliases to the model
- keep original names internally
- map model calls back to originals

This minimizes migration risk and preserves existing feature records.

## Decision D: Pi-style skill metadata in prompt
Move skill discovery out of the tool description and into the system prompt itself.

The prompt should include something equivalent to Pi’s:

```xml
<available_skills>
  <skill>
    <name>...</name>
    <description>...</description>
    <location>...</location>
  </skill>
</available_skills>
```

This makes skills discoverable without forcing the model to infer them from a tool docstring.

## Decision E: Keep public API shape for now
Keep:
- `POST /v2/agents/{uuid}/-/chat`
- `POST /v2/agents/{uuid}/-/answer`

But unify their internals.

This gives a low-risk refactor path.

# Phased task plan

## Phase 1: Simplify the agent model

### Task 1: Remove composition from the agent domain contract
**Description:**  
Update `AgentData` and its schema so only LLM agents exist.

**Acceptance criteria:**
- [ ] `AgentData` no longer contains composition concepts
- [ ] `type` is removed from the public contract
- [ ] `agents` is removed from the public contract
- [ ] `systemPrompt` is required for all agents
- [ ] docs/examples stop referring to workflow agents

**Files likely touched:**
- `src/domain/configuration/agent_data.ts`
- `src/domain/configuration/agent_schema.ts`
- tests for agent schema/service
- docs referencing agent types

**Verification:**
- [ ] agent schema tests pass
- [ ] CRUD tests updated
- [ ] no composition references remain in public agent validation

**Scope:** M

### Task 2: Remove composition logic from `AgentsEngine`
**Description:**  
Delete recursive/sub-agent ADK composition support.

**Acceptance criteria:**
- [ ] engine only builds LLM agents
- [ ] no recursive sub-agent loading
- [ ] no `SequentialAgent`, `ParallelAgent`, `LoopAgent` runtime path
- [ ] configured custom/built-in agent handling is explicitly decided and implemented consistently

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- `src/application/ai/agents_engine_test.ts`
- possibly builtin/custom agent registry files

**Verification:**
- [ ] execution tests pass for normal LLM agents
- [ ] removed composition tests are replaced or deleted intentionally

**Scope:** M

### Checkpoint 1
- [ ] agent model is LLM-only
- [ ] engine no longer contains composition logic
- [ ] tests still cover basic agent CRUD + execution

## Phase 2: Unify answer and chat

### Task 3: Introduce one internal interaction runner
**Description:**  
Refactor `answer()` and `chat()` to use a single shared private execution path.

**Acceptance criteria:**
- [ ] one shared internal runner exists
- [ ] `chat()` passes history through
- [ ] `answer()` ignores history
- [ ] usage publishing and token checks are centralized

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- `src/application/ai/agents_engine_test.ts`

**Verification:**
- [ ] tests demonstrate equivalent behavior except for history handling
- [ ] duplicate runner setup logic is removed

**Scope:** S

### Task 4: Update API/docs semantics for `answer` and `chat`
**Description:**  
Align docs/spec with the unified implementation model.

**Acceptance criteria:**
- [ ] docs state that `answer` is a history-free interaction
- [ ] docs state that `chat` is the same interaction model with history
- [ ] `openapi.yaml` descriptions match implementation

**Files likely touched:**
- `docs/ai-agents.md`
- `openapi.yaml`
- possibly `src/api/agents_handlers.ts`

**Verification:**
- [ ] spec and docs match actual behavior

**Scope:** S

## Phase 3: Snake_case tool interface

### Task 5: Add a snake_case tool alias layer
**Description:**  
Normalize all model-facing tool names to snake_case.

**Acceptance criteria:**
- [ ] `runCode` is exposed as `run_code`
- [ ] built-in retrieval tools are exposed in snake_case
- [ ] feature-backed AI tools are exposed in snake_case
- [ ] collisions are detected and rejected clearly
- [ ] tool execution maps aliases back to original internal names

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- `src/application/ai/agents_engine_test.ts`

**Verification:**
- [ ] tests cover built-in and feature-backed aliasing
- [ ] collision cases are covered

**Scope:** M

### Task 6: Add snake_case parameter aliasing for feature-backed tools
**Description:**  
Expose feature parameters to the model in snake_case while preserving original runtime names internally.

**Acceptance criteria:**
- [ ] camelCase parameters become snake_case in tool schemas
- [ ] incoming args map back to original names
- [ ] collisions in aliasing are detected
- [ ] feature execution receives original internal parameter names

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- maybe helper utility module
- tests

**Verification:**
- [ ] tests cover camelCase → snake_case exposure
- [ ] tests verify correct reverse mapping

**Scope:** M

### Checkpoint 2
- [ ] all agent-facing tools are snake_case
- [ ] all agent-facing parameters are snake_case
- [ ] `run_code` remains present and working

## Phase 4: Add simple built-in retrieval tools

### Task 7: Add `find_nodes`
**Description:**  
Expose structured node search as a first-class built-in tool.

**Acceptance criteria:**
- [ ] wraps existing `NodeService.find(...)`
- [ ] schema is model-friendly and snake_case
- [ ] permission behavior matches existing node service behavior

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- tests

**Verification:**
- [ ] happy-path tests pass
- [ ] permission-sensitive tests pass

**Scope:** S

### Task 8: Add `get_node`
**Description:**  
Expose single-node fetch as a first-class built-in tool.

**Acceptance criteria:**
- [ ] wraps existing `NodeService.get(...)`
- [ ] schema is snake_case
- [ ] permissions preserved

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- tests

**Verification:**
- [ ] success/not-found/forbidden behavior tested

**Scope:** S

### Task 9: Add `semantic_search`
**Description:**  
Expose semantic retrieval as a simple built-in tool.

**Acceptance criteria:**
- [ ] uses existing semantic retrieval path (`RAGService` and/or `NodeService` flow)
- [ ] tool schema is snake_case
- [ ] results are constrained by normal permissions

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- tests

**Verification:**
- [ ] semantic search behavior tested
- [ ] unavailable-service/fallback behavior documented or tested

**Scope:** S/M

### Task 10: Preserve and document `run_code` as the advanced tool
**Description:**  
Ensure `run_code` remains a first-class built-in and is clearly described as the advanced workflow tool.

**Acceptance criteria:**
- [ ] `run_code` remains available
- [ ] tool description clearly explains advanced use cases
- [ ] docs steer simple tasks toward lightweight tools and complex tasks toward `run_code`

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- `src/application/ai/builtin_tools/run_code.ts`
- docs

**Verification:**
- [ ] tests confirm `run_code` remains available
- [ ] tool docs are updated

**Scope:** S

### Checkpoint 3
- [ ] `find_nodes`, `get_node`, `semantic_search` are present
- [ ] `run_code` remains available
- [ ] simple vs advanced tool roles are clearly documented

## Phase 5: Pi-style skills

### Task 11: Redesign skill discovery to follow Pi-style metadata indexing
**Description:**  
Refactor skill loading to index skill metadata at startup from configured sources with stable precedence and diagnostics.

**Acceptance criteria:**
- [ ] discovery supports configured directories/files
- [ ] metadata includes name, description, location, baseDir
- [ ] collisions are deterministic
- [ ] invalid skills produce diagnostics

**Files likely touched:**
- `src/application/ai/skills_loader.ts`
- `src/application/ai/skills_loader_test.ts`
- `src/setup/setup_tenants.ts`

**Verification:**
- [ ] loader tests cover discovery, precedence, collisions, invalid frontmatter

**Scope:** M

### Task 12: Present skills in the system prompt Pi-style
**Description:**  
Inject lightweight skill metadata into the system prompt rather than relying on a tool description as the primary discovery mechanism.

**Acceptance criteria:**
- [ ] prompt contains available skill metadata block
- [ ] only metadata is eagerly injected
- [ ] prompt tells model how to load skill content on demand

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- maybe a prompt helper module
- tests

**Verification:**
- [ ] prompt-generation behavior is tested

**Scope:** M

### Task 13: Add a restricted on-demand skill loader
**Description:**  
Provide a built-in mechanism to load full skill content from discovered skills only.

**Acceptance criteria:**
- [ ] full skill content can be loaded on demand
- [ ] only discovered/registered skills may be loaded
- [ ] arbitrary filesystem reading is not exposed
- [ ] relative path guidance is included in returned content

**Files likely touched:**
- `src/application/ai/agents_engine.ts`
- `src/application/ai/skills_loader.ts`
- tests

**Verification:**
- [ ] success case tested
- [ ] missing skill handling tested
- [ ] invalid skill file handling tested

**Scope:** M

### Checkpoint 4
- [ ] skills are discovered/indexed at startup
- [ ] metadata is visible in prompt
- [ ] full content is loaded on demand only

## Phase 6: Contract cleanup and docs

### Task 14: Update OpenAPI, docs, and examples
**Description:**  
Bring spec/docs/examples in sync with the refactor.

**Acceptance criteria:**
- [ ] `openapi.yaml` updated
- [ ] `docs/ai-agents.md` updated
- [ ] `docs/agent-skills.md` updated
- [ ] `docs/llms.md` updated
- [ ] README examples updated
- [ ] no workflow-composition references remain

**Files likely touched:**
- `openapi.yaml`
- `docs/ai-agents.md`
- `docs/agent-skills.md`
- `docs/llms.md`
- `README.md`

**Verification:**
- [ ] public docs and implementation match

**Scope:** M

### Task 15: Add/refresh regression coverage
**Description:**  
Replace outdated tests with regression coverage for the new model.

**Acceptance criteria:**
- [ ] coverage exists for:
  - LLM-only agents
  - unified answer/chat path
  - snake_case tool aliases
  - snake_case param aliases
  - `run_code`
  - new retrieval tools
  - Pi-style skill discovery/loading
- [ ] stale composition tests are intentionally removed

**Files likely touched:**
- `src/application/ai/*_test.ts`
- `src/setup/setup_tenants_test.ts`
- possibly API handler tests

**Verification:**
- [ ] relevant tests pass
- [ ] no stale composition assumptions remain

**Scope:** M

# Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing stored non-LLM agents become invalid | High | Decide whether to hard-fail or provide migration logic |
| Tool alias collisions after snake_case normalization | High | Add deterministic validation before agent construction |
| Parameter alias collisions within a feature | Medium | Reject ambiguous feature exposure early |
| Skill model from Pi doesn’t map perfectly because Antbox lacks general `read` | High | Use a restricted discovered-skill loader instead of arbitrary filesystem read |
| New simple tools reduce discoverability of `run_code` | Medium | Keep `run_code` prominent in tool descriptions and docs |
| Docs/spec drift during refactor | Medium | Update `openapi.yaml` in the same implementation phase |

# Open decisions I still want from you

These are the main places where I want your direction before implementation:

## 1. Existing stored workflow agents
What should happen if the configuration repository already contains:
- `sequential`
- `parallel`
- `loop`

Options:
- **A. hard fail** on load/use
- **B. silently treat them as invalid**
- **C. migrate them once**
- **D. keep temporary compatibility during transition**

My recommendation: **A or C**, depending on whether you care about existing persisted agents.

## 2. Code-defined custom agents
Should coded custom agents like `--rag-agent--` remain supported?

Options:
- **A. yes**, but they must behave as plain LLM-ish/custom runtime agents without composition
- **B. no**, remove them and keep only standard configured agents

My recommendation: **A for now**, unless you explicitly want full simplification.

## 3. Skill loading mechanism
Are you happy with this Pi-inspired compromise?
- Pi-style metadata discovery/prompt presentation
- restricted built-in loader for full skill content
- no arbitrary file-reading tool added

My recommendation: **yes**, this is the safest version.

## 4. Tool results in API responses
Do you agree with:
- **not returned by default**
- maybe add trace/debug mode later if needed

My recommendation: **yes**.

## 5. Public endpoint shape
Do you want to:
- keep both `/chat` and `/answer` externally, or
- collapse them into one public endpoint later?

My recommendation: **keep both for now**, unify internals only.

# Recommended implementation order

If we want the least risky path:

1. simplify agent schema/model
2. remove composition runtime
3. unify answer/chat internals
4. add snake_case aliasing
5. preserve `run_code`
6. add `find_nodes`, `get_node`, `semantic_search`
7. redesign skills Pi-style
8. update docs/spec/tests

# My current recommendation on the unresolved question you asked earlier

## Are tool results part of the answers getting back to users?
**Recommendation: no, not by default.**

They should remain part of the internal agent/tool loop and not be included in the normal response body returned to clients.

If desired later, we can design an **explicit trace mode**.
