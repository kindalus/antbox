import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import fs from "node:fs/promises";
import { basename, sep } from "node:path";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import type { LoadedSkill } from "./skills_loader.ts";

export const SKILL_READ_TOOL_NAME = "read";

/**
 * Builds Pi's read tool confined to the given skills. A skill that owns its directory
 * exposes that directory; a documentation skill shares docs/ and exposes only its file.
 */
export async function createSkillReadTool(
	skills: readonly LoadedSkill[],
): Promise<AgentTool<TSchema, unknown>> {
	const pi = await loadPiCodingAgent();
	const roots = await realPaths(
		skills.filter((skill) => ownsDirectory(skill)).map((skill) => skill.skillDir),
	);
	const files = new Set(await realPaths(skills.map((skill) => skill.skillFile)));

	const authorize = async (path: string): Promise<string> => {
		const real = await fs.realpath(path).catch(() => undefined);
		if (real && (files.has(real) || roots.some((root) => real.startsWith(root + sep)))) {
			return real;
		}
		throw new Error(`File not available: ${path}`);
	};

	return pi.createReadTool(process.cwd(), {
		operations: {
			access: async (path: string) => {
				await authorize(path);
			},
			readFile: async (path: string) => await fs.readFile(await authorize(path)),
		},
	}) as unknown as AgentTool<TSchema, unknown>;
}

function ownsDirectory(skill: LoadedSkill): boolean {
	return basename(skill.skillDir) === skill.frontmatter.name;
}

async function realPaths(paths: readonly string[]): Promise<string[]> {
	const resolved = await Promise.all(
		paths.map((path) => fs.realpath(path).catch(() => undefined)),
	);
	return resolved.filter((path): path is string => path !== undefined);
}
