```mermaid
graph TD
    subgraph User_Interface [User Interface / Client]
        Client([Client/User])
    end

    subgraph API_Layer [API Layer - Oak Framework]
        direction LR
        HttpServer[HTTP Server<br>(main.ts, demo.ts, sandbox.ts)] -->OakRouter{Oak Router/Middleware}
        OakRouter --> AuthMiddleware[Authentication Middleware]
        OakRouter --> Handlers[HTTP Handlers<br>(nodes_handlers.ts, etc.)]
    end

    subgraph Application_Layer [Application Layer]
        direction LR
        NodeService[NodeService]
        AspectService[AspectService]
        AuthService[AuthService]
        ActionService[ActionService]
        OtherAppServices[Other Application Services...]
        StorageProviderInterface{StorageProvider Interface}
    end

    subgraph Domain_Layer [Domain Layer]
        direction LR
        NodeEntity[Node Entity]
        AspectEntity[Aspect Entity]
        UserGroupEntity[User/Group Entities]
        ActionEntity[Action Entity]
        NodeRepositoryInterface{NodeRepository Interface}
    end

    subgraph Adapters_Layer [Adapters Layer]
        direction TB
        subgraph Repository_Adapters [Repository Adapters]
            InMemoryNodeRepo[InMemoryNodeRepository]
            PouchDbNodeRepo[PouchDbNodeRepository]
            FlatFileNodeRepo[FlatFileNodeRepository]
            MongoDbNodeRepo[MongodbNodeRepository]
            NullNodeRepo[NullNodeRepository]
        end
        subgraph Storage_Adapters [Storage Adapters]
            InMemoryStorage[InMemoryStorageProvider]
            FlatFileStorage[FlatFileStorageProvider]
            S3Storage[S3StorageProvider]
            GoogleDriveStorage[GoogleDriveStorageProvider]
            NullStorage[NullStorageProvider]
        end
        subgraph Other_Adapters [Other Adapters]
            OcrAdapter[OCR Engine Adapters<br>(e.g., Tesseract)]
        end
    end

    subgraph Setup_Configuration [Setup & Configuration]
        TenantSetup[Tenant Setup<br>(setup_tenants.ts)]
        ServerConfig[Server Configuration<br>(server_defaults.ts)]
    end

    subgraph External_Services_Persistence [External Services & Persistence]
        direction LR
        Databases[Databases<br>(MongoDB, PouchDB)]
        FileSystem[File System]
        CloudStorage[Cloud Storage<br>(S3, Google Drive)]
        ExternalOcr[External OCR Services]
    end

    %% Dependencies
    Client --> HttpServer

    Handlers --> NodeService
    Handlers --> AspectService
    Handlers --> AuthService
    Handlers --> ActionService
    Handlers --> OtherAppServices

    NodeService --> NodeRepositoryInterface
    NodeService --> StorageProviderInterface
    NodeService --> Domain_Layer
    AspectService --> NodeRepositoryInterface
    AspectService --> Domain_Layer
    AuthService --> Domain_Layer
    ActionService --> Domain_Layer

    Application_Layer --> Domain_Layer

    NodeRepositoryInterface <===> Repository_Adapters
    StorageProviderInterface <===> Storage_Adapters

    Repository_Adapters --> Databases
    Repository_Adapters --> FileSystem
    Storage_Adapters --> FileSystem
    Storage_Adapters --> CloudStorage
    OcrAdapter --> ExternalOcr

    TenantSetup --> NodeService
    TenantSetup --> AspectService
    TenantSetup --> Repository_Adapters
    TenantSetup --> Storage_Adapters
    TenantSetup --> OcrAdapter
    HttpServer --> TenantSetup

    ServerConfig --> TenantSetup
    ServerConfig --> HttpServer

    classDef User_Interface fill:#f9f,stroke:#333,stroke-width:2px;
    classDef API_Layer fill:#ccf,stroke:#333,stroke-width:2px;
    classDef Application_Layer fill:#9cf,stroke:#333,stroke-width:2px;
    classDef Domain_Layer fill:#f9c,stroke:#333,stroke-width:2px;
    classDef Adapters_Layer fill:#cf9,stroke:#333,stroke-width:2px;
    classDef Setup_Configuration fill:#fca,stroke:#333,stroke-width:2px;
    classDef External_Services_Persistence fill:#eee,stroke:#333,stroke-width:2px;
```