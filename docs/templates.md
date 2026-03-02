# Templates

Templates are static assets served by the API, commonly used to bootstrap custom features and
configuration snippets.

## Endpoints

- `GET /v2/templates`
- `GET /v2/templates/{uuid}`

## Built-in template ids

- `example-feature`
- `example-action`
- `example-config`

## Examples

```bash
curl http://localhost:7180/v2/templates
```

```bash
curl http://localhost:7180/v2/templates/example-feature
```

Responses use a content type derived from the template file extension (`.ts`, `.js`, `.json`).
