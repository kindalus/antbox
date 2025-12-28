# Features

Features are executable server-side modules. Each feature is stored as a configuration record with
metadata and a `module` string that is imported at runtime.

A feature can be exposed as:

1. **Action** (`exposeAction`) - run on a set of nodes
2. **Extension** (`exposeExtension`) - custom HTTP endpoint
3. **AI Tool** (`exposeAITool`) - callable by agents (when enabled)

## FeatureData (stored in config)

```ts
interface FeatureData {
  uuid: string;
  title: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runOnDeletes: boolean;
  runManually: boolean;
  filters: NodeFilter[];
  exposeExtension: boolean;
  exposeAITool: boolean;
  runAs?: string;
  groupsAllowed: string[];
  parameters: FeatureParameter[];
  returnType: "string" | "number" | "boolean" | "array" | "object" | "file" | "void";
  returnDescription?: string;
  returnContentType?: string;
  tags?: string[];
  module: string; // JavaScript/TypeScript module as a string
  createdTime: string;
  modifiedTime: string;
}
```

## Module Format

`module` must export a default object that includes a `run` function:

```ts
export default {
  uuid: "renameNodes",
  title: "Rename Nodes",
  description: "Append a suffix to selected nodes",
  exposeAction: true,
  exposeExtension: false,
  exposeAITool: false,
  runOnCreates: false,
  runOnUpdates: false,
  runOnDeletes: false,
  runManually: true,
  filters: [],
  groupsAllowed: [],
  parameters: [
    { name: "suffix", type: "string", required: true }
  ],
  returnType: "void",
  async run(ctx, args) {
    const { uuids, suffix } = args;
    for (const uuid of uuids || []) {
      const node = await ctx.nodeService.get(uuid);
      if (node.isRight()) {
        await ctx.nodeService.update(uuid, { title: `${node.value.title}${suffix}` });
      }
    }
  }
};
```

`run(ctx, args)` receives:

- `ctx.authenticationContext`
- `ctx.nodeService` (NodeServiceProxy)

## Creating a Feature

POST to `/v2/features/-/upload` with JSON that includes `module` and metadata fields.

Note: create/update/delete operations require admin privileges. Listing is available to all users,
but results are filtered by `groupsAllowed` for non-admins.

```json
{
  "title": "Rename Nodes",
  "description": "Append a suffix",
  "exposeAction": true,
  "runOnCreates": false,
  "runOnUpdates": false,
  "runOnDeletes": false,
  "runManually": true,
  "filters": [],
  "exposeExtension": false,
  "exposeAITool": false,
  "groupsAllowed": [],
  "parameters": [
    { "name": "suffix", "type": "string", "required": true }
  ],
  "returnType": "void",
  "module": "export default { ... }"
}
```

## Actions

- List actions: `GET /v2/actions`
- Run action: `POST /v2/actions/{uuid}/-/run` with body `{ uuids: [...], parameters?: {...} }`

## Extensions

- List extensions: `GET /v2/extensions`
- Execute extension: `GET|POST /v2/extensions/{uuid}/-/exec`

Extension parameters are taken from query params (GET) or request body (POST JSON or form data).

## Exporting a Feature Module

- `GET /v2/features/{uuid}/-/export`
