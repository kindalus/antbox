# Articles

Articles are nodes with mimetype `application/vnd.antbox.article` and localized content metadata.

## Endpoints

- `GET /v2/articles`
- `POST /v2/articles`
- `GET /v2/articles/{uuid}`
- `GET /v2/articles/{uuid}/-/localized?locale=pt`
- `GET /v2/articles/-/fid/{fid}?locale=pt`
- `DELETE /v2/articles/{uuid}`

## Create or replace

`POST /v2/articles` expects multipart form data with a `file` part containing JSON metadata.

If `uuid` is omitted in the JSON payload, the server derives it from the uploaded filename.

### Example metadata JSON

```json
{
  "uuid": "news-2026-03-01",
  "title": "Release Notes",
  "description": "Platform updates",
  "parent": "--root--",
  "articleAuthor": "editor@example.com",
  "properties": {
    "pt": {
      "articleTitle": "Notas de lancamento",
      "articleFid": "notas-de-lancamento",
      "articleResume": "Resumo em portugues",
      "articleBody": "Conteudo completo"
    },
    "en": {
      "articleTitle": "Release Notes",
      "articleFid": "release-notes",
      "articleResume": "English summary",
      "articleBody": "Full content"
    }
  }
}
```

## Localized reads

- `GET /v2/articles/{uuid}/-/localized?locale={locale}` returns one locale variant.
- `GET /v2/articles/-/fid/{fid}?locale={locale}` resolves article by localized fid.
