import { AgentTool, LoopAgent, LlmAgent, ParallelAgent, SequentialAgent } from "@google/adk";
import { Logger } from "shared/logger.ts";
import { parse as parseYaml } from "@std/yaml";

/**
 * Parsed YAML frontmatter from a SKILL.md file.
 * Field names follow the Claude Code skills spec (kebab-case keys parsed by YAML).
 */
export interface SkillFrontmatter {
	name: string;
	description: string;
	/** ADK model string, overrides defaultModel for this skill's LlmAgent */
	model?: string;
	/** Type of ADK agent to create (default: "llm") */
	type?: "llm" | "sequential" | "parallel" | "loop";
	/** Sub-skill names to compose (workflow types only) */
	agents?: string[];
	/**
	 * Whitelist of tool names this skill's LlmAgent may use.
	 * Absent = no sub-tools; [] = explicitly none.
	 * Maps to `allowed-tools` in the SKILL.md frontmatter.
	 */
	allowedTools?: string[];
	/** When false, the skill is a background knowledge agent (default: true) */
	userInvocable?: boolean;
}

/**
 * Parses YAML frontmatter from skill markdown content.
 * Returns undefined if the content has no valid `---`-delimited frontmatter
 * or if required fields (name, description) are missing.
 */
function parseFrontmatter(markdown: string): SkillFrontmatter | undefined {
	if (!markdown.startsWith("---")) return undefined;

	const end = markdown.indexOf("\n---", 3);
	if (end === -1) return undefined;

	const yaml = markdown.substring(4, end).trim();
	try {
		const data = parseYaml(yaml) as Record<string, unknown>;

		if (typeof data.name !== "string" || typeof data.description !== "string") {
			return undefined;
		}

		// `allowed-tools` may be a YAML list or a comma-separated string
		const rawAllowedTools = data["allowed-tools"];
		let allowedTools: string[] | undefined;
		if (Array.isArray(rawAllowedTools)) {
			allowedTools = rawAllowedTools.filter((t): t is string => typeof t === "string");
		} else if (typeof rawAllowedTools === "string" && rawAllowedTools.trim().length > 0) {
			allowedTools = rawAllowedTools.split(",").map((s) => s.trim()).filter(Boolean);
		}

		// `user-invocable` defaults to true
		const rawUserInvocable = data["user-invocable"];
		const userInvocable = typeof rawUserInvocable === "boolean" ? rawUserInvocable : true;

		return {
			name: data.name,
			description: data.description,
			type: (data.type as SkillFrontmatter["type"]) ?? undefined,
			model: typeof data.model === "string" ? data.model : undefined,
			agents: Array.isArray(data.agents)
				? (data.agents as unknown[]).filter((a): a is string => typeof a === "string")
				: undefined,
			allowedTools,
			userInvocable,
		};
	} catch {
		return undefined;
	}
}

/**
 * Reads all skill directories from `dirPath`.
 * Each skill is a subdirectory containing a `SKILL.md` file.
 * Returns parsed entries for further processing.
 */
async function readSkillFiles(
	dirPath: string,
): Promise<Array<{ skillDir: string; markdown: string; frontmatter: SkillFrontmatter }>> {
	const results: Array<{ skillDir: string; markdown: string; frontmatter: SkillFrontmatter }> =
		[];

	try {
		const entries = Deno.readDir(dirPath);

		for await (const entry of entries) {
			if (!entry.isDirectory) continue;

			const skillDir = `${dirPath}/${entry.name}`;
			const skillFile = `${skillDir}/SKILL.md`;

			try {
				const markdown = await Deno.readTextFile(skillFile);
				const frontmatter = parseFrontmatter(markdown);

				if (!frontmatter) {
					Logger.warn(`skills_loader: skipping ${skillFile} — no valid frontmatter`);
					continue;
				}

				results.push({ skillDir, markdown, frontmatter });
			} catch (error) {
				if ((error as { code?: string }).code === "ENOENT") {
					Logger.debug(
						`skills_loader: no SKILL.md in ${skillDir}, skipping`,
					);
				} else {
					Logger.warn(`skills_loader: failed to read ${skillFile}: ${error}`);
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
 * Builds an LlmAgent for a skill.
 * Sub-tool references (from `allowed-tools`) are resolved against already-built AgentTools.
 */
function buildLlmSkillAgent(
	frontmatter: SkillFrontmatter,
	markdown: string,
	defaultModel: string,
	builtToolsByName: Map<string, AgentTool>,
): LlmAgent {
	const model = frontmatter.model ?? defaultModel;

	// Resolve sub-agent tools from `allowed-tools` whitelist
	const tools: AgentTool[] = (frontmatter.allowedTools ?? [])
		.map((name) => builtToolsByName.get(name))
		.filter((t): t is AgentTool => t !== undefined);

	return new LlmAgent({
		name: frontmatter.name,
		description: frontmatter.description,
		instruction: markdown,
		model,
		tools,
	});
}

type BaseAgent = LlmAgent | SequentialAgent | ParallelAgent | LoopAgent;

/**
 * Loads all skill agents from builtin and optional extra skills directories.
 *
 * Each skill lives in its own subdirectory containing a `SKILL.md` file:
 * ```
 * <dir>/
 *   my-skill/
 *     SKILL.md
 *   another-skill/
 *     SKILL.md
 * ```
 *
 * Uses two-pass loading:
 * - Pass 1: Build all LLM skills into a name → agent/tool map
 * - Pass 2: Build workflow skills (sequential/parallel/loop) resolving sub-agents by name
 *
 * @param defaultModel ADK model string (e.g. "google/gemini-2.5-flash")
 * @param builtinSkillsDir Path to built-in skills directory
 * @param extraSkillsPath Optional path to additional skills directory
 * @returns Array of AgentTool instances, one per skill
 */
export async function loadSkillAgents(
	defaultModel: string,
	builtinSkillsDir: string,
	extraSkillsPath?: string,
): Promise<AgentTool[]> {
	const builtinFiles = await readSkillFiles(builtinSkillsDir);
	const extraFiles = extraSkillsPath ? await readSkillFiles(extraSkillsPath) : [];
	const allFiles = [...builtinFiles, ...extraFiles];

	// Track the underlying agents separately so workflow skills can compose them
	// without accessing the private AgentTool.agent field.
	const agentsByName = new Map<string, BaseAgent>();
	const toolsByName = new Map<string, AgentTool>();

	// Pass 1 — LLM skills
	for (const { skillDir, markdown, frontmatter } of allFiles) {
		const type = frontmatter.type ?? "llm";
		if (type !== "llm") continue;

		try {
			const agent = buildLlmSkillAgent(frontmatter, markdown, defaultModel, toolsByName);
			const tool = new AgentTool({ agent });
			agentsByName.set(frontmatter.name, agent);
			toolsByName.set(frontmatter.name, tool);
		} catch (error) {
			Logger.warn(`skills_loader: failed to build LLM skill in ${skillDir}: ${error}`);
		}
	}

	// Pass 2 — Workflow skills (sequential / parallel / loop)
	for (const { skillDir, frontmatter } of allFiles) {
		const type = frontmatter.type ?? "llm";
		if (type === "llm") continue;

		try {
			const subAgents = (frontmatter.agents ?? [])
				.map((name) => {
					const agent = agentsByName.get(name);
					if (!agent) {
						Logger.warn(
							`skills_loader: workflow skill "${frontmatter.name}" references unknown sub-skill "${name}"`,
						);
					}
					return agent;
				})
				.filter((a): a is BaseAgent => a !== undefined);

			if (subAgents.length === 0) {
				Logger.warn(
					`skills_loader: workflow skill in ${skillDir} has no resolved sub-agents, skipping`,
				);
				continue;
			}

			const config = { name: frontmatter.name, description: frontmatter.description, subAgents };

			let workflowAgent: SequentialAgent | ParallelAgent | LoopAgent;
			if (type === "sequential") {
				workflowAgent = new SequentialAgent(config);
			} else if (type === "parallel") {
				workflowAgent = new ParallelAgent(config);
			} else {
				workflowAgent = new LoopAgent(config);
			}

			const tool = new AgentTool({ agent: workflowAgent });
			agentsByName.set(frontmatter.name, workflowAgent);
			toolsByName.set(frontmatter.name, tool);
		} catch (error) {
			Logger.warn(`skills_loader: failed to build workflow skill in ${skillDir}: ${error}`);
		}
	}

	const tools = Array.from(toolsByName.values());

	Logger.info(
		`skills_loader: loaded ${builtinFiles.length} builtin + ${extraFiles.length} extra skills (${tools.length} total)`,
	);

	return tools;
}
