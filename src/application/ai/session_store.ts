import type { Tool } from "ai";
import type { AgentData } from "domain/configuration/agent_data.ts";

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes sliding
const HARD_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours hard cap
const DEFAULT_MAX_ENTRIES = 1000;

export interface SessionSnapshot {
	readonly sessionId: string;
	readonly tenant: string;
	readonly userEmail: string;
	readonly agentUuid: string;
	readonly agentData: AgentData;
	readonly tools: Record<string, Tool>;
	readonly toolNames: readonly string[];
	readonly createdAt: number;
	readonly expiresAt: number;
}

interface MutableEntry {
	snapshot: SessionSnapshot;
	lastUsed: number;
}

export interface SessionStoreOptions {
	readonly ttlMs?: number;
	readonly hardTtlMs?: number;
	readonly maxEntries?: number;
	readonly clock?: () => number;
}

export class SessionStore {
	readonly #entries = new Map<string, MutableEntry>();
	readonly #ttlMs: number;
	readonly #hardTtlMs: number;
	readonly #maxEntries: number;
	readonly #clock: () => number;

	constructor(options: SessionStoreOptions = {}) {
		this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.#hardTtlMs = options.hardTtlMs ?? HARD_TTL_MS;
		this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.#clock = options.clock ?? Date.now;
	}

	put(snapshot: Omit<SessionSnapshot, "createdAt" | "expiresAt">): SessionSnapshot {
		const now = this.#clock();
		const fullSnapshot: SessionSnapshot = {
			...snapshot,
			createdAt: now,
			expiresAt: now + this.#hardTtlMs,
		};
		this.#entries.set(snapshot.sessionId, {
			snapshot: fullSnapshot,
			lastUsed: now,
		});
		this.#enforceCapacity();
		return fullSnapshot;
	}

	get(sessionId: string): SessionSnapshot | undefined {
		const entry = this.#entries.get(sessionId);
		if (!entry) return undefined;

		const now = this.#clock();
		if (this.#isExpired(entry, now)) {
			this.#entries.delete(sessionId);
			return undefined;
		}

		// Sliding TTL: extend lastUsed on access (capped by hardTtlMs via expiresAt).
		entry.lastUsed = now;
		// Re-insert to maintain insertion-order LRU semantics on Map iteration.
		this.#entries.delete(sessionId);
		this.#entries.set(sessionId, entry);
		return entry.snapshot;
	}

	delete(sessionId: string): boolean {
		return this.#entries.delete(sessionId);
	}

	size(): number {
		this.#sweepExpired();
		return this.#entries.size;
	}

	#isExpired(entry: MutableEntry, now: number): boolean {
		if (now >= entry.snapshot.expiresAt) return true;
		if (now - entry.lastUsed > this.#ttlMs) return true;
		return false;
	}

	#sweepExpired(): void {
		const now = this.#clock();
		for (const [id, entry] of this.#entries) {
			if (this.#isExpired(entry, now)) {
				this.#entries.delete(id);
			}
		}
	}

	#enforceCapacity(): void {
		this.#sweepExpired();
		while (this.#entries.size > this.#maxEntries) {
			const oldest = this.#entries.keys().next().value;
			if (oldest === undefined) break;
			this.#entries.delete(oldest);
		}
	}
}
