import { parse as parseYaml } from "@std/yaml";
import { Logger } from "shared/logger.ts";
import { DOCS } from "../../../docs/index.ts";
import { fromFileUrl } from "jsr:@std/path@1.1.2";

const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_NAME_LENGTH = 64;
const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_COMPATIBILITY_LENGTH = 500;
const DOCUMENTATION_DIR = fromFileUrl(new URL("../../../docs", import.meta.url));
const SKILL_FRONTMATTER_KEYS = new Set([
	"name",
	"description",
	"license",
	"compatibility",
	"metadata",
	"allowed-tools",
]);

export interface SkillFrontmatter {
	name: string;
	description: string;
	license?: string;
	compatibility?: string;
	metadata?: Record<string, string>;
	allowedTools?: string[];
}

export interface LoadedSkill {
	frontmatter: SkillFrontmatter;
	skillDir: string;
	skillFile: string;
}

export interface LoadSkillsOptions {
	includeDocumentationSkills?: boolean;
}

interface ParsedSkill {
	frontmatter: SkillFrontmatter;
	instruction: string;
}

function parseAllowedTools(rawAllowedTools: unknown): string[] | undefined {
	if (typeof rawAllowedTools === "string") {
		return rawAllowedTools.trim().length > 0
			? rawAllowedTools.trim().split(/\s+/).filter(Boolean)
			: [];
	}

	return undefined;
}

function parseMetadata(rawMetadata: unknown): Record<string, string> | undefined {
	if (rawMetadata === undefined) {
		return undefined;
	}

	if (
		typeof rawMetadata !== "object" ||
		rawMetadata === null ||
		Array.isArray(rawMetadata)
	) {
		return undefined;
	}

	const metadata: Record<string, string> = {};
	for (const [key, value] of Object.entries(rawMetadata as Record<string, unknown>)) {
		if (typeof value !== "string") {
			return undefined;
		}
		metadata[key] = value;
	}

	return metadata;
}

function parseSkillMarkdown(markdown: string, skillDirName?: string): ParsedSkill | undefined {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return undefined;
	}

	const yaml = match[1].trim();
	const instruction = match[2].trimStart();

	try {
		const data = parseYaml(yaml) as Record<string, unknown>;

		for (const key of Object.keys(data)) {
			if (!SKILL_FRONTMATTER_KEYS.has(key)) {
				return undefined;
			}
		}

		if (typeof data.name !== "string" || typeof data.description !== "string") {
			return undefined;
		}

		if (
			data.name.length === 0 ||
			data.name.length > MAX_SKILL_NAME_LENGTH ||
			!SKILL_NAME_REGEX.test(data.name)
		) {
			return undefined;
		}

		if (skillDirName && data.name !== skillDirName) {
			return undefined;
		}

		const description = data.description.trim();
		if (description.length === 0 || description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
			return undefined;
		}

		if (
			data.compatibility !== undefined &&
			(typeof data.compatibility !== "string" ||
				data.compatibility.length > MAX_SKILL_COMPATIBILITY_LENGTH)
		) {
			return undefined;
		}

		if (data.license !== undefined && typeof data.license !== "string") {
			return undefined;
		}

		const metadata = parseMetadata(data.metadata);
		if (data.metadata !== undefined && metadata === undefined) {
			return undefined;
		}

		const frontmatter: SkillFrontmatter = {
			name: data.name,
			description,
			license: typeof data.license === "string" ? data.license : undefined,
			compatibility: typeof data.compatibility === "string" ? data.compatibility : undefined,
			metadata,
			allowedTools: parseAllowedTools(data["allowed-tools"]),
		};

		return { frontmatter, instruction };
	} catch {
		return undefined;
	}
}

async function readSkillsFromDirectory(dirPath: string): Promise<LoadedSkill[]> {
	const results: LoadedSkill[] = [];

	try {
		const entries = Deno.readDir(dirPath);

		for await (const entry of entries) {
			if (!entry.isDirectory) {
				continue;
			}

			const skillDir = `${dirPath}/${entry.name}`;
			const skillFile = `${skillDir}/SKILL.md`;

			try {
				const markdown = await Deno.readTextFile(skillFile);
				const parsedSkill = parseSkillMarkdown(markdown, entry.name);

				if (!parsedSkill) {
					Logger.warn(`skills_loader: skipping ${skillFile} - invalid SKILL.md frontmatter`);
					continue;
				}

				results.push({
					skillDir,
					skillFile,
					frontmatter: parsedSkill.frontmatter,
				});
			} catch (error) {
				if ((error as { code?: string }).code === "ENOENT") {
					Logger.debug(`skills_loader: no SKILL.md in ${skillDir}, skipping`);
				} else {
					Logger.warn(`skills_loader: failed reading ${skillFile}: ${error}`);
				}
			}
		}
	} catch (error) {
		if ((error as { code?: string }).code === "ENOENT") {
			Logger.debug(`skills_loader: directory not found: ${dirPath}`);
		} else {
			Logger.warn(`skills_loader: error reading directory ${dirPath}: ${error}`);
		}
	}

	return results;
}

/**
 * Discover documentation files (docs/*.md listed in docs/index.ts) as skills.
 *
 * This keeps skills aligned with the public documentation registry and allows
 * docs to be loaded through the skillLoader tool.
 */
export async function loadSkillsFromDocumentation(): Promise<LoadedSkill[]> {
	const results: LoadedSkill[] = [];

	for (const doc of DOCS) {
		const skillFile = `${DOCUMENTATION_DIR}/${doc.uuid}.md`;

		try {
			const markdown = await Deno.readTextFile(skillFile);
			const parsedSkill = parseSkillMarkdown(markdown);

			if (!parsedSkill) {
				Logger.warn(`skills_loader: skipping doc ${skillFile} - invalid skill frontmatter`);
				continue;
			}

			if (
				parsedSkill.frontmatter.name !== doc.uuid ||
				parsedSkill.frontmatter.description !== doc.description
			) {
				Logger.warn(
					`skills_loader: skipping doc ${skillFile} - frontmatter does not match docs/index.ts`,
				);
				continue;
			}

			results.push({
				skillDir: DOCUMENTATION_DIR,
				skillFile,
				frontmatter: parsedSkill.frontmatter,
			});
		} catch (error) {
			Logger.warn(`skills_loader: failed reading documentation skill ${skillFile}: ${error}`);
		}
	}

	return results;
}

/**
 * Discover skills from builtin and optional extra directories.
 *
 * The result includes only metadata + file locations (no runtime skill execution wrappers).
 */
export async function loadSkills(
	builtinSkillsDir: string,
	extraSkillsPath?: string,
	options?: LoadSkillsOptions,
): Promise<LoadedSkill[]> {
	const includeDocumentationSkills = options?.includeDocumentationSkills ?? true;
	const documentationSkills = includeDocumentationSkills ? await loadSkillsFromDocumentation() : [];
	const builtinSkills = await readSkillsFromDirectory(builtinSkillsDir);
	const extraSkills = extraSkillsPath ? await readSkillsFromDirectory(extraSkillsPath) : [];

	const byName = new Map<string, LoadedSkill>();
	for (const skill of [...documentationSkills, ...builtinSkills, ...extraSkills]) {
		const existing = byName.get(skill.frontmatter.name);
		if (existing) {
			Logger.warn(
				`skills_loader: duplicate skill name '${skill.frontmatter.name}', using '${skill.skillFile}'`,
			);
		}
		byName.set(skill.frontmatter.name, skill);
	}

	const skills = Array.from(byName.values()).sort((a, b) =>
		a.frontmatter.name.localeCompare(b.frontmatter.name)
	);

	Logger.info(
		`skills_loader: loaded ${documentationSkills.length} docs + ${builtinSkills.length} builtin + ${extraSkills.length} extra skills (${skills.length} total unique)`,
	);

	return skills;
}

/**
 * Load full skill instructions from a SKILL.md file.
 *
 * Returns only the markdown instruction body (frontmatter stripped),
 * suitable for injection into model context as loaded skill knowledge.
 */
export async function loadSkillInstruction(skillFile: string): Promise<string | undefined> {
	try {
		const markdown = await Deno.readTextFile(skillFile);
		const parsedSkill = parseSkillMarkdown(markdown);
		if (!parsedSkill) {
			return undefined;
		}

		return parsedSkill.instruction;
	} catch (error) {
		Logger.warn(`skills_loader: failed loading instruction from ${skillFile}: ${error}`);
		return undefined;
	}
}
