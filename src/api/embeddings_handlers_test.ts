import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getEmbeddingsStatusHandler, reindexEmbeddingsHandler } from "./embeddings_handlers.ts";
import { left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Groups } from "domain/users_groups/groups.ts";

interface ReindexCall {
	mode: string;
	tenant: string;
	actor: string;
}

function makeTenant(ragService: unknown): AntboxTenant {
	return {
		name: "acme",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 1 },
		configurationRepository: {} as AntboxTenant["configurationRepository"],
		nodeService: {} as AntboxTenant["nodeService"],
		aspectsService: {} as AntboxTenant["aspectsService"],
		featuresService: {} as AntboxTenant["featuresService"],
		apiKeysService: {
			getApiKeyBySecret: async (secret: string) =>
				secret === "admin" || secret === "member"
					? right({ group: secret === "admin" ? Groups.ADMINS_GROUP_UUID : "staff" })
					: left(new Error("Invalid API key")),
		} as unknown as AntboxTenant["apiKeysService"],
		groupsService: {} as AntboxTenant["groupsService"],
		usersService: {} as AntboxTenant["usersService"],
		articleService: {} as AntboxTenant["articleService"],
		auditLoggingService: {} as AntboxTenant["auditLoggingService"],
		workflowsService: {} as AntboxTenant["workflowsService"],
		workflowInstancesService: {} as AntboxTenant["workflowInstancesService"],
		agentsService: {} as AntboxTenant["agentsService"],
		notificationsService: {} as AntboxTenant["notificationsService"],
		userPreferencesService: {} as AntboxTenant["userPreferencesService"],
		externalLoginService: {} as AntboxTenant["externalLoginService"],
		ragService: ragService as AntboxTenant["ragService"],
		metricsService: {} as AntboxTenant["metricsService"],
		featuresEngine: {} as AntboxTenant["featuresEngine"],
		agentsEngine: {} as AntboxTenant["agentsEngine"],
		workflowInstancesEngine: {} as AntboxTenant["workflowInstancesEngine"],
	};
}

function stubRag(result = right<AntboxError, { mode: string; queued: number }>({
	mode: "missing",
	queued: 0,
})) {
	const calls: ReindexCall[] = [];
	return {
		calls,
		reindex: (request: ReindexCall) => {
			calls.push(request);
			return Promise.resolve(
				result.isRight() ? right({ ...result.value, mode: request.mode }) : result,
			);
		},
		status: () =>
			Promise.resolve(right({
				enabled: true,
				counts: { indexed: 4, failed: 1, skipped: 2, pending: 3 },
				job: null,
				failures: [{ uuid: "n1", error: "ocr: boom", at: "2026-11-07T10:00:00.000Z" }],
			})),
	};
}

function post(body: string | undefined, key = "admin"): Request {
	return new Request("http://localhost/v2/nodes/-/embeddings/reindex", {
		method: "POST",
		headers: { Authorization: `ApiKey ${key}`, "Content-Type": "application/json" },
		body,
	});
}

function get(key = "admin"): Request {
	return new Request("http://localhost/v2/nodes/-/embeddings/status", {
		headers: { Authorization: `ApiKey ${key}` },
	});
}

describe("reindexEmbeddingsHandler", () => {
	it("starts a reindex with the requested mode and answers 202", async () => {
		const rag = stubRag(right({ mode: "all", queued: 3 }));
		const response = await reindexEmbeddingsHandler([makeTenant(rag)])(
			post(JSON.stringify({ mode: "all" })),
		);

		expect(response.status).toBe(202);
		await expect(response.json()).resolves.toEqual({ mode: "all", queued: 3 });
		expect(rag.calls).toHaveLength(1);
		expect(rag.calls[0].mode).toBe("all");
		expect(rag.calls[0].tenant).toBe("acme");
	});

	it("defaults to missing when the body is empty", async () => {
		const rag = stubRag();
		const response = await reindexEmbeddingsHandler([makeTenant(rag)])(post(undefined));

		expect(response.status).toBe(202);
		expect(rag.calls[0].mode).toBe("missing");
	});

	it("rejects an unknown mode", async () => {
		const rag = stubRag();
		const response = await reindexEmbeddingsHandler([makeTenant(rag)])(
			post(JSON.stringify({ mode: "everything" })),
		);

		expect(response.status).toBe(400);
		expect(rag.calls).toHaveLength(0);
	});

	it("answers 409 while another reindex is running", async () => {
		const rag = stubRag(left(new AntboxError("ReindexInProgress", "A reindex is running")));
		const response = await reindexEmbeddingsHandler([makeTenant(rag)])(post("{}"));

		expect(response.status).toBe(409);
	});

	it("answers 400 when semantic search is not enabled for the tenant", async () => {
		const response = await reindexEmbeddingsHandler([makeTenant(undefined)])(post("{}"));

		expect(response.status).toBe(400);
	});

	it("rejects non-admins before calling the service", async () => {
		const rag = stubRag();
		for (const key of ["member", "invalid"]) {
			const response = await reindexEmbeddingsHandler([makeTenant(rag)])(post("{}", key));
			expect(response.status).toBe(403);
		}
		expect(rag.calls).toHaveLength(0);
	});
});

describe("getEmbeddingsStatusHandler", () => {
	it("returns counts, job and failures", async () => {
		const response = await getEmbeddingsStatusHandler([makeTenant(stubRag())])(get());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			enabled: true,
			counts: { indexed: 4, failed: 1, skipped: 2, pending: 3 },
			job: null,
			failures: [{ uuid: "n1", error: "ocr: boom", at: "2026-11-07T10:00:00.000Z" }],
		});
	});

	it("reports disabled when semantic search is not enabled", async () => {
		const response = await getEmbeddingsStatusHandler([makeTenant(undefined)])(get());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ enabled: false });
	});

	it("rejects non-admins", async () => {
		const response = await getEmbeddingsStatusHandler([makeTenant(stubRag())])(get("member"));
		expect(response.status).toBe(403);
	});
});
