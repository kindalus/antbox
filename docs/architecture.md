# Architecture

Antbox is built with a Hexagonal (Ports and Adapters) architecture. Core business rules live in the
Domain and Application layers, while integrations (HTTP servers, storage, databases, AI providers)
are isolated in Adapters. This keeps the system modular and swap-friendly.

The system is also multi-tenant. Each tenant is assembled at startup with its own repositories,
storage provider, keys, and optional AI components.

```
+---------------------------------------------------------------------------------------+
|                                       Adapters                                        |
|  HTTP (oak) | WebDAV | Storage (inmem/flat_file/gdrive/s3) | Repos (inmem/mongo/pouch) |
|  Vector DB (inmem/flat_file) | AI Models (google/deterministic)                        |
+----------------------------------^--------------------^-------------------------------+
                                   |                    |
                                   v                    v
+---------------------------------------------------------------------------------------+
|                                     Application                                       |
|  NodeService | AspectsService | FeaturesService/Engine | AgentsService/Engine         |
|  Workflows | Users/Groups/API Keys | Audit Logging | RAG/Embedding                     |
+----------------------------------^--------------------^-------------------------------+
                                   |                    |
                                   v                    v
+---------------------------------------------------------------------------------------+
|                                        Domain                                         |
|  Nodes | Aspects | Features | Agents | Workflows | Users/Groups | Audit Events          |
+---------------------------------------------------------------------------------------+
```

## Key Data Stores

- **NodeRepository**: Metadata for content nodes (files, folders, smart folders, meta nodes, articles).
- **StorageProvider**: Binary file content for file nodes.
- **ConfigurationRepository**: Aspects, features, agents, workflows, users, groups, and API keys.
- **EventStoreRepository**: Audit event streams (required per tenant).

Note: the configuration repository is currently in-memory only, so configuration data does not
persist across restarts unless a persistent adapter is added.

## Ports and Adapters

The application layer defines ports (interfaces) such as `StorageProvider`, `NodeRepository`,
`VectorDatabase`, and `AIModel`. Adapters implement these ports and are loaded dynamically from
module paths configured in `antbox.toml`.

## Execution Engines

Two execution engines orchestrate dynamic behavior:

- **FeaturesEngine**: Runs actions, extensions, and AI tools (feature modules).
- **AgentsEngine**: Runs chat/answer flows and tool-calling with configured AI models.

This setup makes it easy to swap adapters (storage, repositories, AI models) without changing core
business logic.
