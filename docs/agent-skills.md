---
name: agent-skills
description: How agent skills work
---

# Agent Skills

Antbox uses a Pi-style metadata-first skill integration. Skills are discovered at startup, listed in
agent context as lightweight metadata, and loaded on demand only when needed.

## Current implementation

Skills are integrated with these components:

- `src/application/ai/skills_loader.ts`
- `src/setup/setup_tenants.ts`
- `src/application/ai/agents_engine.ts`

At runtime:

1. Skills are discovered during tenant setup.
2. Agent instructions include an `<available_skills>` block with skill metadata.
3. The model can call `load_skill` with a skill name.
4. Antbox returns the full skill instruction body (frontmatter removed), wrapped with path guidance.
5. That loaded content becomes part of model context for the current reasoning flow.

## Skill sources

Antbox loads skills from three sources:

1. Documentation skills derived from `docs/index.ts` entries (`docs/*.md`).
2. Built-in skills from `src/application/ai/builtin_skills/*/SKILL.md`.
3. Optional tenant skills from `[tenants.ai].skillsPath`.

When duplicate skill names exist, later configured sources override earlier ones. Current effective
precedence is:

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

## `load_skill` tool

Agents receive a `load_skill` function tool with this behavior:

- `name`: `load_skill`
- `parameter`: `name` (skill name)
- loads only previously discovered skills
- returns the full skill body plus relative-path guidance

Important:

- `load_skill` is always included in the agent toolset, even when `agent.tools` is an empty array
- no skill scripts are executed automatically; only instruction loading happens
- arbitrary filesystem reads are not exposed through this tool

## Documentation skills

All documents listed in `docs/index.ts` are also treated as skills. This enables models to load
domain docs through `load_skill` instead of hardcoding documentation text in prompts.

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
allowed-tools: run_code
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
