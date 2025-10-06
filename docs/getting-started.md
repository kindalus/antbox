# Getting Started

This guide will walk you through the process of setting up your development environment and running Antbox for the first time.

## Prerequisites

Before you begin, you will need to have [Deno](https://deno.land/) installed on your system. You can install it using the following command:

```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
```

## Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/kindalus/antbox.git
    cd antbox
    ```

2.  **Start the server:**

    Antbox comes with a few default configurations. The easiest way to get started is to run the server in "sandbox" mode:

    ```bash
    deno run -A main.ts --sandbox
    ```

    This will start the server on port 7180 with an in-memory storage provider and an in-memory node repository. The sandbox configuration is great for development and testing, as it doesn't require any external dependencies.

    You should see the following output:

    ```
    Antbox Server (h3) started successfully on port :: 7180
    ```

## Interacting with the API

Now that the server is running, you can interact with it through the RESTful API. You can use a tool like `curl` or an API client like Postman.

Here's a simple example of how to create a new folder in the root directory:

```bash
curl -X POST http://localhost:7180/v2/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Folder",
    "mimetype": "application/vnd.antbox.folder"
  }'
```

You should receive a JSON response that looks something like this:

```json
{
  "uuid": "<a new uuid>",
  "fid": "my-first-folder",
  "title": "My First Folder",
  "mimetype": "application/vnd.antbox.folder",
  "parent": "--root--",
  "owner": "root@antbox.io",
  "createdTime": "<timestamp>",
  "modifiedTime": "<timestamp>"
}
```

## Next Steps

Now that you have a basic understanding of how to run and interact with Antbox, you can start exploring its more advanced features:

*   **Nodes and Aspects:** Learn how to create your own custom content types using [aspects](./aspects.md).
*   **Features:** Write your own server-side logic with [features](./features.md).
*   **AI Agents:** Build your own conversational AI with [agents](./agents.md).
