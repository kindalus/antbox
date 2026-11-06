import { afterAll, beforeAll, describe, it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFetch } from "./server.ts";
import { startServer } from "./serve.ts";
import { setupTenants } from "setup/setup_tenants.ts";
import { loadPiCodingAgent } from "application/ai/pi_coding_agent.ts";
import { readFormData } from "shared/multipart.ts";

await loadPiCodingAgent();

const BOUNDARY = "----antbox-test-boundary";
const encoder = new TextEncoder();
let folder = "";

function filePart(
	name: string,
	filename: string | undefined,
	type: string | undefined,
	content: Uint8Array,
) {
	const disposition = filename === undefined
		? `Content-Disposition: form-data; name="${name}"`
		: `Content-Disposition: form-data; name="${name}"; filename="${filename}"`;
	const head = `--${BOUNDARY}\r\n${disposition}\r\n${type ? `Content-Type: ${type}\r\n` : ""}\r\n`;
	return [encoder.encode(head), content, encoder.encode("\r\n")];
}

function multipart(parts: Uint8Array[][]): Blob {
	return new Blob([...(parts.flat() as BlobPart[]), encoder.encode(`--${BOUNDARY}--\r\n`)]);
}

function uploadBody(
	filename: string | undefined,
	type: string | undefined,
	content: Uint8Array,
	title = "Upload test",
): Blob {
	return multipart([
		filePart("file", filename ?? "unnamed", type, content),
		filePart(
			"metadata",
			undefined,
			undefined,
			encoder.encode(JSON.stringify({ title, parent: folder })),
		),
	].map((parts, index) => index === 0 && filename === undefined ? parts : parts));
}

function allBytes(): Uint8Array {
	const bytes = new Uint8Array(256 * 8);
	bytes.forEach((_, i) => bytes[i] = i % 256);
	return bytes;
}

describe("multipart uploads over a real socket", () => {
	let base = "";
	let jwt = "";
	let stop: () => void;
	let dir = "";

	beforeAll(async () => {
		dir = await fs.mkdtemp(join(tmpdir(), "antbox-uploads-"));
		const jwks = join(dir, "jwks.json");
		await fs.writeFile(jwks, JSON.stringify({ keys: [] }));
		const tenants = await setupTenants({
			rootPasswd: "root",
			key: "c2VydmVyLXNlY3JldA==",
			jwks,
			tenants: [{
				name: "default",
				storage: ["inmem/inmem_storage_provider.ts"],
				database: ["inmem"],
				limits: { storage: 10, tokens: 0 },
			}],
		});
		const controller = new AbortController();
		stop = () => controller.abort();
		const listen = await startServer(createFetch(tenants, async () => {}), {
			port: 0,
			hostname: "127.0.0.1",
			signal: controller.signal,
		});
		base = `http://127.0.0.1:${listen.port}`;

		const digest = await crypto.subtle.digest("SHA-256", encoder.encode("root"));
		const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
		const login = await fetch(`${base}/v2/login/root`, { method: "POST", body: hex });
		jwt = (await login.json()).jwt;

		const created = await fetch(`${base}/v2/nodes`, {
			method: "POST",
			headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Uploads",
				mimetype: "application/vnd.antbox.folder",
				parent: "--root--",
			}),
		});
		folder = (await created.json()).uuid;
	});

	afterAll(async () => {
		stop();
		await fs.rm(dir, { recursive: true, force: true });
	});

	async function upload(body: Blob) {
		const response = await fetch(`${base}/v2/nodes/-/upload`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${jwt}`,
				"Content-Type": `multipart/form-data; boundary=${BOUNDARY}`,
			},
			body,
		});
		const node = await response.json();
		return { status: response.status, node };
	}

	const matrix: [string, string | undefined, string][] = [
		["report", "application/pdf", "application/pdf"],
		["report.txt", "application/pdf", "application/pdf"],
		["photo.jpg", "image/png", "image/png"],
		["a.xyz", "application/x-custom", "application/x-custom"],
		["README", "text/plain", "text/plain"],
		["data.bin", "application/octet-stream", "application/octet-stream"],
		["page.html", "text/plain", "text/plain"],
	];

	for (const [filename, declared, expected] of matrix) {
		it(`stores ${declared} for ${filename} as declared by the client`, async () => {
			const { status, node } = await upload(
				uploadBody(filename, declared, encoder.encode("content")),
			);

			expect(status).toBe(201);
			expect(node.mimetype).toBe(expected);
		});
	}

	it("accepts a text/plain part with a charset parameter", async () => {
		const { status, node } = await upload(
			uploadBody("note.txt", "text/plain; charset=utf-8", encoder.encode("olá")),
		);

		expect(status).toBe(201);
		expect(node.mimetype).toBe("text/plain");
	});

	it("keeps every byte value, CRLF and boundary-like text and exports it unchanged", async () => {
		const almostBoundary = BOUNDARY.slice(0, -2);
		const tricky = encoder.encode(
			`\r\n--${almostBoundary}xx\r\ninline --${BOUNDARY} text\r\n\r\n--\r\n`,
		);
		const content = new Uint8Array([...allBytes(), ...tricky, 13, 10]);

		const { status, node } = await upload(
			uploadBody("blob.bin", "application/x-custom", content),
		);
		expect(status).toBe(201);
		expect(node.size).toBe(content.byteLength);

		const exported = await fetch(`${base}/v2/nodes/${node.uuid}/-/export`, {
			headers: { Authorization: `Bearer ${jwt}` },
		});
		const bytes = new Uint8Array(await exported.arrayBuffer());

		expect(exported.status).toBe(200);
		expect(exported.headers.get("Content-Disposition")).toBeNull();
		expect(exported.headers.get("Content-Type")).toBe("application/x-custom");
		expect(exported.headers.get("Content-Length")).toBe(String(content.byteLength));
		expect(bytes).toEqual(content);
	});

	it("uploads a 150MB file", async () => {
		const chunk = new Uint8Array(1024 * 1024).fill(7);
		const content = new Blob(Array.from({ length: 150 }, () => chunk));
		const body = new Blob([
			encoder.encode(
				`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="big.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
			),
			content,
			encoder.encode(
				`\r\n--${BOUNDARY}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${
					JSON.stringify({ title: "Big upload", parent: folder })
				}\r\n--${BOUNDARY}--\r\n`,
			),
		]);

		const { status, node } = await upload(body);

		expect(status).toBe(201);
		expect(node.size).toBe(150 * 1024 * 1024);
	}, 120_000);
});

describe("readFormData", () => {
	function request(
		body: Blob | string,
		contentType = `multipart/form-data; boundary=${BOUNDARY}`,
	) {
		return new Request("http://localhost/", {
			method: "POST",
			headers: { "Content-Type": contentType },
			body,
		});
	}

	it("keeps text fields, UTF-8 filenames with spaces and the declared type", async () => {
		const body = multipart([
			filePart("title", undefined, undefined, encoder.encode("olá mundo")),
			filePart("file", "relatório final.txt", "application/x-custom", encoder.encode("x")),
		]);

		const form = await readFormData(request(body));
		const file = form.get("file") as File;

		expect(form.get("title")).toBe("olá mundo");
		expect(file.name).toBe("relatório final.txt");
		expect(file.type).toBe("application/x-custom");
	});

	it("gives a file part without a Content-Type the octet-stream type", async () => {
		const form = await readFormData(
			request(multipart([filePart("file", "plain", undefined, encoder.encode("x"))])),
		);

		expect((form.get("file") as File).type).toBe("application/octet-stream");
	});

	it("rejects malformed multipart bodies", async () => {
		await expect(readFormData(request("garbage without boundaries"))).rejects.toThrow();
		await expect(
			readFormData(
				request(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="a"\r\n\r\ntruncated`),
			),
		).rejects.toThrow();
		await expect(readFormData(request("x", "multipart/form-data"))).rejects.toThrow();
	});
});
