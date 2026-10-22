import { describe, it } from "bdd";
import { expect } from "expect";
import { SignJWT } from "jose";
import { left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import type { IAgentsEngine } from "application/ai/agents_engine_interface.ts";
import {
	answerHandler,
	chatHandler,
	continueAgentSessionHandler,
	createAgentSessionHandler,
	createOrReplaceAgentHandler,
	deleteAgentSessionHandler,
} from "./agents_handlers.ts";

const KEY = "agents-handler-test-key";
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";

function tenant(engine: Partial<IAgentsEngine>): AntboxTenant {
	return {
		name: "default",
		isAdminTenant: true,
		rootPasswd: "demo",
		symmetricKey: KEY,
		agentsEngine: engine,
		apiKeysService: {},
		externalLoginService: {},
	} as unknown as AntboxTenant;
}

async function request(
	method: string,
	params: Record<string, string>,
	body?: unknown,
): Promise<Request> {
	const token = await new SignJWT({})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setIssuer("urn:antbox")
		.setAudience("default")
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode(KEY));
	return new Request("http://localhost/v2/agents/test-agent/-/sessions", {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"X-Tenant": "default",
			"x-params": JSON.stringify(params),
		},
	});
}

function sessionResult(text: string) {
	return {
		sessionId: SESSION_ID,
		expiresAt: Date.now() + 1000,
		message: { role: "model" as const, parts: [{ text }] },
	};
}

describe("agent session handlers", () => {
	it("creates a persisted session with its first message", async () => {
		const handler = createAgentSessionHandler([tenant({
			createChatSession: (_ctx, uuid, text) => {
				expect(uuid).toBe("test-agent");
				expect(text).toBe("hello");
				return Promise.resolve(right(sessionResult("created")));
			},
		})]);
		const response = await handler(
			await request(
				"POST",
				{ uuid: "test-agent" },
				{ text: "hello" },
			),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).sessionId).toBe(SESSION_ID);
	});

	it("continues a persisted session", async () => {
		const handler = continueAgentSessionHandler([tenant({
			continueChatSession: (_ctx, uuid, sessionId, text) => {
				expect([uuid, sessionId, text]).toEqual(["test-agent", SESSION_ID, "next"]);
				return Promise.resolve(right(sessionResult("continued")));
			},
		})]);
		const response = await handler(
			await request(
				"POST",
				{ uuid: "test-agent", sessionId: SESSION_ID },
				{ text: "next" },
			),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).message.parts[0].text).toBe("continued");
	});

	it("does not reveal expired sessions", async () => {
		const handler = continueAgentSessionHandler([tenant({
			continueChatSession: () =>
				Promise.resolve(left(new AntboxError("SessionExpired", "Session expired"))),
		})]);
		const response = await handler(
			await request(
				"POST",
				{ uuid: "test-agent", sessionId: SESSION_ID },
				{ text: "next" },
			),
		);
		expect(response.status).toBe(404);
	});

	it("deletes a persisted session idempotently", async () => {
		const handler = deleteAgentSessionHandler([tenant({
			deleteChatSession: (_ctx, uuid, sessionId) => {
				expect([uuid, sessionId]).toEqual(["test-agent", SESSION_ID]);
				return Promise.resolve(right(undefined));
			},
		})]);
		const response = await handler(
			await request(
				"DELETE",
				{ uuid: "test-agent", sessionId: SESSION_ID },
			),
		);
		expect(response.status).toBe(200);
	});
});

describe("agent request validation", () => {
	it("passes valid agent metadata to the configuration service", async () => {
		let observed: unknown;
		const target = {
			name: "default",
			agentsService: {
				createOrReplaceAgent: (_ctx: unknown, metadata: unknown) => {
					observed = metadata;
					return Promise.resolve(right({ created: true, agent: metadata }));
				},
			},
		} as unknown as AntboxTenant;
		for (
			const metadata of [
				{ name: "Support", uuid: 42 },
				{ name: "Support", systemPrompt: {} },
				{ name: "Support", tools: "all" },
			]
		) {
			expect(
				(await createOrReplaceAgentHandler([target])(
					new Request("http://localhost/agents", {
						method: "POST",
						body: JSON.stringify(metadata),
						headers: { "Content-Type": "application/json" },
					}),
				)).status,
			).toBe(400);
		}
		expect(observed).toBeUndefined();
		const response = await createOrReplaceAgentHandler([target])(
			new Request("http://localhost/agents", {
				method: "POST",
				body: JSON.stringify({ name: "Support", exposedToUsers: false, systemPrompt: "" }),
				headers: { "Content-Type": "application/json" },
			}),
		);
		expect(response.status).toBe(201);
		expect(observed).toEqual({ name: "Support", exposedToUsers: false, systemPrompt: "" });
	});

	it("rejects malformed and non-object JSON before invoking AI services", async () => {
		let calls = 0;
		const call = () => {
			calls++;
			return Promise.resolve(right({}));
		};
		const target = {
			name: "default",
			agentsService: { createOrReplaceAgent: call },
			agentsEngine: {
				chat: call,
				answer: call,
				createChatSession: call,
				continueChatSession: call,
			},
		} as unknown as AntboxTenant;
		for (
			const factory of [
				createOrReplaceAgentHandler,
				chatHandler,
				answerHandler,
				createAgentSessionHandler,
				continueAgentSessionHandler,
			]
		) {
			for (const body of ["{", "null", "[]", '"text"', "42"]) {
				expect(
					(await factory([target])(
						new Request("http://localhost/agents", {
							method: "POST",
							body,
							headers: {
								"Content-Type": "application/json",
								"x-params": JSON.stringify({ uuid: "test-agent", sessionId: SESSION_ID }),
							},
						}),
					)).status,
				).toBe(400);
			}
		}
		expect(calls).toBe(0);
	});

	it("rejects invalid prompts, options and chat history before model execution", async () => {
		let calls = 0;
		const call = () => {
			calls++;
			return Promise.resolve(right<AntboxError, []>([]));
		};
		const target = tenant({
			chat: call,
			answer: () => {
				calls++;
				return Promise.resolve(right({ role: "model", parts: [] }));
			},
		});
		for (const factory of [chatHandler, answerHandler]) {
			for (
				const input of [
					{ text: 42 },
					{ text: {} },
					{ text: " \n " },
					{ text: "hello", options: null },
					{ text: "hello", options: [] },
					{ text: "hello", options: { instructions: {} } },
				]
			) {
				expect(
					(await factory([target])(await request("POST", { uuid: "test-agent" }, input)))
						.status,
				).toBe(400);
			}
		}
		for (
			const history of [
				"text",
				[null],
				[{ role: "model" }],
				[{ role: "model", parts: [null] }],
				[{ role: "user", parts: [{ text: {} }] }],
			]
		) {
			expect(
				(await chatHandler([target])(
					await request("POST", { uuid: "test-agent" }, {
						text: "hello",
						options: { history },
					}),
				)).status,
			).toBe(400);
		}
		expect(calls).toBe(0);
	});

	it("preserves prompt content and valid history and instructions", async () => {
		const history = [{ role: "user" as const, parts: [{ text: "previous" }] }];
		const target = tenant({
			chat: (_ctx, uuid, text, options) => {
				expect(uuid).toBe("test-agent");
				expect(text).toBe("  hello  ");
				expect(options).toEqual({ history, instructions: "Be concise" });
				return Promise.resolve(right([]));
			},
			answer: (_ctx, _uuid, text, options) => {
				expect(text).toBe("hello");
				expect(options).toEqual({ instructions: "Be concise" });
				return Promise.resolve(right({ role: "model", parts: [{ text: "answer" }] }));
			},
		});
		expect(
			(await chatHandler([target])(
				await request("POST", { uuid: "test-agent" }, {
					text: "  hello  ",
					options: { history, instructions: "Be concise" },
				}),
			)).status,
		).toBe(200);
		expect(
			(await answerHandler([target])(
				await request("POST", { uuid: "test-agent" }, {
					text: "hello",
					options: { instructions: "Be concise" },
				}),
			)).status,
		).toBe(200);
	});
});
