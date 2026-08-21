import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, Message, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime, SessionManager, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { AntboxError } from "shared/antbox_error.ts";
import type { LoadedSkill } from "./skills_loader.ts";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import type { ThinkingLevel } from "domain/ai/model_selection.ts";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface PiAgentSessionRunInput {
	readonly cwd: string;
	readonly model: Model<Api>;
	readonly thinkingLevel: ThinkingLevel;
	readonly systemPrompt: string;
	readonly tools: readonly AgentTool[];
	readonly skills: readonly LoadedSkill[];
	readonly sessionManager: SessionManager;
	readonly initialMessages?: readonly AgentMessage[];
	readonly userText: string;
}

export interface PiAgentSessionRunOutput {
	readonly messages: Message[];
}

export interface AgentSessionRunner {
	createPersistentManager(
		cwd: string,
		sessionDir: string,
		sessionId: string,
		metadata: unknown,
	): Promise<SessionManager>;
	openPersistentManager(path: string): Promise<SessionManager>;
	createInMemoryManager(cwd: string): Promise<SessionManager>;
	run(input: PiAgentSessionRunInput): Promise<PiAgentSessionRunOutput>;
}

export class PiAgentSessionRunner implements AgentSessionRunner {
	constructor(
		readonly modelRuntime: ModelRuntime,
		readonly timeoutMs = DEFAULT_TIMEOUT_MS,
	) {}

	async createPersistentManager(
		cwd: string,
		sessionDir: string,
		sessionId: string,
		metadata: unknown,
	): Promise<SessionManager> {
		const { SessionManager } = await loadPiCodingAgent();
		const manager = SessionManager.create(cwd, sessionDir, { id: sessionId });
		manager.appendCustomEntry("antbox.session", metadata);
		return manager;
	}

	async openPersistentManager(path: string): Promise<SessionManager> {
		const { SessionManager } = await loadPiCodingAgent();
		return SessionManager.open(path);
	}

	async createInMemoryManager(cwd: string): Promise<SessionManager> {
		const { SessionManager } = await loadPiCodingAgent();
		return SessionManager.inMemory(cwd);
	}

	async run(input: PiAgentSessionRunInput): Promise<PiAgentSessionRunOutput> {
		const pi = await loadPiCodingAgent();
		const resourceLoader = new pi.DefaultResourceLoader({
			cwd: input.cwd,
			agentDir: input.cwd,
			noExtensions: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPrompt: buildSystemPrompt(input.systemPrompt, input.skills),
			skillsOverride: () => ({
				skills: input.skills.map((skill) => ({
					name: skill.frontmatter.name,
					description: skill.frontmatter.description,
					filePath: skill.skillFile,
					baseDir: skill.skillDir,
					sourceInfo: {
						path: skill.skillFile,
						source: "antbox",
						scope: "temporary" as const,
						origin: "top-level" as const,
						baseDir: skill.skillDir,
					},
					disableModelInvocation: false,
				})),
				diagnostics: [],
			}),
		});
		await resourceLoader.reload();
		const settingsManager = pi.SettingsManager.inMemory({
			compaction: { enabled: false },
			retry: { enabled: false },
		});
		const toolNames = input.tools.map((tool) => tool.name);
		const created = await pi.createAgentSession({
			cwd: input.cwd,
			agentDir: input.cwd,
			model: input.model,
			thinkingLevel: input.thinkingLevel,
			modelRuntime: this.modelRuntime,
			resourceLoader,
			settingsManager,
			sessionManager: input.sessionManager,
			noTools: "builtin",
			tools: toolNames,
			customTools: input.tools as unknown as ToolDefinition[],
		});
		const { session } = created;
		if (input.initialMessages) session.agent.state.messages = [...input.initialMessages];
		const initialMessageCount = session.agent.state.messages.length;
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			void session.abort();
		}, this.timeoutMs);
		try {
			await session.prompt(input.userText);
			if (timedOut) throw timeoutError();
			if (session.agent.state.errorMessage) throw new Error(session.agent.state.errorMessage);
			const messages = session.agent.state.messages.slice(initialMessageCount + 1) as Message[];
			const final = messages.at(-1);
			if (
				final?.role !== "assistant" || final.stopReason === "error" ||
				final.stopReason === "aborted"
			) {
				throw new AntboxError("IncompleteAgentRun", "Pi session ended without a final answer");
			}
			return { messages };
		} catch (error) {
			if (timedOut) throw timeoutError();
			throw error;
		} finally {
			clearTimeout(timeout);
			try {
				await secureSessionFile(input.sessionManager);
			} finally {
				session.dispose();
			}
		}
	}
}

async function secureSessionFile(manager: SessionManager): Promise<void> {
	const path = manager.getSessionFile();
	if (!path) return;
	try {
		await Deno.chmod(path, 0o600);
	} catch (error) {
		if (
			!(error instanceof Deno.errors.NotFound) && !(error instanceof Deno.errors.NotSupported)
		) {
			throw error;
		}
	}
}

function buildSystemPrompt(systemPrompt: string, skills: readonly LoadedSkill[]): string {
	if (skills.length === 0) return systemPrompt;
	const entries = skills.map((skill) =>
		[
			"  <skill>",
			`    <name>${escapeXml(skill.frontmatter.name)}</name>`,
			`    <description>${escapeXml(skill.frontmatter.description)}</description>`,
			`    <location>${escapeXml(skill.skillFile)}</location>`,
			"  </skill>",
		].join("\n")
	);
	return [
		systemPrompt,
		"",
		"The following skills provide specialized instructions for specific tasks.",
		"Use the load_skill tool when a task matches a skill description.",
		"<available_skills>",
		...entries,
		"</available_skills>",
	].join("\n");
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function timeoutError(): AntboxError {
	return new AntboxError("AgentTimeout", "Agent execution exceeded five minutes");
}
