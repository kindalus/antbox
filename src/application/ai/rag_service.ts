import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { EmbeddingStatusCounts, NodeRepository } from "domain/nodes/node_repository.ts";
import type { NodeService } from "application/nodes/node_service.ts";
import type { EmbeddingsProvider } from "domain/ai/embeddings_provider.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { EmbeddingCreatedEvent } from "domain/nodes/embedding_created_event.ts";
import { EmbeddingUpdatedEvent } from "domain/nodes/embedding_updated_event.ts";
import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import { OcrCompletedEvent } from "domain/ai/ocr_completed_event.ts";
import { isEmbeddingsSupportedMimetype } from "domain/nodes/embedding.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { createElevatedContext } from "application/security/elevated_context.ts";
import { embeddingMarkdownBody, toEmbeddingMarkdown } from "application/nodes/node_markdown.ts";
import { IndexingQueue } from "./indexing_queue.ts";
import { type RetryOptions, withRetry } from "./retry.ts";

export type ReindexMode = "missing" | "all";

export interface RAGServiceOptions {
	/** Indexing jobs running at the same time in this tenant. */
	concurrency?: number;
	retry?: RetryOptions;
}

export interface ReindexRequest {
	mode: ReindexMode;
	tenant: string;
	actor: string;
}

export interface ReindexJobStatus {
	mode: ReindexMode;
	startedAt: string;
	finishedAt?: string;
	queued: number;
	done: number;
	failed: number;
}

export interface IndexingFailure {
	uuid: string;
	error: string;
	at: string;
}

export interface EmbeddingsIndexStatus {
	enabled: true;
	counts: EmbeddingStatusCounts;
	job: ReindexJobStatus | null;
	failures: IndexingFailure[];
}

export class ReindexInProgressError extends AntboxError {
	static ERROR_CODE = "ReindexInProgress";

	constructor() {
		super(ReindexInProgressError.ERROR_CODE, "A reindex is already running for this tenant");
	}
}

interface IndexRequest {
	/** Extract the file text again instead of reusing the stored body. */
	contentChanged: boolean;
	/** Publish EmbeddingCreated/Updated, which run onEmbeddings* hooks. Reindexing does not. */
	publish: boolean;
	tenant: string;
	actor: string;
}

type Outcome = "indexed" | "failed" | "skipped" | "gone";

interface ActiveJob extends ReindexJobStatus {
	remaining: Set<string>;
	enumerating: boolean;
}

const DEFAULT_CONCURRENCY = 2;
const MAX_FAILURES = 50;
const REINDEX_PAGE_SIZE = 200;

/**
 * RAGService - Indexes node content for semantic search.
 *
 * Node events and reindex requests go through one queue per tenant. Each job reads the node when
 * it runs, so it always indexes the latest version. It stores the extracted text as the node's
 * markdown body and searchable body (saveContent), then the embedding. File types outside
 * EMBEDDINGS_SUPPORTED_MIMETYPES get no OCR and no embedding; they stay searchable by metadata. OCR and embedding calls are retried
 * on transient provider errors; the outcome is stored as the node's embedding status.
 */
export class RAGService {
	readonly #repository: NodeRepository;
	readonly #nodeService: NodeService;
	readonly #embeddingsProvider: EmbeddingsProvider;
	readonly #ocrProvider: OCRProvider;
	readonly #eventBus: EventBus;
	readonly #retry: RetryOptions;
	readonly #queue: IndexingQueue<IndexRequest>;
	readonly #failures: IndexingFailure[] = [];
	#job?: ActiveJob;

	constructor(
		eventBus: EventBus,
		repository: NodeRepository,
		nodeService: NodeService,
		embeddingsProvider: EmbeddingsProvider,
		ocrProvider: OCRProvider,
		options: RAGServiceOptions = {},
	) {
		this.#repository = repository;
		this.#nodeService = nodeService;
		this.#embeddingsProvider = embeddingsProvider;
		this.#ocrProvider = ocrProvider;
		this.#eventBus = eventBus;
		this.#retry = options.retry ?? {};
		this.#queue = new IndexingQueue(
			(uuid, request) => this.#runJob(uuid, request),
			(a, b) => ({
				contentChanged: a.contentChanged || b.contentChanged,
				publish: a.publish || b.publish,
				tenant: b.tenant,
				actor: b.actor,
			}),
			options.concurrency ?? DEFAULT_CONCURRENCY,
		);

		if (!repository.supportsEmbeddings()) {
			return;
		}

		eventBus.subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) =>
				this.#queue.enqueue(evt.payload.uuid, {
					contentChanged: true,
					publish: true,
					tenant: evt.tenant,
					actor: evt.userEmail,
				}),
		});

		eventBus.subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) =>
				this.#queue.enqueue(evt.payload.uuid, {
					contentChanged: Object.hasOwn(evt.payload.newValues, "size") ||
						Object.hasOwn(evt.payload.newValues, "mimetype"),
					publish: true,
					tenant: evt.tenant,
					actor: evt.userEmail,
				}),
		});

		eventBus.subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#handleNodeDeleted(evt.payload.uuid),
		});
	}

	/** Resolves when no indexing job is pending or running. */
	idle(): Promise<void> {
		return this.#queue.idle();
	}

	/**
	 * Queues the tenant's nodes for indexing without publishing embedding events.
	 *
	 * "missing" takes nodes that were never indexed or whose last indexing failed; "all" takes every
	 * node that can have an embedding. In both modes, files of unsupported types lose their
	 * embedding.
	 */
	async reindex(
		request: ReindexRequest,
	): Promise<Either<AntboxError, { mode: ReindexMode; queued: number }>> {
		if (this.#job && !this.#job.finishedAt) return left(new ReindexInProgressError());

		const job: ActiveJob = {
			mode: request.mode,
			startedAt: new Date().toISOString(),
			queued: 0,
			done: 0,
			failed: 0,
			remaining: new Set(),
			enumerating: true,
		};
		this.#job = job;

		try {
			// Collect every node first: offset paging is unstable while jobs update rows.
			const nodes: NodeMetadata[] = [];
			for (let page = 1;; page++) {
				const result = await this.#repository.filter([], REINDEX_PAGE_SIZE, page);
				nodes.push(...result.nodes.map((node) => node.metadata));
				if (result.nodes.length < REINDEX_PAGE_SIZE) break;
			}

			for (let i = 0; i < nodes.length; i += REINDEX_PAGE_SIZE) {
				const batch = nodes.slice(i, i + REINDEX_PAGE_SIZE);
				const statusesOrErr = await this.#repository.getEmbeddingStatuses(
					batch.map((node) => node.uuid),
				);
				if (statusesOrErr.isLeft()) return left(statusesOrErr.value);

				for (const node of batch) {
					const status = statusesOrErr.value[node.uuid]?.status ?? null;
					if (!this.#isEmbeddable(node)) {
						if (status !== "skipped") {
							await this.#repository.setEmbeddingStatus(node.uuid, "skipped");
						}
						continue;
					}
					if (request.mode === "missing" && status === "indexed") continue;

					job.remaining.add(node.uuid);
					job.queued++;
					this.#queue.enqueue(node.uuid, {
						contentChanged: status !== "indexed",
						publish: false,
						tenant: request.tenant,
						actor: request.actor,
					});
				}
			}

			return right({ mode: request.mode, queued: job.queued });
		} finally {
			job.enumerating = false;
			this.#finishJobIfDone(job);
		}
	}

	async status(): Promise<Either<AntboxError, EmbeddingsIndexStatus>> {
		const countsOrErr = await this.#repository.countEmbeddingStatuses();
		if (countsOrErr.isLeft()) return left(countsOrErr.value);

		let job: ReindexJobStatus | null = null;
		if (this.#job) {
			const { remaining: _remaining, enumerating: _enumerating, ...rest } = this.#job;
			job = rest;
		}

		return right({
			enabled: true,
			counts: countsOrErr.value,
			job,
			failures: [...this.#failures].reverse(),
		});
	}

	// ========================================================================
	// PRIVATE — INDEXING
	// ========================================================================

	async #handleNodeDeleted(uuid: string): Promise<void> {
		this.#queue.cancel(uuid);
		this.#recordJobOutcome(uuid, "gone");

		const deleteOrErr = await this.#repository.deleteEmbedding(uuid);
		if (deleteOrErr.isLeft()) {
			Logger.error(
				`RAGService: delete embedding failed for ${uuid}: ${deleteOrErr.value.message}`,
			);
		}
	}

	async #runJob(uuid: string, request: IndexRequest): Promise<void> {
		let outcome: Outcome = "failed";
		try {
			outcome = await this.#index(uuid, request);
		} finally {
			this.#recordJobOutcome(uuid, outcome);
		}
	}

	async #index(uuid: string, request: IndexRequest): Promise<Outcome> {
		const nodeOrErr = await this.#repository.getById(uuid);
		if (nodeOrErr.isLeft()) return "gone";
		const node = nodeOrErr.value.metadata;

		if (!this.#isEmbeddable(node)) {
			await this.#repository.setEmbeddingStatus(uuid, "skipped");
			return "skipped";
		}

		// Every node has markdown (NodeService stores the frontmatter), so the status tells whether a
		// body was ever extracted: "indexed" and "failed" ran this job before.
		const statusOrErr = await this.#repository.getEmbeddingStatuses([uuid]);
		const status = statusOrErr.isRight() ? statusOrErr.value[uuid]?.status ?? null : null;
		const indexedBefore = status === "indexed" || status === "failed";
		const previousOrErr = await this.#repository.getContents([uuid]);
		const previousMarkdown = indexedBefore && previousOrErr.isRight()
			? previousOrErr.value[uuid]
			: undefined;

		const { body, problem } = Nodes.isFile(node)
			? await this.#fileBody(node, previousMarkdown, request)
			: { body: "", problem: undefined };

		// The extracted text is searchable even if the embedding below fails.
		const markdown = toEmbeddingMarkdown(node, body);
		const savedOrErr = await this.#repository.saveContent(uuid, { markdown, searchBody: body });
		if (savedOrErr.isLeft()) {
			return this.#fail(uuid, `store: ${savedOrErr.value.message}`);
		}

		const embeddingsOrErr = await withRetry(
			() => this.#embeddingsProvider.embed([markdown]),
			this.#retry,
		);
		if (embeddingsOrErr.isLeft()) {
			return this.#fail(uuid, embeddingsOrErr.value.message);
		}

		if (embeddingsOrErr.value.usage) {
			this.#eventBus.publish(
				new EmbeddingsGeneratedEvent("system", request.tenant, {
					nodeUuid: uuid,
					model: embeddingsOrErr.value.model ?? "default",
					usage: embeddingsOrErr.value.usage,
					context: "indexing",
				}),
			);
		}

		const storeOrErr = await this.#repository.upsertEmbedding(
			uuid,
			embeddingsOrErr.value.embeddings[0],
		);
		if (storeOrErr.isLeft()) {
			return this.#fail(uuid, `store: ${storeOrErr.value.message}`);
		}

		if (request.publish) {
			this.#eventBus.publish(
				!indexedBefore
					? new EmbeddingCreatedEvent(request.actor, request.tenant, uuid)
					: new EmbeddingUpdatedEvent(request.actor, request.tenant, uuid),
			);
		}

		// The metadata embedding is stored; a failed extraction is kept for the next reindex.
		return problem ? this.#fail(uuid, problem) : "indexed";
	}

	/** File text to embed: the stored body, or a fresh extraction when the content changed. */
	async #fileBody(
		node: NodeMetadata,
		previousMarkdown: string | undefined,
		request: IndexRequest,
	): Promise<{ body: string; problem?: string }> {
		const previousBody = previousMarkdown === undefined
			? undefined
			: embeddingMarkdownBody(previousMarkdown);
		const needsExtraction = previousBody === undefined || request.contentChanged;

		if (!needsExtraction) return { body: previousBody ?? "" };
		if ((node.size ?? 0) === 0) return { body: "" };

		const fileOrErr = await this.#nodeService.export(
			createElevatedContext(request.tenant),
			node.uuid,
		);
		if (fileOrErr.isLeft()) {
			return { body: previousBody ?? "", problem: `export: ${fileOrErr.value.message}` };
		}

		const textOrErr = await withRetry(() => this.#ocrProvider.ocr(fileOrErr.value), this.#retry);
		if (textOrErr.isLeft()) {
			return { body: previousBody ?? "", problem: `ocr: ${textOrErr.value.message}` };
		}

		if (textOrErr.value.usage) {
			this.#eventBus.publish(
				new OcrCompletedEvent("system", request.tenant, {
					nodeUuid: node.uuid,
					model: textOrErr.value.model ?? "default",
					usage: textOrErr.value.usage,
					context: "indexing",
				}),
			);
		}

		return { body: textOrErr.value.text };
	}

	#isEmbeddable(node: NodeMetadata): boolean {
		return !Nodes.isFile(node) || isEmbeddingsSupportedMimetype(node.mimetype);
	}

	async #fail(uuid: string, error: string): Promise<Outcome> {
		Logger.warn(`RAGService: indexing failed for ${uuid}: ${error}`);
		this.#failures.push({ uuid, error, at: new Date().toISOString() });
		if (this.#failures.length > MAX_FAILURES) this.#failures.shift();

		const statusOrErr = await this.#repository.setEmbeddingStatus(uuid, "failed", error);
		if (statusOrErr.isLeft()) {
			Logger.error(
				`RAGService: cannot record the failure of ${uuid}: ${statusOrErr.value.message}`,
			);
		}
		return "failed";
	}

	#recordJobOutcome(uuid: string, outcome: Outcome): void {
		const job = this.#job;
		if (!job || job.finishedAt || !job.remaining.delete(uuid)) return;

		job.done++;
		if (outcome === "failed") job.failed++;
		this.#finishJobIfDone(job);
	}

	#finishJobIfDone(job: ActiveJob): void {
		if (!job.enumerating && job.remaining.size === 0 && !job.finishedAt) {
			job.finishedAt = new Date().toISOString();
		}
	}
}
