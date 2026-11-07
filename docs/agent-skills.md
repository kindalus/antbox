---
name: agent-skills
description: How agent skills work
---

# Agent Skills

Antbox uses Pi's native skill mechanism with metadata-first progressive disclosure. Skills are
discovered at startup, listed in the agent's system prompt as lightweight metadata (name,
description and file location), and loaded on demand when the model reads the skill file.

## Current implementation

Skills are integrated with these components:

- `src/application/ai/skills_loader.ts`
- `src/setup/setup_tenants.ts`
- `src/application/ai/pi_agent_session.ts`
- `src/application/ai/skill_read_tool.ts`

Antbox stays responsible for discovery, precedence and per-agent selection, and hands the resulting
skills to Pi through `skillsOverride`. Pi then lists them in the system prompt and the model loads
one by calling the `read` tool on its file. Antbox does not add its own skill-loading tool.

At runtime:

1. Skills are discovered during tenant setup.
2. For each run, the skills allowed by `AgentData.skills` are passed to Pi.
3. Pi adds an `<available_skills>` block with each skill's name, description and location to the
   system prompt.
4. When a task matches a description, the model calls `read` with the skill's file path.
5. Skill files stay in model context for the rest of the session. Files referenced by the skill
   (for example `references/guide.md`) are loaded the same way, only when needed.

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

## `read` tool

Every agent receives a `read` tool. It is Pi's file reader, confined to the agent's skills:

- the tool is always included in the agent toolset, even when `agent.tools` is `false` or an empty
  array
- a directory-based skill exposes its whole directory (`SKILL.md`, `references/`, `assets/`, ...)
- a documentation skill exposes only its own `docs/*.md` file, not the other docs
- skills outside the agent's `skills` allow-list are neither listed nor readable
- every other path fails with the same `File not available` error, whether the file exists or not;
  symlinks and `..` segments are resolved before the check, so they cannot escape the skills
- `read` handles text only; images are not detected
- output is truncated at 50KB or 2000 lines, whichever comes first; the model pages through longer
  files with the `offset` and `limit` parameters
- no skill scripts are executed; only file reading happens

The name `read` is reserved. A feature exposed as an AI tool cannot use it (nor `run_code`,
`find_nodes`, `get_node`, `semantic_search` or `find_documents`): creating or updating such a feature is rejected,
and a stored feature that collides is ignored as an AI tool, with a warning in the log.

## Documentation skills

All documents listed in `docs/index.ts` are also treated as skills. This enables models to load
domain docs through `read` instead of hardcoding documentation text in prompts.

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
