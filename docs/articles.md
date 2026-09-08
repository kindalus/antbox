---
name: articles
description: Articles API and localized content model
---

# Articles

Articles are nodes with mimetype `application/vnd.antbox.article` and localized content metadata.

## Endpoints

- `GET /v2/articles`
- `POST /v2/articles`
- `GET /v2/articles/{uuid}`
- `GET /v2/articles/{uuid}/-/localized?locale=pt`
- `GET /v2/articles/{uuid}/-/render?locale=pt&format=html`
- `GET /v2/articles/-/fid/{fid}?locale=pt`
- `GET /v2/articles/-/fid/{fid}/render?locale=pt&format=html`
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
	"parent": "articles",
	"articleAuthor": "editor@example.com",
	"articleBodyContentType": "markdown",
	"aspects": ["announcement"],
	"properties": {
		"announcement:title": "Release Notes"
	},
	"articleProperties": {
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

`articleProperties` contains localized article fields. `properties` contains only aspect properties,
using the same `<aspect-uuid>:<property-name>` keys as the nodes API. `aspects` lists the applied
aspect UUIDs. Aspect definitions and their `filters` are validated before the article is stored.

On create, `articleProperties`, `articleAuthor`, and `parent` are required. On replacement, omitted
fields preserve their current values. Supplying `aspects: []` removes every aspect and its
properties. The service generates missing `articleFid` values and derives `title` from the localized
article title when needed.

## Generic nodes API

Articles can also be created through `POST /v2/nodes`. This path uses the persisted node contract:
`articleProperties` and `articleAuthor` must be supplied, and each locale must include a non-empty
`articleFid`. It does not generate `articleFid` or derive the node `title`.

## Body content type

`articleBodyContentType` applies to every localized body in the article. Accepted values are
`markdown`, `html`, and `text`. Existing articles and new requests that omit it use `text`.

## Localized reads

- `GET /v2/articles/{uuid}/-/localized?locale={locale}` returns one locale variant.
- `GET /v2/articles/-/fid/{fid}?locale={locale}` resolves article by localized fid.

## Rendering

Render by UUID or localized FID:

- `GET /v2/articles/{uuid}/-/render?locale={locale}&format={format}`
- `GET /v2/articles/-/fid/{fid}/render?locale={locale}&format={format}`

`locale` defaults to `pt`, and `format` defaults to `html`. Supported output formats:

- `html`: converts Markdown to HTML, wraps text in `<pre>`, and sanitizes the resulting HTML.
- `text`: returns text directly or extracts it from sanitized HTML or rendered Markdown.
- `markdown`: returns Markdown and text bodies unchanged; HTML bodies return `400`.

The response body contains the rendered content directly. Its content type is `text/html`,
`text/markdown`, or `text/plain`, with UTF-8 encoding.
