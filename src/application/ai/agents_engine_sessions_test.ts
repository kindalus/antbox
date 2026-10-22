import { describe, it } from "bdd";
import { expect } from "expect";
import {
	fauxAssistantMessage,
	fauxProvider,
	InMemoryCredentialStore,
	InMemoryModelsStore,
} from "@earendil-works/pi-ai";
import { left, right } from "shared/either.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { AgentsEngine, type AgentsEngineContext } from "./agents_engine.ts";
import { PiAgentSessionRunner } from "./pi_agent_session.ts";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import { SessionWorkspaceStore } from "./session_workspace.ts";
import type { AgentModelRuntime } from "./resolve_model.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { AgentsService } from "./agents_service.ts";
import type { FeaturesService } from "application/features/features_service.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { AspectsService } from "application/aspects/aspects_service.ts";
import { Users } from "domain/users_groups/users.ts";

const pi = await loadPiCodingAgent();

const authContext: AuthenticationContext = {
	tenant: "tenant-a",
	mode: "Direct",
	principal: { email: "user@example.com", groups: [] },
};

const agent: AgentData = {
	uuid: "session-agent",
	name: "Session agent",
	exposedToUsers: true,
	model: ["default"],
	tools: false,
	systemPrompt: "Remember the conversation.",
	createdTime: "2026-01-01T00:00:00.000Z",
	modifiedTime: "2026-01-01T00:00:00.000Z",
};

async function buildContext(
	root: string,
	options: {
		agent?: Partial<AgentData>;
		featureState?: { current: FeatureData };
	} = {},
) {
	const faux = fauxProvider({ provider: "session-test" });
	faux.setResponses([
		fauxAssistantMessage("first-answer"),
		(context) => {
			expect(
				context.messages.some((message) =>
					message.role === "assistant" &&
					message.content.some((part) => part.type === "text" && part.text === "first-answer")
				),
			).toBe(true);
			return fauxAssistantMessage("second-answer");
		},
	]);
	const modelSelection = [`session-test/${faux.getModel().id}`] as const;
	const sessionAgent: AgentData = { ...agent, model: modelSelection, ...options.agent };
	const codingRuntime = await pi.ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		modelsStore: new InMemoryModelsStore(),
		refreshOnCreate: false,
	});
	codingRuntime.registerNativeProvider(faux.provider);
	const modelRuntime: AgentModelRuntime = {
		codingRuntime,
		streamFn: (model, context, options) => codingRuntime.streamSimple(model, context, options),
		resolveModel: (name) => {
			const [provider, id] = name.split("/", 2);
			const model = codingRuntime.getModel(provider, id);
			if (!model) throw new Error(`Unknown model ${name}`);
			return model;
		},
		listModels: (provider) => codingRuntime.getModels(provider),
		getApiKey: async (provider) => (await codingRuntime.getAuth(provider))?.auth.apiKey,
		isConfigured: async () => true,
	};
	const context: AgentsEngineContext = {
		agentsService: {
			getAgent: () => Promise.resolve(right(sessionAgent)),
		} as unknown as AgentsService,
		featuresService: {
			listAITools: () =>
				Promise.resolve(right(options.featureState ? [options.featureState.current] : [])),
		} as unknown as FeaturesService,
		nodeService: {} as NodeService,
		aspectsService: {} as AspectsService,
		defaultModel: modelSelection,
		skills: [],
		eventBus: new InMemoryEventBus(),
		modelRuntime,
		sessionRunner: new PiAgentSessionRunner(codingRuntime, 5_000),
		sessionWorkspace: new SessionWorkspaceStore(root),
	};
	return { context, faux };
}

describe("AgentsEngine persisted sessions", () => {
	it("checks the token limit again when a queued continuation starts", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-session-token-check-test-" });
		try {
			const { context, faux } = await buildContext(root);
			faux.setResponses([
				fauxAssistantMessage("first-answer"),
				fauxAssistantMessage("second-answer"),
				fauxAssistantMessage("third-answer"),
			]);
			let completed = 0;
			const engine = new AgentsEngine({
				...context,
				eventBus: {
					publish(event) {
						if (event instanceof AgentInteractionCompletedEvent) completed++;
					},
					subscribe() {},
					unsubscribe() {},
				},
				tenantLimitsGuard: {
					ensureCanCreateFile: () => Promise.resolve(right(undefined)),
					ensureCanUpdateFile: () => Promise.resolve(right(undefined)),
					ensureCanRunAgent: () =>
						Promise.resolve(
							completed < 2
								? right(undefined)
								: left(new ForbiddenError("Token limit reached")),
						),
				},
			});
			const created = await engine.createChatSession(authContext, agent.uuid, "first-question");
			if (created.isLeft()) throw created.value;
			const results = await Promise.all([
				engine.continueChatSession(
					authContext,
					agent.uuid,
					created.value.sessionId,
					"second-question",
				),
				engine.continueChatSession(
					authContext,
					agent.uuid,
					created.value.sessionId,
					"third-question",
				),
			]);
			expect(results[0].isRight()).toBe(true);
			expect(results[1].isLeft()).toBe(true);
			if (results[1].isLeft()) expect(results[1].value.errorCode).toBe("ForbiddenError");
			expect(faux.state.callCount).toBe(2);
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});

	it("keeps sessions private to the API key that created them", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-session-key-owner-test-" });
		try {
			const { context, faux } = await buildContext(root);
			const engine = new AgentsEngine(context);
			const firstKey = {
				...authContext,
				principal: {
					email: Users.API_KEY_USER_EMAIL,
					groups: ["editors"],
					apiKeyUuid: "firstkey",
				},
			};
			const otherKey = {
				...authContext,
				principal: {
					email: Users.API_KEY_USER_EMAIL,
					groups: ["readers"],
					apiKeyUuid: "otherkey",
				},
			};
			const created = await engine.createChatSession(firstKey, agent.uuid, "first-question");
			if (created.isLeft()) throw created.value;
			const continued = await engine.continueChatSession(
				otherKey,
				agent.uuid,
				created.value.sessionId,
				"read previous conversation",
			);
			expect(continued.isLeft()).toBe(true);
			const sameGroup = {
				...otherKey,
				principal: { ...otherKey.principal, groups: ["editors"] },
			};
			expect(
				(await engine.continueChatSession(
					sameGroup,
					agent.uuid,
					created.value.sessionId,
					"read previous conversation",
				)).isLeft(),
			).toBe(true);
			expect(faux.state.callCount).toBe(1);
			await engine.deleteChatSession(otherKey, agent.uuid, created.value.sessionId);
			expect((await Deno.stat(`${root}/${created.value.sessionId}`)).isDirectory).toBe(true);
			const owned = await engine.continueChatSession(
				firstKey,
				agent.uuid,
				created.value.sessionId,
				"second-question",
			);
			if (owned.isLeft()) throw owned.value;
			expect(owned.value.message.parts[0].text).toBe("second-answer");
			await engine.deleteChatSession(firstKey, agent.uuid, created.value.sessionId);
			await expect(Deno.stat(`${root}/${created.value.sessionId}`)).rejects.toThrow();
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});

	it("rejects anonymous persisted sessions before creating or reading any workspace", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-session-anonymous-test-" });
		try {
			const { context, faux } = await buildContext(root);
			const engine = new AgentsEngine(context);
			for (
				const principal of [
					{ email: Users.ANONYMOUS_USER_EMAIL, groups: [] },
					{ email: Users.API_KEY_USER_EMAIL, groups: [] },
				]
			) {
				const caller = { ...authContext, principal };
				const results = await Promise.all([
					engine.createChatSession(caller, agent.uuid, "hello"),
					engine.continueChatSession(caller, agent.uuid, crypto.randomUUID(), "hello"),
					engine.deleteChatSession(caller, agent.uuid, crypto.randomUUID()),
				]);
				for (const result of results) {
					expect(result.isLeft()).toBe(true);
					if (result.isLeft()) expect(result.value.errorCode).toBe("UnauthorizedError");
				}
			}
			expect(faux.state.callCount).toBe(0);
			expect([...Deno.readDirSync(root)]).toHaveLength(0);
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});

	it("continues from Pi JSONL after rebuilding the engine", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-engine-session-test-" });
		try {
			const { context, faux } = await buildContext(root);
			const firstEngine = new AgentsEngine(context);
			const created = await firstEngine.createChatSession(
				authContext,
				agent.uuid,
				"first-question",
			);
			if (created.isLeft()) throw created.value;
			expect(created.isRight()).toBe(true);
			expect(created.value.message.parts[0].text).toBe("first-answer");

			const secondEngine = new AgentsEngine(context);
			const continued = await secondEngine.continueChatSession(
				authContext,
				agent.uuid,
				created.value.sessionId,
				"second-question",
			);
			if (continued.isLeft()) throw continued.value;
			expect(continued.isRight()).toBe(true);
			expect(continued.value.message.parts[0].text).toBe("second-answer");
			expect(faux.state.callCount).toBe(2);

			const deleted = await secondEngine.deleteChatSession(
				authContext,
				agent.uuid,
				created.value.sessionId,
			);
			expect(deleted.isRight()).toBe(true);
			await expect(Deno.stat(`${root}/${created.value.sessionId}`)).rejects.toThrow();
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});

	it("rejects a session when a sealed feature tool changes", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-engine-stale-session-test-" });
		const feature: FeatureData = {
			uuid: "lookupRecords",
			title: "Lookup records",
			description: "Lookup records",
			exposeAction: false,
			runOnCreates: false,
			runOnUpdates: false,
			runOnDeletes: false,
			runOnEmbeddingsCreated: false,
			runOnEmbeddingsUpdated: false,
			runManually: false,
			filters: [],
			exposeExtension: false,
			exposeAITool: true,
			groupsAllowed: [],
			parameters: [],
			returnType: "string",
			run: "export default () => 'ok'",
			createdTime: "2026-01-01T00:00:00.000Z",
			modifiedTime: "2026-01-01T00:00:00.000Z",
		};
		const featureState = { current: feature };
		try {
			const { context } = await buildContext(root, {
				agent: { tools: true },
				featureState,
			});
			const engine = new AgentsEngine(context);
			const created = await engine.createChatSession(authContext, agent.uuid, "first");
			if (created.isLeft()) throw created.value;
			featureState.current = { ...feature, modifiedTime: "2026-01-02T00:00:00.000Z" };

			const continued = await engine.continueChatSession(
				authContext,
				agent.uuid,
				created.value.sessionId,
				"second",
			);
			expect(continued.isLeft()).toBe(true);
			if (continued.isLeft()) expect(continued.value.errorCode).toBe("StaleSession");
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});
});
