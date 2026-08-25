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
3. **AI Tool** (`exposeAITool`) - exposed to agents as a callable tool

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
	runOnEmbeddingsCreated: boolean;
	runOnEmbeddingsUpdated: boolean;
	runManually: boolean;
	filters: NodeFilter[];
	exposeExtension: boolean;
	exposeAITool: boolean;
	// Optional group UUID used as the complete execution principal group set.
	// The caller identity/email is preserved.
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
		{ name: "uuids", type: "array", arrayType: "string", required: true },
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
- `ctx.logger` (`Logger` instance scoped to the feature/tenant)
- `ctx.requestUrl` (`Readonly<URL>`, HTTP extensions only)

`ctx.requestUrl` comes from the URL received by the HTTP adapter. Antbox does not use `Forwarded` or
`X-Forwarded-*` to build it. It contains the actual `origin` and `pathname`, including any mounted
prefix visible to Antbox. Antbox removes user info, query parameters, and fragments before running
the extension, so credentials and extension arguments are not copied into the context. Actions,
automatic triggers, and AI tools do not receive `requestUrl`.

Example:

```ts
async run(ctx, args) {
	ctx.logger.info("feature started", args);
	return { ok: true };
}
```

## Creating a Feature

POST to `/v2/features/-/upload` with `multipart/form-data` and a file in the `file` field.

Note: create/update/delete operations require admin privileges. `groupsAllowed` defines who may run
a feature. Non-admin list/detail visibility follows the same rule: if a user cannot run a feature,
it is not shown to them. Exporting a feature module is admin-only.

When `runAs` is set, the feature runs with exactly that group in its authentication context; caller
groups are replaced, while the caller identity/email is preserved. This affects authorization and
the group selected for nodes created without an explicit `group`.

UUID resolution rules:

- if the uploaded module defines `uuid`, that value is used (must be camelCase, min 4 chars)
- otherwise Antbox derives the UUID from the uploaded file name: strips the extension then converts
  the basename to camelCase (spaces, hyphens, and underscores act as word separators)

Validation rules:

- a feature must be exposed as at least one of: action, extension, or AI tool
- automatic triggers (`runOnCreates`, `runOnUpdates`, `runOnDeletes`, `runOnEmbeddingsCreated`,
  `runOnEmbeddingsUpdated`) are only valid for actions
- parameter `name` must be camelCase: `/^[a-z][a-zA-Z0-9]*$/` (e.g. `uuids`, `agentUuid`, `runSync`)
- runtime validates and coerces parameters from JSON, query params, and form data before executing
  feature code

```javascript
export default {
	uuid: "renameNodes",
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
		{ name: "uuids", type: "array", arrayType: "string", required: true },
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
  -F "file=@./renameNodes.js;type=application/javascript"
```

## Actions

- List actions: `GET /v2/actions`
- Run action: `POST /v2/actions/{uuid}/-/run` with body `{ uuids: [...], parameters?: {...} }`
- Every action must declare a required `uuids` parameter as `array<string>` in `parameters`

Automatic triggers (all require `exposeAction: true`):

- `runOnCreates` — fires when a node is created in a folder that targets the action
- `runOnUpdates` — fires when a node is updated
- `runOnDeletes` — fires when a node is deleted
- `runOnEmbeddingsCreated` — fires when vector embeddings are first generated for a node
- `runOnEmbeddingsUpdated` — fires when a node's vector embeddings are updated

## Extensions

- List extensions: `GET /v2/extensions`
- Execute extension: `GET|POST /v2/extensions/{uuid}`

Extension parameters are taken from query params (GET) or request body (POST JSON or form data).
Declared parameter types are validated at runtime, with string coercion for numbers, booleans,
dates, arrays, and JSON objects where possible.

An extension can use `ctx.requestUrl` to preserve the origin and API prefix used to invoke it:

```js
async run(ctx, args) {
	const prefix = ctx.requestUrl.pathname.replace(/\/extensions\/[^/]+$/, "");
	const pathname = `${prefix}/nodes/${encodeURIComponent(args.uuid)}/-/export`;
	return { exportUrl: new URL(pathname, ctx.requestUrl.origin).href };
}
```

The value is a dedicated URL copy without query parameters. Changing it cannot change the request.
Do not reconstruct public URLs from `Forwarded` or `X-Forwarded-*` headers inside an extension.

Extensions may return a native `Response` to control the HTTP status, headers, and body. Antbox
passes that response through without applying `returnType` serialization:

```js
async run(ctx, args) {
	const product = await ctx.nodeService.get(args.sku);
	if (product.isLeft()) {
		return Response.json(
			{ ok: false, error: "Product not found" },
			{ status: 404 },
		);
	}

	return Response.json({ ok: true, product: product.value });
}
```

This supports statuses such as `400`, `404`, and `409`. Existing extensions can continue returning
ordinary values; Antbox still serializes those values according to `returnType` and
`returnContentType`.

## AI Tools

- AI tool features are discovered by `AgentsEngine` and exposed to agents by feature `uuid`
- there is no public HTTP route for AI-tool execution
- `groupsAllowed` still applies at execution time, so agents only receive feature-backed tools that
  are runnable for the current authentication context

## Exporting a Feature Module

- `GET /v2/features/{uuid}/-/export`
- admin-only
