import { afterAll, beforeAll, describe, it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillReadTool } from "./skill_read_tool.ts";
import type { LoadedSkill } from "./skills_loader.ts";

let root: string;
const skill = (
	name: string,
	skillDir: string,
	skillFile = `${skillDir}/SKILL.md`,
): LoadedSkill => ({
	frontmatter: { name, description: name },
	skillDir,
	skillFile,
});
const text = (r: { content: { type: string; text?: string }[] }) => r.content[0].text ?? "";

describe("createSkillReadTool", () => {
	beforeAll(async () => {
		root = await fs.mkdtemp(join(tmpdir(), "skill-read-"));
		for (const d of ["good/references", "good-evil", "denied", "docs"]) {
			await fs.mkdir(join(root, d), { recursive: true });
		}
		await fs.writeFile(join(root, "good/SKILL.md"), "---\nname: good\n---\nGOOD");
		await fs.writeFile(join(root, "good/references/a.md"), "REF");
		await fs.writeFile(join(root, "good-evil/x.md"), "EVIL");
		await fs.writeFile(join(root, "denied/SKILL.md"), "DENIED");
		await fs.writeFile(join(root, "docs/allowed.md"), "DOC");
		await fs.writeFile(join(root, "docs/other.md"), "OTHER-DOC");
		await fs.writeFile(join(root, "secret.key"), "SECRET");
		await fs.symlink(join(root, "secret.key"), join(root, "good/link.md"));
		await fs.symlink(root, join(root, "good/dirlink"));
	});
	afterAll(async () => {
		await fs.rm(root, { recursive: true });
	});
	const tool = () =>
		createSkillReadTool([
			skill("good", `${root}/good`),
			skill("allowed", `${root}/docs`, `${root}/docs/allowed.md`),
		]);

	it("reads skill files and references", async () => {
		const t = await tool();
		expect(text(await t.execute("1", { path: `${root}/good/SKILL.md` }))).toContain("GOOD");
		expect(text(await t.execute("2", { path: `${root}/good/references/a.md` }))).toBe("REF");
		expect(text(await t.execute("3", { path: `${root}/docs/allowed.md` }))).toBe("DOC");
	});

	for (
		const [name, path] of [
			["outside file", "secret.key"],
			["traversal", "good/../secret.key"],
			["sibling with same prefix", "good-evil/x.md"],
			["symlink to file", "good/link.md"],
			["symlink to directory", "good/dirlink/secret.key"],
			["skill not allowed", "denied/SKILL.md"],
			["neighbour doc", "docs/other.md"],
		]
	) {
		it(`denies ${name}`, async () => {
			const t = await tool();
			await expect(t.execute("1", { path: `${root}/${path}` })).rejects.toThrow(
				"File not available",
			);
		});
	}

	it("does not reveal whether a denied file exists", async () => {
		const t = await tool();
		const message = (p: string) =>
			t.execute("1", { path: p }).then(() => "read", (e: Error) => e.message.replace(p, "PATH"));
		expect(await message(`${root}/secret.key`)).toBe(await message(`${root}/missing.key`));
	});
});
