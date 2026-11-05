---
name: audit
description: Audit log and deleted-nodes queries
---

# Audit

Antbox writes node lifecycle events into an event store (`NodeCreated`, `NodeUpdated`,
`NodeDeleted`).

## Endpoints

- `GET /v2/audit/{uuid}?mimetype={mimetype}`
- `GET /v2/audit/-/deleted?mimetype={mimetype}`

Both endpoints require `mimetype` query parameter.

Events are stored in one stream per node and mimetype. Pass the node's current mimetype to read its
audit log. The response also includes that node's updates from `application/octet-stream`, where
older versions recorded them, sorted by `occurredOn`. `sequence` is only meaningful within a single
stream, so merged results can repeat a value.

If a file upload changes a node's mimetype, its earlier events stay in the stream of the previous
mimetype.

## Examples

```bash
curl "http://localhost:7180/v2/audit/123e4567?mimetype=application/pdf" \
  -H "Authorization: Bearer $JWT"
```

```bash
curl "http://localhost:7180/v2/audit/-/deleted?mimetype=application/pdf" \
  -H "Authorization: Bearer $JWT"
```

## Access control

Audit queries are admin-only.
