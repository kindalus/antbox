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

Definition operations are admin-only.

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
public workflow definitions (`participants: []`), non-empty overrides are rejected.

### Transition

```json
{
	"signal": "approve",
	"message": "Reviewed and approved"
}
```

### Update node in workflow

`PATCH /v2/workflow-instances/{nodeUuid}/-/update` uses regular node metadata JSON.

`PUT /v2/workflow-instances/{nodeUuid}/-/update-file` expects multipart form data with a `file`
part.

## Access and behavior

- `participants` controls who can start, view, and interact with instances.
- `transition.groupsAllowed` controls who may trigger a transition.
- `state.groupsAllowedToModify` controls who may update node metadata or file content in that state.
- Final state transition unlocks the node and clears workflow metadata on the node.
- Cancel is allowed to the workflow owner or admins.

## Builtins

The system always exposes these immutable builtin workflow definitions:

- `builtin-quick-task`
- `builtin-standard-task`
