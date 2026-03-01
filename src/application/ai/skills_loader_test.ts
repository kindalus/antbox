import { describe, it, beforeEach, afterEach } from "bdd";
import { expect } from "expect";
import { loadSkillAgents } from "./skills_loader.ts";

// ============================================================================
// HELPERS
// ============================================================================

async function createTempDir(): Promise<string> {
	return await Deno.makeTempDir();
}

/**
 * Creates a skill directory `<root>/<skillName>/SKILL.md` with the given content.
 */
async function writeSkill(root: string, skillName: string, content: string): Promise<void> {
	const dir = `${root}/${skillName}`;
	await Deno.mkdir(dir, { recursive: true });
	await Deno.writeTextFile(`${dir}/SKILL.md`, content);
}

// ============================================================================
// FIXTURES
// ============================================================================

const VALID_SKILL = `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is the full instruction content for the test skill.
It can span multiple paragraphs.

## Details

More detailed information about how to use this skill.
`;

const SKILL_NO_FRONTMATTER = `# No Frontmatter Skill

This skill file has no YAML frontmatter and should be skipped.
`;

const SKILL_MISSING_DESCRIPTION = `---
name: incomplete-skill
---

# Incomplete Skill

Missing the description field.
`;

const MODEL = "google/gemini-2.5-flash";

// ============================================================================
// TESTS
// ============================================================================

describe("loadSkillAgents", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		await Deno.remove(tempDir, { recursive: true });
	});

	it("loads skill directories containing SKILL.md and returns one AgentTool per skill", async () => {
		await writeSkill(tempDir, "test-skill", VALID_SKILL);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("test-skill");
	});

	it("reads name from SKILL.md frontmatter, not from directory name", async () => {
		// directory is "my-dir" but frontmatter name is "test-skill"
		await writeSkill(tempDir, "my-dir", VALID_SKILL);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools[0].name).toBe("test-skill");
	});

	it("skips directories without a SKILL.md file", async () => {
		// bare directory with no SKILL.md
		await Deno.mkdir(`${tempDir}/empty-dir`);
		await writeSkill(tempDir, "valid-skill", VALID_SKILL);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("test-skill");
	});

	it("skips SKILL.md without valid frontmatter", async () => {
		await writeSkill(tempDir, "no-front", SKILL_NO_FRONTMATTER);
		await writeSkill(tempDir, "valid", VALID_SKILL);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("test-skill");
	});

	it("skips SKILL.md with incomplete frontmatter (missing description)", async () => {
		await writeSkill(tempDir, "incomplete", SKILL_MISSING_DESCRIPTION);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(0);
	});

	it("ignores flat .md files — only directories are loaded", async () => {
		await Deno.writeTextFile(`${tempDir}/flat-file.md`, VALID_SKILL);
		await writeSkill(tempDir, "real-skill", VALID_SKILL);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
	});

	it("loads multiple skill directories", async () => {
		const skill2 = `---
name: second-skill
description: The second test skill
---

# Second Skill
`;
		await writeSkill(tempDir, "first", VALID_SKILL);
		await writeSkill(tempDir, "second", skill2);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(2);
		const names = tools.map((t) => t.name).sort();
		expect(names).toContain("test-skill");
		expect(names).toContain("second-skill");
	});

	it("returns empty array when builtin dir does not exist", async () => {
		const nonExistent = `${tempDir}/does-not-exist`;

		const tools = await loadSkillAgents(MODEL, nonExistent);

		expect(tools).toHaveLength(0);
	});

	it("loads skills from extra path when provided", async () => {
		const extraDir = await createTempDir();
		const extraSkill = `---
name: extra-skill
description: An extra skill from additional path
---

# Extra Skill
`;
		await writeSkill(tempDir, "builtin", VALID_SKILL);
		await writeSkill(extraDir, "extra", extraSkill);

		const tools = await loadSkillAgents(MODEL, tempDir, extraDir);

		expect(tools).toHaveLength(2);
		const names = tools.map((t) => t.name).sort();
		expect(names).toContain("test-skill");
		expect(names).toContain("extra-skill");

		await Deno.remove(extraDir, { recursive: true });
	});

	it("returns only builtin skills when extra path does not exist", async () => {
		await writeSkill(tempDir, "builtin", VALID_SKILL);
		const nonExistentExtra = `${tempDir}/nonexistent-extra`;

		const tools = await loadSkillAgents(MODEL, tempDir, nonExistentExtra);

		expect(tools).toHaveLength(1);
	});

	it("parses explicit type: llm", async () => {
		const skill = `---
name: explicit-llm-skill
description: Explicitly typed LLM skill
type: llm
---

# LLM Skill
`;
		await writeSkill(tempDir, "llm-skill", skill);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("explicit-llm-skill");
	});

	it("parses custom model override", async () => {
		const skill = `---
name: custom-model-skill
description: Skill with a custom model
type: llm
model: anthropic/claude-opus-4
---

# Custom Model Skill
`;
		await writeSkill(tempDir, "model-skill", skill);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("custom-model-skill");
	});

	it("parses allowed-tools as comma-separated string", async () => {
		const skill = `---
name: code-skill
description: A skill that uses runCode
allowed-tools: runCode
---

# Code Skill
`;
		await writeSkill(tempDir, "code-skill", skill);

		// Skills with allowed-tools pointing to non-existent skill tools
		// just load without those tools (function tools injected by engine)
		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("code-skill");
	});

	it("parses allowed-tools as YAML list", async () => {
		const skill = `---
name: multi-tool-skill
description: A skill with multiple allowed tools
allowed-tools:
  - runCode
  - some-other-skill
---

# Multi-Tool Skill
`;
		await writeSkill(tempDir, "multi-skill", skill);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("multi-tool-skill");
	});

	it("loads sequential workflow skill that references sub-skills by name", async () => {
		const subSkillA = `---
name: sub-skill-a
description: First sub-skill
---

# Sub Skill A
`;
		const subSkillB = `---
name: sub-skill-b
description: Second sub-skill
---

# Sub Skill B
`;
		const pipeline = `---
name: my-pipeline
description: A sequential pipeline
type: sequential
agents:
  - sub-skill-a
  - sub-skill-b
---
`;
		await writeSkill(tempDir, "sub-a", subSkillA);
		await writeSkill(tempDir, "sub-b", subSkillB);
		await writeSkill(tempDir, "pipeline", pipeline);

		const tools = await loadSkillAgents(MODEL, tempDir);

		// 2 LLM sub-skills + 1 sequential pipeline
		expect(tools).toHaveLength(3);
		const names = tools.map((t) => t.name);
		expect(names).toContain("sub-skill-a");
		expect(names).toContain("sub-skill-b");
		expect(names).toContain("my-pipeline");
	});

	it("skips workflow skill with all-unknown sub-skill references", async () => {
		const pipeline = `---
name: broken-pipeline
description: A pipeline with unknown sub-skills
type: sequential
agents:
  - nonexistent-skill
---
`;
		await writeSkill(tempDir, "broken", pipeline);

		const tools = await loadSkillAgents(MODEL, tempDir);

		expect(tools).toHaveLength(0);
	});

	it("parses user-invocable: false without breaking loading", async () => {
		const skill = `---
name: background-skill
description: A background knowledge skill
user-invocable: false
---

# Background Skill

This skill is not user-invocable.
`;
		await writeSkill(tempDir, "bg-skill", skill);

		const tools = await loadSkillAgents(MODEL, tempDir);

		// Still loads — user-invocable is metadata, doesn't affect ADK agent creation
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("background-skill");
	});
});
