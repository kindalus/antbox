# Agent Skills

Agent Skills are modular capabilities that extend AI Agent's functionality. Each Skill packages instructions, metadata, and optional resources (scripts, templates) that AI Agent uses automatically when relevant.

## Why use Skills

Skills are reusable, markdown-based resources that provide AI Agent with domain-specific expertise: workflows, context, and best practices that transform general-purpose agents into specialists. Unlike prompts (conversation-level instructions for one-off tasks), Skills load on-demand and eliminate the need to repeatedly provide the same guidance across multiple conversations.

Key benefits:

- Specialize AI Agent: Tailor capabilities for domain-specific tasks
- Reduce repetition: Create once, use automatically
- Compose capabilities: Combine Skills to build complex workflows

As model capabilities improve, we can now build general-purpose agents that interact with full-fledged computing environments. AI Agent Code, for example, can accomplish complex tasks across domains using local code execution and filesystems. But as these agents become more powerful, we need more composable, scalable, and portable ways to equip them with domain-specific expertise.

This led us to create Agent Skills: organized markdown file of instructions, scripts, and resources that agents can discover and load dynamically to perform better at specific tasks. Skills extend AI Agent’s capabilities by packaging your expertise into composable resources for AI Agent, transforming general-purpose agents into specialized agents that fit your needs.

Building a skill for an agent is like putting together an onboarding guide for a new hire. Instead of building fragmented, custom-designed agents for each use case, anyone can now specialize their agents with composable capabilities by capturing and sharing their procedural knowledge. In this article, we explain what Skills are, show how they work, and share best practices for building your own.

## How Skills work

While working on tasks, AI Agent scans available skills to find relevant matches. When one matches, it loads only the minimal information needed—keeping AI Agent fast while accessing specialized expertise.

Skills are:

- Composable: Skills stack together. AI Agent automatically identifies which skills are needed and coordinates their use.
- Portable: Skills use the same format everywhere. Build once, use across AI Agent apps, AI Agent Code, and API.
- Efficient: Only loads what's needed, when it's needed.
- Powerful: Skills can include executable code for tasks where traditional programming is more reliable than token generation.

Think of Skills as custom onboarding materials that let you package expertise, making AI Agent a specialist on what matters most to you.

## The anatomy of a skill

Lets look at this skill markdown file:

````markdown
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---

# PDF Processing

## Quick start

Use pdfplumber to extract text from PDFs:

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

For advanced form filling, see [Form Filling](#form-filling). For advanced features, Javascript libraries
and detailed examples, see the [Reference](#reference)

## Form Filling

<Form filling text>

## Reference

<Reference Text>
````

Skills can contain three types of content, each loaded at different times:

### Level 1: Metadata (always loaded)

Content type: Instructions. The Skill's YAML frontmatter provides discovery information:

```markdown
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---
```

AI Agents load this metadata at startup and includes it in the system prompt. This lightweight approach means you can install many Skills without context penalty; Claude only knows each Skill exists and when to use it.

### Level 2: Instructions (loaded when triggered)

Content type: Instructions. The main body of SKILL.md contains procedural knowledge: workflows, best practices, and guidance:

````markdown
# PDF Processing

## Quick start

Use pdfplumber to extract text from PDFs:

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

For advanced form filling, see [Form Filling](#form-filling). For advanced features, Javascript libraries
and detailed examples, see the [Reference](#reference)
````

### Level 3: Resources and code (loaded as needed)

Content types: Instructions, code, and resources. Skills can bundle additional materials:

```markdown
## Form Filling

<Form filling text>

## Reference

<Reference Text>
```

### Summary

Skills follow a progressive loading strategy that balances context efficiency with access to specialized knowledge. Each skill is a self-contained markdown file structured into three levels:

#### File Structure Requirements

- **Single H1 heading**: The skill must have exactly one level-1 heading (`#`), which serves as the skill title
- **Naming convention**: The YAML `name` field uses `kebab-case` (e.g., `pdf-processing`), while the H1 title uses title case (e.g., `PDF Processing`)
- **Self-contained**: All instructions and references should be contained within the single markdown file

#### Loading Levels Explained

| Level       | Content                                  | When Loaded             | Purpose                                             |
| ----------- | ---------------------------------------- | ----------------------- | --------------------------------------------------- |
| **Level 1** | YAML frontmatter (`name`, `description`) | At agent startup        | Discovery and matching                              |
| **Level 2** | H1 heading + first H2 section            | When skill is triggered | Core instructions and quick start                   |
| **Level 3** | All subsequent H2 sections               | On-demand via links     | Extended resources, references, and advanced topics |

#### Context Window Best Practices

To ensure efficient context usage and optimal agent performance, follow these size guidelines for each level:

| Level       | Token Limit    | Word Limit    | Rationale                                                                       |
| ----------- | -------------- | ------------- | ------------------------------------------------------------------------------- |
| **Level 1** | < 100 tokens   | < 70 words    | Loaded for all skills at startup; must be minimal to avoid context bloat        |
| **Level 2** | < 5,000 tokens | < 3,500 words | Core working instructions; should be comprehensive but focused                  |
| **Level 3** | Unlimited      | Unlimited     | Loaded on-demand; can contain extensive documentation, examples, and references |

**Guidelines:**

- Keep Level 1 descriptions concise but informative enough for accurate skill matching
- Level 2 should contain the essential knowledge needed for most tasks; avoid including rarely-used information
- Move detailed references, edge cases, and extensive examples to Level 3 sections
- When in doubt, prefer smaller Level 2 content with links to Level 3 resources

#### Progressive Loading Flow

1. **Startup**: The agent loads Level 1 metadata for all available skills into its system prompt. This is lightweight and incurs no significant context penalty.

2. **Skill Activation**: When the agent determines a skill is needed based on the task, it loads Level 2 content (the main instructions and quick start guide).

3. **Resource Loading**: If the agent needs additional information, it follows links in Level 2 to load specific Level 3 sections. All Level 3 resources must be referenced as links within Level 2 content.

#### Loading Skills Programmatically

Agents load skills using the `loadSkill` tool, which accepts the skill name and optional resource identifiers:

```typescript
/**
 * Load a skill and its resources.
 * @param skillName - The name of the skill to load (e.g., "pdf-processing").
 * @param resource - Optional resource sections to load (e.g., "form-filling", "reference").
 * @returns A promise that resolves to the loaded skill content.
 */
function loadSkill(skillName: string, ...resource: string[]): Promise<string>;
```

**Examples:**

- `loadSkill("pdf-processing")` - Loads Level 2 (core instructions)
- `loadSkill("pdf-processing", "form-filling")` - Loads Level 2 + the "Form Filling" section
- `loadSkill("pdf-processing", "form-filling", "reference")` - Loads Level 2 + multiple Level 3 sections

#### Access Control

Agents can be configured with access to all, some, or none of the available skills. Only skills the agent has access to will have their Level 1 metadata included in the system prompt.
