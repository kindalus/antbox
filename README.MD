# Antbox

Antbox is a smart and flexible ECM designed to provide powerful solutions for content storage, retrieval, and manipulation. Built with Deno, it comes packed with features that make it suitable for various applications and organizational needs.

## Features

- **Multi-tenancy:** Efficiently manage multiple tenants within a single instance.
- **Extensibility:** Add custom data types through named aspects.
- **Programmatic Behavior:** Define behaviors and logic using JavaScript scripts (referred to as actions).
- **Integration with Custom Endpoints:** Connect with other services and data sources.
- **Folder-based Security:** Secure your content through a hierarchical folder-based access control system.

## Installation

Antbox offers several modes of installation to suit different requirements:

### Totally Volatile Server

Run a completely in-memory server using the `sandbox.ts` file.

```shell
deno run --allow-net sandbox.ts
```

### PouchDB and Flat File Repository

Set up a persistent database using PouchDB and a flat file repository by running the demo.ts file.

```shell
deno run --allow-read --allow-write --allow-net demo.ts [data_dir]
```

Run with --help parameters for more info

```shell
deno run --allow-read --allow-write --allow-net demo.ts --help
```

### Totally Customized Installation

You can also build and configure Antbox according to your unique requirements.

### Docker Image

Antbox is also available as a Docker image, providing an easy way to run the server within a containerized environment.

```shell
docker pull antbox-image:latest
docker run -p 7180:7180 antbox-image
```

## Documentation

For more details on configuration, customization, and usage, please refer to the official documentation.

- [Understanding Nodes and Aspects](./undestanding_node_and_aspects.md)
- [Antbox Storage and Persistence Providers](./providers.md)
- [The Power of Node Behaviors in AntBox ECM Actions](./actions.md)
- [Superior Security in AntBox ECM](./security.md)
- [Unlocking the Potential with Antbox ECM Extensions](./ext.md)

### Contributing

If you want to contribute to the Antbox project, please read our contributing guidelines.

### License

Antbox is licensed under the MIT License.
