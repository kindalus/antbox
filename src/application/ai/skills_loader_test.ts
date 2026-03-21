import { afterEach, beforeEach, describe, it } from "bdd";
import { expect } from "expect";
import { loadSkillInstruction, loadSkills, loadSkillsFromDocumentation } from "./skills_loader.ts";
import { DOCS } from "../../../docs/index.ts";

async function createTempDir(): Promise<string> {
	return await Deno.makeTempDir();
}

async function writeSkill(root: string, skillName: string, content: string): Promise<void> {
	const dir = `${root}/${skillName}`;
	await Deno.mkdir(dir, { recursive: true });
	await Deno.writeTextFile(`${dir}/SKILL.md`, content);
}

function makeSkill(frontmatter: string, body = "# Skill\n\nInstructions\n"): string {
	return `---\n${frontmatter}\n---\n\n${body}`;
}

describe("loadSkills", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		await Deno.remove(tempDir, { recursive: true });
	});

	it("loads valid skills when directory name matches frontmatter name", async () => {
		await writeSkill(
			tempDir,
			"test-skill",
			makeSkill("name: test-skill\ndescription: A test skill"),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(1);
		expect(skills[0].frontmatter.name).toBe("test-skill");
		expect(skills[0].frontmatter.description).toBe("A test skill");
	});

	it("skips skill when frontmatter name differs from directory name", async () => {
		await writeSkill(
			tempDir,
			"directory-name",
			makeSkill("name: different-name\ndescription: Name mismatch"),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(0);
	});

	it("skips SKILL.md without valid frontmatter", async () => {
		await writeSkill(tempDir, "no-frontmatter", "# Missing frontmatter\n\nBody\n");

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(0);
	});

	it("skips frontmatter with missing required fields", async () => {
		await writeSkill(tempDir, "missing-description", makeSkill("name: missing-description"));

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(0);
	});

	it("enforces skill name constraints from the specification", async () => {
		await writeSkill(
			tempDir,
			"Bad-Name",
			makeSkill("name: Bad-Name\ndescription: Uppercase should fail"),
		);
		await writeSkill(
			tempDir,
			"bad--name",
			makeSkill("name: bad--name\ndescription: Double hyphen should fail"),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(0);
	});

	it("loads skills from builtin and extra paths with dedupe by name", async () => {
		const extraDir = await createTempDir();

		await writeSkill(
			tempDir,
			"shared-skill",
			makeSkill("name: shared-skill\ndescription: Builtin version"),
		);
		await writeSkill(
			extraDir,
			"shared-skill",
			makeSkill("name: shared-skill\ndescription: Extra version"),
		);
		await writeSkill(
			extraDir,
			"extra-skill",
			makeSkill("name: extra-skill\ndescription: Extra only"),
		);

		const skills = await loadSkills(tempDir, extraDir, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(2);
		const names = skills.map((s) => s.frontmatter.name).sort();
		expect(names).toEqual(["extra-skill", "shared-skill"]);

		const shared = skills.find((s) => s.frontmatter.name === "shared-skill");
		expect(shared?.frontmatter.description).toBe("Extra version");

		await Deno.remove(extraDir, { recursive: true });
	});

	it("parses allowed-tools as space-delimited list", async () => {
		await writeSkill(
			tempDir,
			"code-skill",
			makeSkill(
				"name: code-skill\ndescription: Uses tools\nallowed-tools: Bash(git:*) Read",
			),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(1);
		expect(skills[0].frontmatter.allowedTools).toEqual(["Bash(git:*)", "Read"]);
	});

	it("skips skills with non-spec frontmatter fields", async () => {
		await writeSkill(
			tempDir,
			"custom-field-skill",
			makeSkill(
				"name: custom-field-skill\ndescription: Invalid custom fields\nuser-invocable: false",
			),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(0);
	});

	it("accepts optional spec fields license, compatibility, and metadata", async () => {
		await writeSkill(
			tempDir,
			"rich-skill",
			makeSkill(
				'name: rich-skill\ndescription: Includes optional fields\nlicense: Apache-2.0\ncompatibility: Requires git and internet\nmetadata:\n  author: antbox\n  version: "1.0"',
			),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(1);
		expect(skills[0].frontmatter.license).toBe("Apache-2.0");
		expect(skills[0].frontmatter.compatibility).toBe("Requires git and internet");
		expect(skills[0].frontmatter.metadata).toEqual({ author: "antbox", version: "1.0" });
	});

	it("skips invalid metadata values (must be string map)", async () => {
		await writeSkill(
			tempDir,
			"invalid-metadata",
			makeSkill(
				"name: invalid-metadata\ndescription: Invalid metadata\nmetadata:\n  author: antbox\n  version: 1",
			),
		);

		const skills = await loadSkills(tempDir, undefined, { includeDocumentationSkills: false });

		expect(skills).toHaveLength(0);
	});
});

describe("loadSkillsFromDocumentation", () => {
	it("loads docs declared in docs/index.ts as skills", async () => {
		const skills = await loadSkillsFromDocumentation();

		expect(skills).toHaveLength(DOCS.length);
		for (const doc of DOCS) {
			const loaded = skills.find((s) => s.frontmatter.name === doc.uuid);
			expect(loaded).toBeDefined();
			expect(loaded?.frontmatter.description).toBe(doc.description);
		}
	});
});

describe("loadSkillInstruction", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		await Deno.remove(tempDir, { recursive: true });
	});

	it("returns instruction body without frontmatter", async () => {
		await writeSkill(
			tempDir,
			"instruction-skill",
			makeSkill("name: instruction-skill\ndescription: Has body", "# Header\n\nBody content\n"),
		);

		const instruction = await loadSkillInstruction(`${tempDir}/instruction-skill/SKILL.md`);

		expect(instruction).toContain("# Header");
		expect(instruction).toContain("Body content");
		expect(instruction?.includes("name: instruction-skill")).toBe(false);
	});

	it("returns undefined when file is invalid", async () => {
		await writeSkill(tempDir, "invalid", "# no frontmatter");

		const instruction = await loadSkillInstruction(`${tempDir}/invalid/SKILL.md`);

		expect(instruction).toBeUndefined();
	});
});
