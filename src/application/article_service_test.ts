import { describe, test, expect } from "bun:test";
import type { ArticleServiceContext } from "./article_service_context";
import { ArticleService } from "./article_service";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";

describe("ArticleService.create", () => {
    test("should create the article", async () => {
        const service =  articleService();

        await service.create()
    });
});

const articleService = (opts: Partial<ArticleServiceContext> = {}) => new ArticleService({
    storage: opts?.storage ?? new InMemoryStorageProvider(),
    repository: opts?.repository ?? new InMemoryNodeRepository(),
    bus: opts?.bus ?? new InMemoryEventBus(),
});