import { describe, it } from "bdd";
import { expect } from "expect";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { ArticleService } from "application/articles/article_service.ts";
import { right } from "shared/either.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { createOrReplaceHandler, renderByFidHandler, renderHandler } from "./articles_handlers.ts";

function makeTenant(articleService: ArticleService): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 0 },
		configurationRepository: {} as AntboxTenant["configurationRepository"],
		nodeService: {} as AntboxTenant["nodeService"],
		aspectsService: {} as AntboxTenant["aspectsService"],
		featuresService: {} as AntboxTenant["featuresService"],
		apiKeysService: {} as AntboxTenant["apiKeysService"],
		groupsService: {} as AntboxTenant["groupsService"],
		usersService: {} as AntboxTenant["usersService"],
		articleService,
		auditLoggingService: {} as AntboxTenant["auditLoggingService"],
		workflowsService: {} as AntboxTenant["workflowsService"],
		workflowInstancesService: {} as AntboxTenant["workflowInstancesService"],
		agentsService: {} as AntboxTenant["agentsService"],
		notificationsService: {} as AntboxTenant["notificationsService"],
		userPreferencesService: {} as AntboxTenant["userPreferencesService"],
		externalLoginService: {} as AntboxTenant["externalLoginService"],
		metricsService: {} as AntboxTenant["metricsService"],
		featuresEngine: {} as AntboxTenant["featuresEngine"],
		agentsEngine: {} as AntboxTenant["agentsEngine"],
		workflowInstancesEngine: {} as AntboxTenant["workflowInstancesEngine"],
	};
}

describe("articles render handlers", () => {
	it("renders an article by UUID as HTML by default", async () => {
		let observed: { uuid: string; locale: string; format: string } | undefined;
		const articleService = {
			render: (
				_ctx: AuthenticationContext,
				uuid: string,
				locale: string,
				format: string,
			) => {
				observed = { uuid, locale, format };
				return Promise.resolve(right({
					content: "<h1>Olá</h1>",
					contentType: "text/html; charset=utf-8",
				}));
			},
		} as ArticleService;
		const request = new Request(
			"http://localhost/v2/articles/article-1/-/render?locale=pt",
			{ headers: { "x-params": JSON.stringify({ uuid: "article-1" }) } },
		);

		const response = await renderHandler([makeTenant(articleService)])(request);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(await response.text()).toBe("<h1>Olá</h1>");
		expect(observed).toEqual({ uuid: "article-1", locale: "pt", format: "html" });
	});

	it("renders an article by localized FID in the requested format", async () => {
		let observed: { fid: string; locale: string; format: string } | undefined;
		const articleService = {
			renderByFid: (
				_ctx: AuthenticationContext,
				fid: string,
				locale: string,
				format: string,
			) => {
				observed = { fid, locale, format };
				return Promise.resolve(right({
					content: "Olá",
					contentType: "text/plain; charset=utf-8",
				}));
			},
		} as ArticleService;
		const request = new Request(
			"http://localhost/v2/articles/-/fid/ola/render?locale=pt&format=text",
			{ headers: { "x-params": JSON.stringify({ fid: "ola" }) } },
		);

		const response = await renderByFidHandler([makeTenant(articleService)])(request);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(await response.text()).toBe("Olá");
		expect(observed).toEqual({ fid: "ola", locale: "pt", format: "text" });
	});
});

describe("article upload validation", () => {
	it("rejects invalid multipart bodies, string files, and non-object JSON", async () => {
		let calls = 0;
		const handler = createOrReplaceHandler([makeTenant({
			createOrReplace: () => {
				calls++;
				return Promise.resolve(right({ uuid: "article" }));
			},
		} as unknown as ArticleService)]);
		expect(
			(await handler(
				new Request("http://localhost/articles", {
					method: "POST",
					body: "{}",
					headers: { "Content-Type": "application/json" },
				}),
			)).status,
		).toBe(400);
		for (
			const contents of [
				undefined,
				"not a file",
				"{",
				"null",
				"[]",
				'"text"',
				"42",
				'{"uuid":42}',
			]
		) {
			const body = new FormData();
			if (contents === "not a file") body.set("file", contents);
			else if (contents !== undefined) body.set("file", new File([contents], "article.json"));
			expect(
				(await handler(new Request("http://localhost/articles", { method: "POST", body })))
					.status,
			).toBe(400);
		}
		expect(calls).toBe(0);
	});

	it("uses the file basename when a valid article omits its UUID", async () => {
		let observed: unknown;
		const handler = createOrReplaceHandler([makeTenant({
			createOrReplace: (_ctx, metadata) => {
				observed = metadata;
				return Promise.resolve(right(metadata));
			},
		} as ArticleService)]);
		const body = new FormData();
		body.set("file", new File(['{"title":"Hello"}'], "article.json"));
		expect(
			(await handler(new Request("http://localhost/articles", { method: "POST", body }))).status,
		).toBe(200);
		expect(observed).toEqual({ uuid: "article", title: "Hello" });
	});
});
