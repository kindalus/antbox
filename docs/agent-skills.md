---
name: agent-skills
description: How agent skills work
---

# Agent Skills

Antbox uses a tool-based Agent Skills integration. Skills are discovered at startup, exposed to
agents through a function tool, and loaded on demand as instruction text.

## Current implementation

Skills are integrated with these components:

- `src/application/ai/skills_loader.ts`
- `src/setup/setup_tenants.ts`
- `src/application/ai/agents_engine.ts`

At runtime:

1. Skills are discovered during tenant setup.
2. Agent toolset always includes `skillLoader`.
3. The model can call `skillLoader` with a skill name.
4. The loader returns the skill instruction body (frontmatter removed).
5. That tool response becomes part of model context for the current reasoning flow.

## Skill sources

Antbox loads skills from three sources:

1. Documentation skills derived from `docs/index.ts` entries (`docs/*.md`).
2. Built-in skills from `src/application/ai/builtin_skills/*/SKILL.md`.
3. Optional tenant skills from `[tenants.ai].skillsPath`.

When duplicate skill names exist, later sources win. Effective precedence is:

- extra skills > built-in skills > documentation skills

## Skill frontmatter format

Antbox follows the Agent Skills frontmatter format.

Required fields:

- `name`
- `description`

Optional fields:

- `license`
- `compatibility`
- `metadata`
- `allowed-tools`

Validation rules:

- no unknown frontmatter keys are allowed
- `name` must be kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) and <= 64 chars
- `description` must be non-empty and <= 1024 chars
- `compatibility` must be <= 500 chars when present
- `metadata` must be string-to-string map when present

For directory-based skills (`SKILL.md`):

- frontmatter `name` must match the folder name

For documentation-based skills (`docs/*.md`):

- frontmatter `name` and `description` must match the corresponding entry in `docs/index.ts`

## `skillLoader` tool

Agents receive a `skillLoader` function tool with this behavior:

- `name`: `skillLoader`
- `parameter`: `name` (skill name)
- description contains a discoverable list of available skills

Usage:

- if skill exists: returns a payload containing skill metadata and full instruction body
- if not found: returns error text plus the available skill list
- if file read/parse fails: returns load failure text

Important:

- `skillLoader` is always included in the agent toolset, even when `agent.tools` is an empty array
- no skill scripts are executed yet (instruction loading only)

## Documentation skills

All documents listed in `docs/index.ts` are also treated as skills. This enables models to load
domain docs through `skillLoader` instead of hardcoding documentation text in prompts.

Each `docs/*.md` file listed in `docs/index.ts` must start with this frontmatter shape:

```markdown
---
name: <doc-uuid>
description: <doc-description>
---
```

The public docs API (`GET /v2/docs/{uuid}`) strips frontmatter before returning markdown content.

## Custom skill example

Create a directory under your configured `skillsPath`, for example:

`/opt/antbox-skills/pdf-processing/SKILL.md`

```markdown
---
name: pdf-processing
description: Extract and normalize text from PDF documents.
allowed-tools: runCode
---

# PDF Processing

Use this skill when the user asks to process PDF content.

## Steps

1. Export target node.
2. Extract text.
3. Return structured output.
```

Then set tenant config:

```toml
[tenants.ai]
enabled = true
skillsPath = "/opt/antbox-skills"
```

Restart the server to refresh discovered skills.
