import { afterEach, describe, it } from "bdd";
import { expect } from "expect";
import { startServer } from "./serve.ts";

describe("startServer", () => {
	const controllers: AbortController[] = [];

	function start(
		handler: (request: Request) => Response | Promise<Response>,
	) {
		const controller = new AbortController();
		controllers.push(controller);
		return startServer(handler, { port: 0, hostname: "127.0.0.1", signal: controller.signal });
	}

	afterEach(() => {
		controllers.splice(0).forEach((controller) => controller.abort());
	});

	it("serves a request that outlasts the default idle timeout exactly once", async () => {
		let calls = 0;
		const { port } = await start(async () => {
			calls++;
			await new Promise((resolve) => setTimeout(resolve, 11_000));
			return new Response("done");
		});

		const response = await fetch(`http://127.0.0.1:${port}/slow`);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("done");
		expect(calls).toBe(1);
	}, 25_000);

	it("accepts an upload larger than the default 128MB body limit", async () => {
		const chunk = new Uint8Array(1024 * 1024).fill(1);
		const chunks = 150;
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent === chunks) {
					controller.close();
					return;
				}
				sent++;
				controller.enqueue(chunk);
			},
		});

		const { port } = await start(async (request) => {
			let size = 0;
			for await (const part of request.body!) {
				size += part.byteLength;
			}
			return new Response(String(size));
		});

		const response = await fetch(`http://127.0.0.1:${port}/upload`, {
			method: "POST",
			body,
			// @ts-expect-error streaming request bodies need half duplex on some runtimes
			duplex: "half",
		});

		expect(response.status).toBe(200);
		expect(Number(await response.text())).toBe(chunks * chunk.byteLength);
	}, 60_000);

	it("stops listening when the signal aborts", async () => {
		const controller = new AbortController();
		const { port } = await startServer(() => new Response("up"), {
			port: 0,
			hostname: "127.0.0.1",
			signal: controller.signal,
		});
		expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);

		controller.abort();

		await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
	});
});
