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

## Authentication

By default, Antbox allows anonymous access to public resources. However, for creating, updating, or accessing private content, you'll need to authenticate.

### Quick Login

The sandbox mode uses the root user with password `demo`. Here's how to log in:

```bash
# Login and get JWT token
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)"
```

**Response:**

```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

The server also automatically sets an HTTP-only cookie for browser-based applications.

### Authentication Methods

Antbox supports multiple authentication methods:

1. **Bearer Token** (for APIs and mobile apps)
2. **HTTP-only Cookies** (for web applications - automatic)
3. **API Keys** (for integrations)

For detailed information, see the [Authentication Guide](./authentication.md).

## Interacting with the API

Now that you understand authentication, let's interact with the API. You can use a tool like `curl` or an API client like Postman.

### Example 1: Create a Folder (with Bearer Token)

```bash
# First, get your JWT token from login
JWT="<your-jwt-token-here>"

# Create a folder
curl -X POST http://localhost:7180/v2/nodes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "title": "My First Folder",
    "mimetype": "application/vnd.antbox.folder"
  }'
```

### Example 2: Create a Folder (with Cookie)

```bash
# Login and save cookie
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)" \
  -c cookies.txt

# Create a folder using saved cookie
curl -X POST http://localhost:7180/v2/nodes \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "My First Folder",
    "mimetype": "application/vnd.antbox.folder"
  }'
```

**Response:**

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

### Example 3: List Nodes

```bash
# List all nodes in root folder
curl http://localhost:7180/v2/nodes?parent=--root-- \
  -H "Authorization: Bearer $JWT"
```

## Next Steps

Now that you have a basic understanding of how to run and interact with Antbox, you can start exploring its more advanced features:

- **Authentication:** Learn about all authentication methods and security best practices in the [Authentication Guide](./authentication.md).
- **Nodes and Aspects:** Learn how to create your own custom content types using [aspects](./nodes-and-aspects.md).
- **Features:** Write your own server-side logic with [features](./features.md).
- **AI Agents:** Build your own conversational AI with [agents](./ai-agents.md).
