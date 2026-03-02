# Documentation API

Antbox serves built-in documentation through dedicated endpoints.

## Endpoints

- `GET /v2/docs` - list available documentation entries
- `GET /v2/docs/{uuid}` - fetch one document body

## Response format

`GET /v2/docs` returns JSON entries:

```json
[
  {
    "uuid": "getting-started",
    "description": "Getting started guide"
  }
]
```

`GET /v2/docs/{uuid}` returns markdown content (`text/markdown`).

## Source of truth

The list endpoint is backed by `docs/index.ts` (`DOCS` constant). A markdown file may exist in
`docs/` but will not appear in `/v2/docs` unless it is registered in that list.
