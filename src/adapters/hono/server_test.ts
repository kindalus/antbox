import { describe, it } from "bdd";
import { expect } from "expect";
import { SERVER_HEADER_VALUE } from "shared/app_metadata.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { MCP_PROTOCOL_VERSION } from "adapters/mcp/mcp_server.ts";
import { Hono } from "hono";
import { right } from "shared/either.ts";
import { adapt } from "./adapt.ts";
import setupHonoServer, { createFetch, matchPath, withServerHeader } from "./server.ts";

function fakeTenant(seen: { uuid?: string; method?: string } = {}): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 0 },
		nodeService: {
			list: () => Promise.resolve(right([])),
			get: (_ctx: unknown, uuid: string) => {
				seen.uuid = uuid;
				return Promise.resolve(right({ uuid }));
			},
		},
	} as unknown as AntboxTenant;
}

function serve(tenant: AntboxTenant = fakeTenant()) {
	const fetch = createFetch([tenant], async () => {});
	return (path: string, init?: RequestInit) => fetch(new Request(`http://localhost${path}`, init));
}

describe("hono server", () => {
	it("adds the canonical Server header to HTTP responses", () => {
		const response = withServerHeader(
			new Response("x", { headers: { "Content-Type": "text/plain" } }),
		);

		expect(response.headers.get("Server")).toBe(SERVER_HEADER_VALUE);
		expect(response.headers.get("Content-Type")).toBe("text/plain");
	});

	it("adds the Server header to immutable responses", () => {
		const immutable = Response.redirect("http://localhost/x", 302);

		expect(withServerHeader(immutable).headers.get("Server")).toBe(SERVER_HEADER_VALUE);
	});

	it("adds the Server header to 200, 404 and 405 responses", async () => {
		const request = serve();

		for (
			const [path, init, status] of [
				["/v2/heartbeat", undefined, 200],
				["/nope", undefined, 404],
				["/v2/heartbeat", { method: "DELETE" }, 405],
			] as const
		) {
			const response = await request(path, init);
			expect(response.status).toBe(status);
			expect(response.headers.get("Server")).toBe(SERVER_HEADER_VALUE);
		}
	});

	it("answers unknown paths with an empty 404", async () => {
		for (const path of ["/nope", "/v2/nope", "/v2/nodes/a/b/c/d/e"]) {
			const response = await serve()(path);
			expect(response.status).toBe(404);
			expect(await response.text()).toBe("");
			expect(response.headers.get("Allow")).toBeNull();
		}
	});

	it("answers 405 with an Allow header for a known path and an unsupported method", async () => {
		const request = serve();

		const collection = await request("/v2/nodes", { method: "DELETE" });
		expect(collection.status).toBe(405);
		expect(collection.headers.get("Allow")).toBe("HEAD, GET, POST");

		const item = await request("/v2/nodes/abc", { method: "PUT" });
		expect(item.status).toBe(405);
		expect(item.headers.get("Allow")).toBe("HEAD, GET, PATCH, DELETE");

		const mcp = await request("/mcp", { method: "GET" });
		expect(mcp.status).toBe(405);
		expect(mcp.headers.get("Allow")).toBe("POST");
	});

	it("answers OPTIONS on a known path with 200 and Allow, and on unknown paths with 404", async () => {
		const request = serve();

		const known = await request("/v2/nodes", { method: "OPTIONS" });
		expect(known.status).toBe(200);
		expect(known.headers.get("Allow")).toBe("HEAD, GET, POST");

		expect((await request("/nope", { method: "OPTIONS" })).status).toBe(404);
	});

	it("answers 501 with Allow for methods the server does not know", async () => {
		// Bun turns tokens it does not recognise, such as FOO, into GET before the handler sees them
		const response = await serve()("/v2/nodes", { method: "TRACE" });

		expect(response.status).toBe(501);
		expect(response.headers.get("Allow")).toBe("HEAD, GET, POST");
	});

	it("serves HEAD on GET routes and keeps the HEAD method inside the handler", async () => {
		const response = await serve()("/v2/heartbeat", { method: "HEAD" });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");

		let observed: string | undefined;
		const app = new Hono();
		app.get(
			"/probe",
			adapt((req) => {
				observed = req.method;
				return Promise.resolve(new Response("body"));
			}),
		);
		expect((await app.fetch(new Request("http://localhost/probe", { method: "HEAD" }))).status)
			.toBe(200);
		expect(observed).toBe("HEAD");
	});

	it("matches paths case-insensitively and without regard to a trailing slash", async () => {
		const request = serve();

		for (
			const path of [
				"/v2/nodes",
				"/V2/NODES",
				"/v2/nodes/",
				"/v2/nodes?x=1",
				"/V2/Heartbeat/",
				"/V2/Heartbeat?x=1",
			]
		) {
			expect([path, (await request(path)).status]).toEqual([path, 200]);
		}
	});

	it("passes route parameters decoded and with their original case", async () => {
		const seen: { uuid?: string } = {};
		const request = serve(fakeTenant(seen));

		for (
			const [path, expected] of [
				["/v2/nodes/AbC", "AbC"],
				["/V2/NODES/AbC/", "AbC"],
				["/v2/nodes/a%20b", "a b"],
				["/v2/nodes/--fid--Report", "--fid--Report"],
				["/v2/nodes/100%25", "100%"],
				["/v2/nodes/%E0%A4%A", "%E0%A4%A"],
			] as const
		) {
			const response = await request(path);
			expect(response.status).toBe(200);
			expect(seen.uuid).toBe(expected);
		}
	});

	it("keeps static routes ahead of parameterised ones", async () => {
		const seen: { uuid?: string } = {};
		const request = serve(fakeTenant(seen));

		const find = await request("/v2/nodes/-/find", { method: "POST", body: "{}" });
		expect(find.status).not.toBe(404);
		expect(find.status).not.toBe(405);
		expect(seen.uuid).toBeUndefined();

		const upload = await request("/v2/nodes/-/upload", { method: "POST" });
		expect(upload.status).not.toBe(404);
		expect(upload.status).not.toBe(405);
		expect(seen.uuid).toBeUndefined();

		expect((await request("/v2/nodes/-/find")).status).toBe(405);
	});

	it("serves the v2 prefix, openapi.yaml, /mcp and /webdav mounts", async () => {
		const request = serve();

		expect((await request("/heartbeat")).status).toBe(404);
		expect((await request("/v2/heartbeat")).status).toBe(200);
		expect((await request("/openapi.yaml")).status).toBe(200);
		expect((await request("/mcp", { method: "POST", body: "{}" })).status).not.toBe(404);
		expect((await request("/webdav/default/", { method: "PROPFIND" })).status).not.toBe(404);
	});

	it("routes every WebDAV verb to the WebDAV handler with a raw body", async () => {
		const request = serve();

		for (
			const method of [
				"OPTIONS",
				"PROPFIND",
				"GET",
				"HEAD",
				"PUT",
				"DELETE",
				"MKCOL",
				"COPY",
				"MOVE",
				"LOCK",
				"UNLOCK",
			]
		) {
			const response = await request("/webdav/unknown-tenant/file.txt", { method });
			// The WebDAV handler rejects the unknown tenant itself; the router must not answer.
			expect([method, response.status, response.headers.get("Allow")]).toEqual([
				method,
				400,
				null,
			]);
		}

		for (const method of ["PROPPATCH", "POST", "PATCH"]) {
			const response = await request("/webdav/unknown-tenant/file.txt", { method });
			expect(response.status).toBe(405);
			expect(response.headers.get("Allow")).toContain("PROPFIND");
		}
	});

	it("hands the unread request body stream to the handler", async () => {
		let body: ReadableStream<Uint8Array> | null = null;
		const app = new Hono();
		app.put(
			"/upload",
			adapt((req) => {
				body = req.body;
				return Promise.resolve(new Response(null, { status: 204 }));
			}),
		);

		const response = await app.fetch(
			new Request("http://localhost/upload", { method: "PUT", body: "payload" }),
		);

		expect(response.status).toBe(204);
		expect(body).not.toBeNull();
		expect(await new Response(body).text()).toBe("payload");
	});

	it("returns the handler response untouched, including streaming bodies", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("chunk"));
				controller.close();
			},
		});
		const original = new Response(stream, { status: 207, headers: { "X-Custom": "1" } });
		const app = new Hono();
		app.get("/stream", adapt(() => Promise.resolve(original)));

		const response = await app.fetch(new Request("http://localhost/stream"));

		expect(response.status).toBe(207);
		expect(response.headers.get("X-Custom")).toBe("1");
		expect(await response.text()).toBe("chunk");
	});

	it("matches paths on their lowercase form without the query or trailing slash", () => {
		expect(matchPath(new Request("http://h:1/V2/Nodes/?a=B"))).toBe("/v2/nodes");
		expect(matchPath(new Request("http://h:1"))).toBe("/");
	});

	it("wires loaded MCP options into the live Hono handler", async () => {
		const tenants = [{ name: "default" }] as unknown as AntboxTenant[];
		const start = setupHonoServer(tenants, async () => {}, undefined, undefined, {
			allowedOrigins: ["https://app.example"],
			maxRequestBodyBytes: 1024,
		});
		const abortController = new AbortController();
		const requestHeaders = {
			"Content-Type": "application/json",
			"Accept": "application/json, text/event-stream",
			"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
			"Mcp-Method": "server/discover",
			"Origin": "https://app.example",
		};
		const meta = {
			"io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
			"io.modelcontextprotocol/clientCapabilities": {},
		};

		try {
			const evt = await start({ port: 0, signal: abortController.signal } as never) as {
				port: number;
			};
			const base = `http://localhost:${evt.port}/mcp`;

			const allowedOrigin = await fetch(base, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "server/discover",
					params: { _meta: meta },
				}),
			});
			// The default allowlist would reject this Origin, so 200 proves the option reached the handler.
			await allowedOrigin.body?.cancel();
			expect(allowedOrigin.status).toBe(200);

			const oversized = await fetch(base, {
				method: "POST",
				headers: requestHeaders,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "server/discover",
					params: { _meta: meta, padding: "x".repeat(2048) },
				}),
			});
			// The default 1048576-byte limit would accept this body, so 413 proves the configured limit is live.
			await oversized.body?.cancel();
			expect(oversized.status).toBe(413);
		} finally {
			abortController.abort();
		}
	});
});
