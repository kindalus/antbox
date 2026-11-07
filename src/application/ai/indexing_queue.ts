import { Logger } from "shared/logger.ts";

/**
 * In-memory work queue keyed by node uuid, with a fixed number of concurrent jobs.
 *
 * A key is never processed twice at the same time. Requests for a pending key are merged; a
 * request for a running key is merged into one rerun that starts when the current job ends.
 */
export class IndexingQueue<T> {
	readonly #pending = new Map<string, T>();
	readonly #running = new Map<string, T | undefined>();
	readonly #idleWaiters: (() => void)[] = [];

	constructor(
		private readonly worker: (key: string, request: T) => Promise<void>,
		private readonly merge: (a: T, b: T) => T,
		private readonly concurrency = 2,
	) {}

	/** Pending and running keys. */
	get size(): number {
		return this.#pending.size + this.#running.size;
	}

	enqueue(key: string, request: T): void {
		if (this.#running.has(key)) {
			const rerun = this.#running.get(key);
			this.#running.set(key, rerun === undefined ? request : this.merge(rerun, request));
			return;
		}

		const pending = this.#pending.get(key);
		this.#pending.set(key, pending === undefined ? request : this.merge(pending, request));
		this.#pump();
	}

	/** Drops pending work for the key and any rerun of a running job; a running job finishes. */
	cancel(key: string): void {
		this.#pending.delete(key);
		if (this.#running.has(key)) this.#running.set(key, undefined);
	}

	/** Resolves when no job is pending or running. */
	idle(): Promise<void> {
		if (this.size === 0) return Promise.resolve();
		return new Promise((resolve) => this.#idleWaiters.push(resolve));
	}

	#pump(): void {
		while (this.#running.size < this.concurrency && this.#pending.size > 0) {
			const [key, request] = this.#pending.entries().next().value as [string, T];
			this.#pending.delete(key);
			this.#running.set(key, undefined);
			void this.#run(key, request);
		}

		if (this.size === 0) {
			for (const resolve of this.#idleWaiters.splice(0)) resolve();
		}
	}

	async #run(key: string, request: T): Promise<void> {
		try {
			await this.worker(key, request);
		} catch (error) {
			Logger.error(`IndexingQueue: job for ${key} failed`, error);
		}

		const rerun = this.#running.get(key);
		this.#running.delete(key);
		if (rerun !== undefined) {
			const pending = this.#pending.get(key);
			this.#pending.set(key, pending === undefined ? rerun : this.merge(rerun, pending));
		}
		this.#pump();
	}
}
