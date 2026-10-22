import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import {
	copyHandler,
	createFileHandler,
	createHandler,
	exportHandler,
	findHandler,
	updateFileHandler,
	updateHandler,
} from "./nodes_handlers.ts";
import { right } from "shared/either.ts";

function fixture() {
	const calls: { method: string; args: unknown[] }[] = [];
	const nodeService = Object.fromEntries(
		["copy", "createFile", "create", "find", "updateFile", "update"].map((method) => [
			method,
			(...args: unknown[]) => {
				calls.push({ method, args });
				return Promise.resolve(right({ uuid: "test-node" }));
			},
		]),
	);
	return { calls, tenant: { name: "default", nodeService } as unknown as AntboxTenant };
}

function jsonRequest(body: string) {
	return new Request("http://localhost/nodes", {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-params": '{"uuid":"test-node"}' },
		body,
	});
}

Deno.test("raw node exports preserve content and restrict browser document capabilities", async () => {
	const content = "<h1>Document preview</h1>";
	const file = new File([content], "document.html", { type: "text/html" });
	const tenant = {
		name: "default",
		nodeService: {
			get: () => Promise.resolve(right({ uuid: "file", mimetype: file.type })),
			export: () => Promise.resolve(right(file)),
		},
	} as unknown as AntboxTenant;
	const response = await exportHandler([tenant])(
		new Request("http://localhost/nodes/file/-/export", {
			headers: { "x-params": '{"uuid":"file"}' },
		}),
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Type")).toBe("text/html");
	expect(response.headers.get("Content-Length")).toBe(String(file.size));
	expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
	expect(response.headers.get("Content-Security-Policy"))
		.toBe("sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(await response.text()).toBe(content);
});

describe("node request validation", () => {
	it("preserves valid create and update metadata", async () => {
		const { calls, tenant } = fixture();
		const metadata = {
			title: "Document",
			mimetype: "text/plain",
			properties: { reviewed: true },
		};
		for (const factory of [createHandler, updateHandler]) {
			expect(
				(await factory([tenant])(
					jsonRequest(JSON.stringify(metadata)),
				)).status,
			)
				.toBe(factory === createHandler ? 201 : 200);
		}
		for (const call of calls) {
			expect(call.args.at(-1)).toEqual(metadata);
		}
	});
	it("rejects malformed and non-object JSON before calling a service", async () => {
		for (const createHandlerFn of [createHandler, updateHandler, copyHandler, findHandler]) {
			const { calls, tenant } = fixture();
			for (const body of ["{", "null", "[]", '"text"', "42"]) {
				const response = await createHandlerFn([tenant])(jsonRequest(body));
				expect(response.status).toBe(400);
				await response.body?.cancel();
			}
			expect(calls).toHaveLength(0);
		}
	});

	it("rejects invalid pagination and preserves defaults and valid filters", async () => {
		const { calls, tenant } = fixture();
		const handler = findHandler([tenant]);
		for (const pageSize of [-1, 0, 1.5, 201, "20", null]) {
			expect((await handler(jsonRequest(JSON.stringify({ filters: [], pageSize })))).status)
				.toBe(400);
		}
		for (const pageToken of [-1, 0, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
			expect((await handler(jsonRequest(JSON.stringify({ filters: [], pageToken })))).status)
				.toBe(400);
		}
		expect(calls).toHaveLength(0);
		expect((await handler(jsonRequest('{"filters":[]}'))).status).toBe(200);
		expect(calls[0].args.slice(1)).toEqual([[], 20, 1]);
		expect(
			(await handler(jsonRequest('{"filters":"invoices","pageSize":200,"pageToken":2}'))).status,
		).toBe(200);
		expect(calls[1].args.slice(1)).toEqual(["invoices", 200, 2]);
	});

	it("rejects non-string copy destinations and accepts a valid destination", async () => {
		const { calls, tenant } = fixture();
		const handler = copyHandler([tenant]);
		for (const to of [null, {}, [], 3, ""]) {
			expect((await handler(jsonRequest(JSON.stringify({ to })))).status).toBe(400);
		}
		expect(calls).toHaveLength(0);
		expect((await handler(jsonRequest('{"to":"target-folder"}'))).status).toBe(200);
		expect(calls[0].args.slice(1)).toEqual(["test-node", "target-folder"]);
	});

	it("rejects invalid multipart bodies, string files, and non-object metadata", async () => {
		for (const factory of [createFileHandler, updateFileHandler]) {
			const { calls, tenant } = fixture();
			const handler = factory([tenant]);
			expect((await handler(jsonRequest("{}"))).status).toBe(400);
			for (const file of [undefined, "not a file"]) {
				const body = new FormData();
				if (file) body.set("file", file);
				body.set("metadata", "{}");
				const response = await handler(
					new Request("http://localhost/nodes", {
						method: "POST",
						headers: { "x-params": '{"uuid":"test-node"}' },
						body,
					}),
				);
				expect(response.status).toBe(400);
			}
			expect(calls).toHaveLength(0);
		}
		const { calls, tenant } = fixture();
		for (const metadata of [undefined, "null", "[]", "{", '"text"']) {
			const body = new FormData();
			body.set("file", new File(["hello"], "file.txt", { type: "text/plain" }));
			if (metadata) body.set("metadata", metadata);
			expect(
				(await createFileHandler([tenant])(
					new Request("http://localhost/nodes", { method: "POST", body }),
				)).status,
			).toBe(400);
		}
		expect(calls).toHaveLength(0);
	});

	it("passes validated files and metadata to create and update", async () => {
		const { calls, tenant } = fixture();
		for (const factory of [createFileHandler, updateFileHandler]) {
			const body = new FormData();
			body.set("file", new File(["hello"], "file.txt", { type: "text/plain" }));
			body.set("metadata", '{"parent":"target-folder"}');
			const response = await factory([tenant])(
				new Request("http://localhost/nodes", {
					method: "POST",
					headers: { "x-params": '{"uuid":"test-node"}' },
					body,
				}),
			);
			expect(response.status).toBe(factory === createFileHandler ? 201 : 200);
		}
		expect(calls[0].args[1]).toBeInstanceOf(File);
		expect(calls[0].args[2]).toEqual({ parent: "target-folder" });
		expect(calls[1].args[2]).toBeInstanceOf(File);
	});
});
