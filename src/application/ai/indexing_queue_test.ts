import { describe, it } from "bdd";
import { expect } from "expect";
import { IndexingQueue } from "./indexing_queue.ts";

interface Request {
	contentChanged: boolean;
}

const merge = (a: Request, b: Request): Request => ({
	contentChanged: a.contentChanged || b.contentChanged,
});

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

describe("IndexingQueue", () => {
	it("never runs more than the configured jobs at once", async () => {
		let running = 0;
		let peak = 0;
		const queue = new IndexingQueue<Request>(
			async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise((r) => setTimeout(r, 5));
				running--;
			},
			merge,
			2,
		);

		for (let i = 0; i < 10; i++) queue.enqueue(`n${i}`, { contentChanged: false });
		await queue.idle();
		expect(peak).toBe(2);
	});

	it("merges requests for a pending key", async () => {
		const seen: [string, Request][] = [];
		const gate = deferred();
		const queue = new IndexingQueue<Request>(
			async (key, request) => {
				if (key === "blocker") await gate.promise;
				seen.push([key, request]);
			},
			merge,
			1,
		);

		queue.enqueue("blocker", { contentChanged: false });
		queue.enqueue("a", { contentChanged: true });
		queue.enqueue("a", { contentChanged: false });
		gate.resolve();
		await queue.idle();
		expect(seen).toEqual([["blocker", { contentChanged: false }], ["a", {
			contentChanged: true,
		}]]);
	});

	it("runs a key again after it finishes when it was requested while running", async () => {
		const seen: Request[] = [];
		const gate = deferred();
		const queue = new IndexingQueue<Request>(
			async (_key, request) => {
				seen.push(request);
				if (seen.length === 1) await gate.promise;
			},
			merge,
			2,
		);

		queue.enqueue("a", { contentChanged: false });
		await new Promise((r) => setTimeout(r, 0));
		queue.enqueue("a", { contentChanged: true });
		queue.enqueue("a", { contentChanged: false });
		gate.resolve();
		await queue.idle();
		expect(seen).toEqual([{ contentChanged: false }, { contentChanged: true }]);
	});

	it("cancels pending work and any rerun of a running key", async () => {
		const seen: string[] = [];
		const gate = deferred();
		const queue = new IndexingQueue<Request>(
			async (key) => {
				seen.push(key);
				if (key === "running") await gate.promise;
			},
			merge,
			1,
		);

		queue.enqueue("running", { contentChanged: false });
		queue.enqueue("pending", { contentChanged: false });
		await new Promise((r) => setTimeout(r, 0));
		queue.enqueue("running", { contentChanged: true });
		queue.cancel("pending");
		queue.cancel("running");
		gate.resolve();
		await queue.idle();
		expect(seen).toEqual(["running"]);
	});

	it("keeps working after a job throws", async () => {
		const seen: string[] = [];
		const queue = new IndexingQueue<Request>(
			async (key) => {
				if (key === "bad") throw new Error("boom");
				seen.push(key);
			},
			merge,
			1,
		);

		queue.enqueue("bad", { contentChanged: false });
		queue.enqueue("good", { contentChanged: false });
		await queue.idle();
		expect(seen).toEqual(["good"]);
	});
});
