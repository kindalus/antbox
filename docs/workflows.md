---
name: workflows
description: Workflow definitions and instances API
---

# Workflows

Antbox workflows define state machines for nodes and track runtime instances.

Important: workflow routes are mounted directly under `/v2`.

## Workflow definitions API

- `GET /v2/workflow-definitions`
- `POST /v2/workflow-definitions`
- `GET /v2/workflow-definitions/{uuid}`
- `DELETE /v2/workflow-definitions/{uuid}`
- `GET /v2/workflow-definitions/{uuid}/-/export`

`POST /v2/workflow-definitions` creates or replaces by `uuid`.

Creating, replacing, and deleting definitions requires an administrator. Definitions can be read by
other users so they can select and run permitted workflows.

### Definition shape

```ts
interface WorkflowData {
	uuid: string;
	title: string;
	description?: string;
	states: WorkflowState[];
	availableStateNames: string[];
	filters: NodeFilters;
	participants: string[];
	createdTime: string;
	modifiedTime: string;
}
```

### Minimal create example

```json
{
	"title": "Document Approval",
	"description": "Simple draft/approved flow",
	"availableStateNames": ["Draft", "Approved"],
	"filters": [["mimetype", "!=", "application/vnd.antbox.folder"]],
	"participants": ["--admins--"],
	"states": [
		{
			"name": "Draft",
			"isInitial": true,
			"transitions": [
				{ "signal": "approve", "targetState": "Approved", "groupsAllowed": ["--admins--"] }
			]
		},
		{
			"name": "Approved",
			"isFinal": true
		}
	]
}
```

## Workflow instances API

- `GET /v2/workflow-instances`
- `GET /v2/workflow-instances?workflowDefinitionUuid={uuid}`
- `GET /v2/workflow-instances/{uuid}`
- `POST /v2/workflow-instances/-/start`
- `POST /v2/workflow-instances/{uuid}/-/transition`
- `POST /v2/workflow-instances/{uuid}/-/cancel`
- `PATCH /v2/workflow-instances/{uuid}/-/update`
- `PUT /v2/workflow-instances/{uuid}/-/update-file`

`GET /v2/workflow-instances` returns active workflow instances only.

For instance routes, `{uuid}` is always the workflow instance UUID.

### Start

```json
{
	"nodeUuid": "node-uuid",
	"workflowDefinitionUuid": "workflow-uuid",
	"participants": ["--admins--"]
}
```

`participants` is optional and can only narrow access relative to the workflow definition. For
public workflow definitions (`participants: []`), non-empty overrides are rejected. Restricted
definitions reject empty overrides because an empty participant list grants public access.

### Transition

```json
{
	"signal": "approve",
	"message": "Reviewed and approved"
}
```

### Update node in workflow

`PATCH /v2/workflow-instances/{uuid}/-/update` uses the workflow instance UUID. It accepts content
fields: `title`, `fid`, `description`, `tags`, `aspects`, `properties`, `related`,
`articleProperties`, `articleAuthor`, and `articleBodyContentType`. Other fields are ignored;
workflow state and locks are managed by transitions, and content editing does not grant permission
to move nodes or change folder permissions and hooks.

`PUT /v2/workflow-instances/{uuid}/-/update-file` expects multipart form data with a `file` part.

## Access and behavior

- `participants` controls who can start, view, and interact with instances.
- `transition.groupsAllowed` controls who may trigger a transition.
- `state.groupsAllowedToModify` controls who may update node metadata or file content in that state.
- Final state transition unlocks the node and clears workflow metadata on the node.
- Cancel is allowed to the workflow owner or admins.
- Running instances cannot be deleted; cancel or complete them first.
- Operations for the same node are serialized within one workflow engine, including starts through a
  friendly identifier. Multiple server processes still require external coordination.
- If a node write fails during a transition or cancellation, the engine attempts to restore the
  previous instance state so the operation can be retried. Configuration and node repositories do
  not share a transaction: a failed restoration requires operator repair, and action side effects
  are not rolled back. Actions that may be retried should be idempotent.

Transition actions run with the initiating caller's context. They do not receive workflow-instance
authority, so actions that use the normal node SDK to edit the workflow-owned node, including rename
actions, are rejected while the workflow is active. Use the workflow content-update operations for
permitted edits. Workflow action authority needs a separate review before such actions can modify
the node.

## Builtins

The system always exposes these immutable builtin workflow definitions:

- `builtin-quick-task`
- `builtin-standard-task`
