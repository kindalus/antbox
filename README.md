# Antbox

Antbox is a next-generation, API-first Enterprise Content Management (ECM) platform designed for
developers. Built with Deno and TypeScript, it provides a powerful and flexible foundation for
building content-rich applications.

At its core, Antbox is a headless content repository, but its true power lies in its extensibility.
With a rich set of features like AI-powered agents, programmable actions, and a flexible content
model, Antbox can be adapted to a wide range of use cases.

## Key Features

- **API-First Design:** Every feature is accessible through a comprehensive RESTful API, making it
  easy to integrate with any application.
- **Flexible Content Model:**
  - **Nodes:** The fundamental building block in Antbox. A node can be a file, a folder, or any
    other content type.
  - **Aspects:** Extend nodes with custom metadata and behavior. Create your own content types by
    defining aspects with the properties you need.
- **Programmable Extensibility:**
  - **Features:** Write custom server-side logic in TypeScript or JavaScript. Features can be
    exposed in different ways:
    - **Actions:** Perform operations on one or more nodes.
    - **Extensions:** Create custom API endpoints.
    - **AI Tools:** Extend the capabilities of AI agents.
- **AI-Powered Agents:**
  - **Conversational AI:** Create and interact with AI agents that can chat with users and answer
    questions.
  - **Retrieval-Augmented Generation (RAG):** Ground your agents in your own content. The built-in
    RAG service enables agents to search for relevant information within the repository before
    answering questions.
  - **Tool-Using Agents:** Allow your agents to use custom tools (Features) to perform actions and
    interact with the system.
- **Pluggable Architecture:**
  - **Storage Providers:** Store your content where you want. Antbox supports multiple storage
    backends, including the local file system, Google Drive, and S3.
  - **AI Models:** Integrate with different AI models and providers.
- **Multi-Tenancy:** Manage multiple, isolated tenants from a single Antbox instance.
- **Authentication and Authorization:** Secure your content with a flexible authentication system
  that supports JWT (Bearer tokens and HTTP-only cookies), API keys, and a granular permission
  model.

## Use Cases

- **Headless CMS:** Power your websites, mobile apps, and other digital experiences with a flexible
  and scalable content backend.
- **Intelligent Document Management:** Build a smart document repository with AI-powered search and
  summarization.
- **Developer Platform:** Use Antbox as a foundation for building your own content-centric
  applications and services.
- **Knowledge Management:** Create a centralized knowledge base that your team can interact with
  through a conversational AI.
- **Digital Asset Management (DAM):** Store, organize, and manage your digital assets with custom
  metadata and workflows.

## Getting Started

To get started with Antbox, check out the [Getting Started](./docs/getting-started.md) guide.
