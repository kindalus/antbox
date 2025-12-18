# Architecture

Antbox is designed using the Hexagonal Architecture (also known as Ports and Adapters). This
architecture promotes a clear separation of concerns, making the application easier to develop,
test, and maintain.

The application is divided into three main layers:

1. **Domain:** The core of the application, containing the business logic and data models.
2. **Application:** Orchestrates the flow of data and commands between the domain and the adapters.
3. **Adapters:** The outer layer, responsible for interacting with the outside world (e.g.,
   databases, file systems, and the web).

```
+---------------------------------------------------------------------------------------+
|                                        Adapters                                       |
| +-----------------+ +--------------------+ +-----------------+ +---------------------+ |
| |      Web        | |     Storage        | |   Vector DB     | |       AI Models     | |
| | (oak)       | | (fs, gdrive, s3)   | | (inmem, pg)     | | (google, openai)    | |
| +-----------------+ +--------------------+ +-----------------+ +---------------------+ |
+---------------------------------^-----------------^-----------------^-----------------+
                                  |                 |                 |
                                  v                 v                 v
+---------------------------------------------------------------------------------------+
|                                      Application                                      |
| +-----------------+ +--------------------+ +-----------------+ +---------------------+ |
| |  Node Service   | |   Aspect Service   | |  Agent Service  | |     Auth Service    | |
| +-----------------+ +--------------------+ +-----------------+ +---------------------+ |
+---------------------------------^-----------------^-----------------^-----------------+
                                  |                 |                 |
                                  v                 v                 v
+---------------------------------------------------------------------------------------+
|                                         Domain                                        |
| +-----------------+ +--------------------+ +-----------------+ +---------------------+ |
| |      Node       | |      Aspect        | |      Agent      | |        User         | |
| +-----------------+ +--------------------+ +-----------------+ +---------------------+ |
+---------------------------------------------------------------------------------------+
```

## Domain Layer

The domain layer is the heart of the application. It contains the core business logic and data
models, which are completely independent of any external dependencies.

Key components of the domain layer include:

- **Node:** The fundamental building block in Antbox. It represents a piece of content, such as a
  file or a folder.
- **Aspect:** Defines the schema for a node's metadata. Aspects allow you to create custom content
  types with their own unique properties.
- **User & Group:** Represents users and groups for authentication and authorization.
- **AI Models:** Defines the domain models for AI agents and their interactions.

## Application Layer

The application layer acts as an intermediary between the domain and the adapters. It contains the
application-specific business logic and orchestrates the flow of data between the different layers.

Key components of the application layer include:

- **Services:** The application layer is composed of services that provide the core functionality of
  the application. For example, the `NodeService` provides methods for creating, reading, updating,
  and deleting nodes.
- **DTOs (Data Transfer Objects):** Used to transfer data between the application layer and the
  adapters.
- **Interfaces (Ports):** The application layer defines interfaces (ports) that the adapters must
  implement. For example, the `StorageProvider` interface defines the methods that a storage adapter
  must implement to store and retrieve files.

## Adapters Layer

The adapters layer is the outermost layer of the application. It is responsible for interacting with
the outside world, such as databases, file systems, and the web.

Key components of the adapters layer include:

- **Web Server:** The web server adapter is responsible for handling HTTP requests and exposing the
  application's functionality as a RESTful API. Antbox supports multiple web server implementations,
  such as `oak`.
- **Storage Providers:** Storage providers are responsible for storing and retrieving files. Antbox
  provides several storage provider implementations, including a file system provider, a Google
  Drive provider, and an S3 provider.
- **Vector Databases:** Used for semantic search and other AI-powered features.
- **AI Models:** Adapters for different AI models and providers.

This architecture allows for a great deal of flexibility. For example, you can easily swap out the
web server or storage provider without affecting the core business logic of the application.
