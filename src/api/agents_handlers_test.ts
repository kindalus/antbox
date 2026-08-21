import { describe, it } from "bdd";
import { expect } from "expect";
import { SignJWT } from "jose";
import { left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import type { IAgentsEngine } from "application/ai/agents_engine_interface.ts";
import {
	continueAgentSessionHandler,
	createAgentSessionHandler,
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
