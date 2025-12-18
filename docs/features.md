# Features

Features are a powerful mechanism for extending the functionality of Antbox. A feature is a piece of
server-side code, written in TypeScript or JavaScript, that can be executed on demand.

Features can be exposed in three different ways:

1. **Actions:** Executed on a set of nodes.
2. **Extensions:** Exposed as custom API endpoints.
3. **AI Tools:** Used by AI agents.

## Creating a Feature

A feature is simply a TypeScript or JavaScript file that exports a default function. This function
will be executed when the feature is run.

Here is an example of a simple feature that logs a message to the console:

```typescript
export default function (context) {
	console.log("Hello from a feature!");
}
```

To create a feature, you can upload a file to the `/features` endpoint.

## Actions

Actions are features that are designed to be executed on a set of nodes. When an action is run, it
receives a `context` object that contains the `uuids` of the selected nodes.

Here is an example of an action that renames all of the selected nodes:

```typescript
import { NodeService } from "application/node_service.ts";

export default async function (context) {
	const { uuids, container } = context;
	const nodeService = container.resolve(NodeService);

	for (const uuid of uuids) {
		const node = await nodeService.get(context.authContext, uuid);
		if (node.isRight()) {
			await nodeService.update(context.authContext, uuid, {
				title: `${node.value.title} (renamed)`,
			});
		}
	}
}
```

To expose a feature as an action, you need to set the `exposeAsAction` property to `true` in the
feature's metadata.

## Extensions

Extensions are features that are exposed as custom API endpoints. When an extension is run, it
receives a `context` object that contains the `request` and `response` objects from the web server.

This allows you to create custom API endpoints that can do anything you want.

Here is an example of an extension that returns a simple JSON response:

```typescript
export default function (context) {
	const { response } = context;

	response.status = 200;
	response.body = { message: "Hello from an extension!" };
}
```

To expose a feature as an extension, you need to set the `exposeAsExtension` property to `true` in
the feature's metadata.

## AI Tools

AI tools are features that are designed to be used by AI agents. When an AI tool is run, it receives
a `context` object that contains the arguments that were passed to the tool.

This allows you to extend the capabilities of your AI agents with custom logic.

Here is an example of an AI tool that returns the current date and time:

```typescript
export default function (context) {
	return new Date().toISOString();
}
```

To expose a feature as an AI tool, you need to set the `exposeAsAITool` property to `true` in the
feature's metadata. You also need to define the parameters that the tool accepts.
