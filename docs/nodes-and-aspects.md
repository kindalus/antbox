---
name: nodes-and-aspects
description: Nodes and aspects explained
---

# Nodes and Aspects

## Nodes

A node is the primary content object in Antbox. Nodes live in the NodeRepository and can represent
files, folders, smart folders, meta nodes, or articles.

### Node Types and Mimetypes

- **File nodes**: any mimetype not starting with `application/vnd.antbox`
- **Folder**: `application/vnd.antbox.folder`
- **Smart folder**: `application/vnd.antbox.smartfolder`
- **Meta node**: `application/vnd.antbox.metanode`
- **Article**: `application/vnd.antbox.article`

### Common Metadata Fields

All node types share these fields:

- `uuid`, `fid`, `title`, `description`
- `mimetype`, `parent`, `owner`
- `createdTime`, `modifiedTime`
- `tags`, `fulltext`
- `aspects`, `properties`, `related`
- `locked`, `lockedBy`, `unlockAuthorizedGroups`
- `workflowInstanceUuid`, `workflowState`

### File Node Fields

- `size` (bytes)

### Folder Fields

- `group`
- `permissions` (group/authenticated/anonymous/advanced)
- `onCreate`, `onUpdate`, `onDelete` (feature UUIDs)
- `filters` (NodeFilters)

### Smart Folder Fields

- `filters` (required)

### Article Fields

- `articleProperties` (localized properties)
- `articleAuthor`
- `articleBodyContentType` (`markdown`, `html`, or `text`; defaults to `text`)
- `aspects` and namespaced `properties`, with the same rules as other aspectable nodes

Generic article creation requires a non-empty `articleProperties` map, `articleAuthor`, and a node
`title`. Unlike `POST /v2/articles`, `POST /v2/nodes` does not generate `articleFid` values or
derive `title` from `articleTitle`.

### Downloading Multiple Files

`POST /v2/nodes/-/export-all` accepts JSON `{"uuids":["file-1","file-2"]}` and returns an
`application/zip` attachment named `antbox-export.zip` with `Cache-Control: no-store`. The
corresponding service/proxy method is `exportAll(uuids)` (with an authentication context for
`NodeService`). UUIDs and FID-form identifiers are accepted. Duplicate files are exported once, with
first-occurrence order preserved.

```bash
curl --fail-with-body "$BASE_URL/v2/nodes/-/export-all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"uuids":["file-1","file-2"]}' \
  -o antbox-export.zip
```

- Limits: **100 distinct identifiers** and **100 MiB** of total file content. Metadata is checked
  before reading; actual exported sizes are also checked, including native Google Drive exports.
- Only file nodes are accepted; folders, smart folders, articles, and meta nodes are rejected.
- Each file requires **Read** and **Export** permissions on its parent. All files are checked before
  storage reads, and permissions are rechecked when reading. Anonymous access works only if both
  permissions are explicitly allowed.
- The ZIP is flat. Filenames come from node titles, with path separators, control characters,
  traversal prefixes, and unsafe platform characters sanitized. Collisions are case-insensitive and
  resolved with suffixes such as `report (2).pdf`.
- Downloads are all-or-nothing: invalid input/non-file/size limits return `400`; missing nodes
  return `404`; permission failures return `401` (anonymous) or `403`; unexpected storage/ZIP
  failures return `500`. No partial ZIP is returned.
- The ZIP is built in memory using uncompressed entries. The memory peak is higher than the content
  limit because buffers and the response coexist. Nothing is written to disk or persisted as a node,
  and originals are never deleted. Memory can be reclaimed after the response is sent or cancelled;
  the server cannot confirm that a browser saved the download.

## Aspects

Aspects are **configuration records**, not nodes. They define reusable metadata schemas that can be
applied to nodes.

Note: creating, updating, or deleting aspects is restricted to admins. Listing and fetching aspects
is available to all users.

### AspectData

```ts
interface AspectData {
	uuid: string; // generated on create
	title: string;
	description?: string;
	filters: NodeFilters; // enforced constraints for nodes using the aspect
	properties: AspectProperty[];
	createdTime: string;
	modifiedTime: string;
}
```

### AspectProperty

```ts
interface AspectProperty {
	name: string; // kebab-case, /^[a-z][a-z0-9-]{2,}$/
	title: string;
	type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "date" | "file";
	arrayType?: "string" | "number" | "uuid";
	contentType?: string;
	readonly?: boolean;
	searchable?: boolean;
	validationRegex?: string;
	validationList?: Array<string | number>;
	validationFilters?: NodeFilters;
	required?: boolean;
	defaultValue?: string | number | boolean;
}
```

### Example Aspect

```json
{
	"title": "Book",
	"description": "Metadata for books",
	"filters": [],
	"properties": [
		{ "name": "author", "title": "Author", "type": "string", "required": true },
		{ "name": "isbn", "title": "ISBN", "type": "string", "validationRegex": "^[0-9-]+$" }
	]
}
```

### Applying Aspects to a Node

Set `aspects` and `properties` using the key format `aspectUuid:propertyName`. The node must satisfy
`AspectData.filters`; creation or update returns a validation error otherwise. Empty filters accept
all nodes.

```json
{
	"aspects": ["<aspect-uuid>"],
	"properties": {
		"<aspect-uuid>:author": "Jane Doe",
		"<aspect-uuid>:isbn": "978-1-2345-6789-0"
	}
}
```
