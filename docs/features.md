---
name: features
description: Available features documentation
---

# Features

Features are executable server-side modules. Each feature is stored as a configuration record with
metadata and a `run` string containing the runnable function source.

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
	run: string; // JavaScript function source
	createdTime: string;
	modifiedTime: string;
}
```

Raw upload accepts a full JavaScript module, but Antbox persists only the metadata plus `run`. Keep
helper logic inside `run`, because top-level imports/helpers are not stored. Legacy feature records
that still store a full `module` are normalized to `run` on read.

## Upload Module Format

The uploaded module must export a default object that includes a `run` function:

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
		{ name: "suffix", type: "string", required: true },
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
	},
};
```

`run(ctx, args)` receives:

- `ctx.authenticationContext`
- `ctx.nodeService` (NodeServiceProxy)

## Creating a Feature

POST to `/v2/features/-/upload` with `multipart/form-data` and a file in the `file` field.

Note: create/update/delete operations require admin privileges. Listing is available to all users,
but results are filtered by `groupsAllowed` for non-admins.

UUID resolution rules:

- if the uploaded module defines `uuid`, that value is used
- otherwise Antbox uses the uploaded file name without the last extension
- spaces in the file name are replaced with `_`

Validation rules:

- a feature must be exposed as at least one of: action, extension, or AI tool
- automatic triggers (`runOnCreates`, `runOnUpdates`, `runOnDeletes`) are only valid for actions

```javascript
export default {
	uuid: "rename_nodes",
	title: "Rename Nodes",
	description: "Append a suffix",
	exposeAction: true,
	runOnCreates: false,
	runOnUpdates: false,
	runOnDeletes: false,
	runManually: true,
	filters: [],
	exposeExtension: false,
	exposeAITool: false,
	groupsAllowed: [],
	parameters: [
		{ name: "suffix", type: "string", required: true },
	],
	returnType: "void",
	async run(ctx, args) {
		const suffix = String(args.suffix || "");
		const uuids = Array.isArray(args.uuids) ? args.uuids : [];
		for (const uuid of uuids) {
			const node = await ctx.nodeService.get(uuid);
			if (node.isLeft()) continue;
			await ctx.nodeService.update(uuid, { title: `${node.value.title}${suffix}` });
		}
	},
};
```

Example upload:

```bash
curl -sS -X POST "$BASE_URL/v2/features/-/upload" \
  -H "X-Tenant: default" \
  -H "Authorization: Bearer $JWT" \
  -F "file=@./rename_nodes.js;type=application/javascript"
```

## Actions

- List actions: `GET /v2/actions`
- Run action: `POST /v2/actions/{uuid}/-/run` with body `{ uuids: [...], parameters?: {...} }`
- Every action must declare a required `uuids` parameter as `array<string>` in `parameters`

## Extensions

- List extensions: `GET /v2/extensions`
- Execute extension: `GET|POST /v2/extensions/{uuid}/-/exec`

Extension parameters are taken from query params (GET) or request body (POST JSON or form data).

## Exporting a Feature Module

- `GET /v2/features/{uuid}/-/export`
