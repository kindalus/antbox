# Antbox Project Memory

## Architecture
Hexagonal Architecture (Ports & Adapters), Deno + TypeScript.
- **Domain**: `src/domain/` — pure models, no framework deps
- **Application**: `src/application/` — business logic (Services = CRUD, Engines = execution)
- **Adapters**: `src/adapters/` — infrastructure (Oak HTTP, SQLite, S3, etc.)
- **API**: `src/api/` — HTTP handlers and middleware
- **Setup**: `src/setup/` — tenant wiring/dependency injection

## Key Patterns
- `Either<L,R>` for error handling (`left(err)` / `right(val)`) — no exceptions
- Multi-tenant: each tenant has isolated db, storage, event store, config
- Event-driven via `EventBus` with `.subscribe()` and `.publish()`

## AI System (ADK-based, completed migration 2026-03)
- **AgentsEngine**: ADK `InMemoryRunner` + `LlmAgent`, stateless per-call sessions
- **Skills**: disk-based `.md` files with YAML frontmatter → `AgentTool` sub-agents
  - Builtin skills in `src/application/ai/builtin_skills/`
  - Extra skills configured via `AIConfiguration.skillsPath`
- **RAGService**: event-driven indexing + query; replaces old EmbeddingService
  - Constructor: `(eventBus, repository, nodeService, embeddingsProvider, ocrProvider)`
  - `query(text, topK, threshold): Promise<Either<AntboxError, RagDocument[]>>`
- **EmbeddingsProvider**: `src/domain/ai/embeddings_provider.ts` — `embed(texts[])`
- **OCRProvider**: `src/domain/ai/ocr_provider.ts` — `ocr(file: File)`
- **AIConfiguration**: `defaultModel` (ADK format `google/gemini-2.5-flash`), `embeddingProvider?`, `ocrProvider?`, `skillsPath?`
- `AgentData` now has `ragTopK?: number` and `ragThreshold?: number`

## ADK FunctionTool API
- `new FunctionTool({ name, description, execute, parameters })`
- `parameters` must be a **Zod schema** (same version as ADK uses — `zod@4.3.6`)
- Project uses `zod@4.3.6` in `deno.json` to match ADK's dependency
- `execute` gets the Zod-inferred type of `parameters`

## Test Commands
```bash
deno task test           # All tests
deno task test:services  # Core services only
deno task test:watch     # Watch mode
```

## Deleted (old AI system)
- `src/application/ai/ai_model.ts` — replaced by EmbeddingsProvider + OCRProvider
- `src/application/ai/ai_model_dto.ts`
- `src/application/ai/embedding_service.ts` — replaced by RAGService
- `src/application/ai/skill_parser.ts` — old markdown skill parser
- `src/application/ai/internal_ai_tools/load_skill.ts`
- `src/adapters/models/` — all model adapters (google, anthropic, openai, ollama, deterministic)
- `src/adapters/model_configuration_parser.ts`
- `src/domain/configuration/skill_data.ts` and `skill_schema.ts`
- `src/adapters/oak/skills_v2_router.ts` and `ai_models_v2_router.ts`

## NodeService Context
- `embeddingsProvider?: EmbeddingsProvider` (previously `embeddingModel?: AIModel`)
- Used for semantic search (`?query` prefix in find())

## FeaturesEngine Context
- `ocrProvider?: OCRProvider` (previously `ocrModel?: AIModel`)

## Setup (setup_tenants.ts)
- Loads `embeddingsProvider` via `providerFrom<EmbeddingsProvider>(cfg.ai.embeddingProvider)`
- Loads `ocrProvider` via `providerFrom<OCRProvider>(cfg.ai.ocrProvider)` (falls back to NullOCRProvider)
- Loads skill agents via `loadSkillAgents(defaultModel, BUILTIN_SKILLS_DIR, skillsPath?)`
- BUILTIN_SKILLS_DIR uses `fromFileUrl(new URL('../application/ai/builtin_skills', import.meta.url))`
- `fromFileUrl` must be imported from `jsr:@std/path@1.1.2` directly (not via `path` alias)
