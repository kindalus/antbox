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
  groupsAllowed: string[];
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
  "groupsAllowed": ["--admins--"],
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
- `GET /v2/workflow-instances/{nodeUuid}`
- `POST /v2/workflow-instances/{nodeUuid}/-/start`
- `POST /v2/workflow-instances/{nodeUuid}/-/transition`
- `POST /v2/workflow-instances/{nodeUuid}/-/cancel`
- `PATCH /v2/workflow-instances/{nodeUuid}/-/update`
- `PUT /v2/workflow-instances/{nodeUuid}/-/update-file`

### Start

```json
{
  "workflowDefinitionUuid": "workflow-uuid",
  "groupsAllowed": ["--admins--"]
}
```

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

- Starting/transitioning/updating instances checks workflow groups and state rules.
- Final state transition unlocks the node and clears workflow metadata on the node.
- Cancel is allowed to the workflow owner or admins.
