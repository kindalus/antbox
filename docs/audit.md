# Audit

Antbox writes node lifecycle events into an event store (`NodeCreated`, `NodeUpdated`,
`NodeDeleted`).

## Endpoints

- `GET /v2/audit/{uuid}?mimetype={mimetype}`
- `GET /v2/audit/-/deleted?mimetype={mimetype}`

Both endpoints require `mimetype` query parameter.

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
