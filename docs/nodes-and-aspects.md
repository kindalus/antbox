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
- `tags`
- `locked`, `lockedBy`, `unlockAuthorizedGroups`
- `workflowInstanceUuid`, `workflowState`

Files, folders, meta nodes, and articles also have `aspects`, `properties`, and `related`. Smart
folders do not: they cannot carry aspects.

`locked`, `lockedBy`, and `unlockAuthorizedGroups` are output-only metadata. Use the lock and unlock
operations to change lock state; creation and metadata updates ignore those fields. Copies start
unlocked.

Descriptions and friendly identifiers must be strings; tags, aspects, and related identifiers must
be arrays of strings, and properties must be an object. Malformed shapes are rejected before
metadata or file content changes. An empty `fid` regenerates it from the title. Null optional
collections use their defaults during creation and leave existing values unchanged during updates;
use empty arrays to clear them. Null descriptions leave existing descriptions unchanged during
updates, while an empty string clears the description.

### File Node Fields

- `size` (bytes, measured from uploaded content; read-only in metadata requests)

Metadata-only file creation starts with a size of zero. File replacement checks permissions, locks,
workflow restrictions, and validation before writing content. Copying or duplicating a file requires
Read and Export on the source parent and Write on the destination parent. File uploads reject
reserved `application/vnd.antbox` MIME types; create those node types through metadata operations
instead.

Raw file exports keep their content and MIME type. Browser responses use `nosniff`, `no-store`, and
a [CSP sandbox](https://www.w3.org/TR/CSP3/#directive-sandbox) that disables scripts, forms, and
external resources in uploaded documents. These URLs are for reading files, not hosting web apps.

### Folder Fields

- `group`
- `permissions` (group/authenticated/anonymous/advanced)
- `onCreate`, `onUpdate`, `onDelete` (feature action strings)
- `onEmbeddingsCreated`, `onEmbeddingsUpdated` (feature action strings, after a child's embeddings
  are stored; resolved against its current parent)

Embedding hooks also accept built-in actions such as
`call_agent agentUuid=classifier runSync=true prompt='Classify'`. Configure classification on
ingestion folders, not review folders, to avoid reclassifying saved results. Runnable recursion is
limited per feature within its asynchronous causal chain (including queued events), not across
independent concurrent executions. Each tenant's engine keeps its own context.

- `filters` (NodeFilters)

Changing a folder's `permissions` requires existing Write permission on both that folder and its
parent. Owner, admin, and root access follow the usual authorization rules. Clients that previously
changed a restricted child folder's permissions using only parent Write must use an authorized
folder writer. Ordinary metadata updates retain the parent Write requirement.

Locking a folder also locks its unlocked descendants, preserving independently locked and
workflow-bound nodes. Unlock the destination folder before creating, uploading, copying, or moving
children into it, including when you own the lock. This prevents new, unlocked children from
bypassing the folder lock. Authorized metadata edits that keep the same parent remain allowed.
Workflow-bound nodes require cancellation or completion before direct lock or unlock operations,
including for administrators.

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

### Reading Stored Markdown Content

`GET /v2/nodes/{uuid}/-/content-md` returns the text stored for semantic search as
`text/markdown; charset=utf-8`, with `X-Content-Type-Options: nosniff` and
`Cache-Control: no-store`. The body excludes the YAML frontmatter. UUIDs and FID-form identifiers
are accepted.

`HEAD` on the same path returns the same status and headers without a body, so it can check whether
a node has content. Neither method reads the file from storage.

The stored text is extracted from the file, so both methods follow the export rules: they require
**Read** and **Export** permissions on the parent folder. Without **Export**, the response is `403`
whether or not content exists, so it does not reveal which files have content.

The response is `404` when the node does not exist, is not a file, has no stored content, or only
has frontmatter stored. Folders, smart folders, articles, and meta nodes are not files, so they
return `404` regardless of **Export**.

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
applied to nodes. They have no node mimetype and are not returned by node searches.

### Aspect Endpoints

| Method and path                   | Access | Description                                       |
| --------------------------------- | ------ | ------------------------------------------------- |
| `GET /v2/aspects`                 | all    | List built-in and custom aspects, sorted by title |
| `GET /v2/aspects/{uuid}`          | all    | Get one aspect                                    |
| `POST /v2/aspects/-/upload`       | admin  | Create or replace an aspect from a JSON file      |
| `DELETE /v2/aspects/{uuid}`       | admin  | Delete an aspect                                  |
| `GET /v2/aspects/{uuid}/-/export` | all    | Download the aspect as `<uuid>.json`              |

There is no update endpoint. Upload the full aspect again with the same `uuid` to change it: the
upload replaces the stored aspect (no merge) and resets both `createdTime` and `modifiedTime`.

The upload is `multipart/form-data` with the JSON file in the `file` field:

```bash
curl --fail-with-body "$BASE_URL/v2/aspects/-/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant: $TENANT" \
  -F "file=@./book.json;type=application/json"
```

The `uuid` comes from the JSON `uuid` field. When it is missing, Antbox uses the uploaded file name
without its last extension, with spaces replaced by `-` (`book.json` becomes `book`). The result
must match `^([a-z][a-z0-9-]{3,}|--[a-z][a-z0-9-]+--)$`: kebab-case with at least 4 characters.
The `--name--` form is the convention for built-in aspects; upload does not block it, but do not use
it for your own aspects.

### AspectData

```ts
interface AspectData {
	uuid: string; // from the JSON "uuid" or the uploaded file name, see above
	title: string; // at least 3 characters
	description?: string;
	filters: NodeFilters; // required; [] when omitted on upload
	properties: AspectProperty[]; // [] when omitted on upload
	createdTime: string;
	modifiedTime: string;
}
```

`filters` and `validationFilters` accept only filter arrays (1D for AND, 2D for OR), not filter
strings. They are checked against one node at a time, so `fulltext` filters are rejected in both.
`@field` conditions are checked against that node's parent folder, for example
`["@aspects", "contains", "reseller"]` limits an aspect to nodes in folders with the `reseller`
aspect (see [Parent-folder filters](node-querying.md#parent-folder-filters-field)).

### AspectProperty

```ts
interface AspectProperty {
	name: string; // kebab-case, /^[a-z][a-z0-9-]{2,}$/
	title: string;
	type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "date";
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

Array properties require arrays. When `arrayType` is present, every element must have that type;
UUID values use Antbox identifiers and must reference existing nodes. Invalid UUID shapes are
rejected before reference lookups. Optional properties may be absent, `null`, or an empty string.
In a property of any type other than `string` (`number`, `boolean`, `date`, `uuid`, `array`,
`object`), an empty string means "no value", exactly like `null`: on create and update it is
removed, or replaced by `defaultValue` when there is one, and a `required` property then fails. A
node that already stores `""` in such a property is cleaned the same way on its next update. In a
`string` property, `""` is kept as a value. Date properties accept ISO dates (`2026-10-22`) and ISO timestamps, including UTC, explicit offsets,
or local time (`2026-10-22T12:30`). Invalid calendar dates and ambiguous numeric strings are
rejected. Object properties require JSON objects rather than arrays or scalar values. `string`,
`number`, and `boolean` values must already have that JSON type; they are not coerced.

Validation fields:

- `required`: the value cannot be absent, `null`, or an empty string.
- `validationList`: checked only for `string`, `number`, and `array` with `arrayType: "string"`;
  ignored for other types, including `array` of numbers. Matching is strict: `100` does not match
  `"100"`. Each element of an array must be in the list.
- `validationRegex`: checked only for `string` and `array` with `arrayType: "string"` (each
  element). It must be a valid JavaScript regular expression: upload rejects one that does not
  compile. An aspect stored with an invalid pattern before this check makes every create or update
  that gives the property a value fail with a validation error until the aspect is fixed.
- `validationFilters`: checked only for `uuid` and `array` with `arrayType: "uuid"`. Every
  referenced node must satisfy the filters. `@` (parent folder) conditions are checked against the
  parent folder of each referenced node.
- `readonly`: write-once. The value can be set on create, and on any update while the node has no
  stored value for it (absent, `null`, or `""` in a non-`string` property). Once a value is stored,
  later updates keep it: the supplied value, including `null`, is replaced by the stored one. The
  update still succeeds, so that write is silently discarded.
- `defaultValue`: applied when the value is absent, `null`, or `""` in a non-`string` property.
  Upload rejects a default that breaks the property's own rules: its `type` (and `arrayType`, so
  `array` and `object` properties cannot have a default), `validationList` and `validationRegex`.
  An empty string is not a valid default for non-`string` types. A `uuid` default is checked for
  shape only, not for an existing node.

Upload also rejects an aspect with two properties of the same `name`, and stores only the fields
listed in `AspectData` and `AspectProperty` above: other keys are dropped.

Existing records are not repaired automatically. Stored metadata with malformed collection shapes,
invalid aspect UUIDs or objects, or non-ISO dates may need correction before the next edit passes
validation. Back up affected records before repairing them.

`searchable` is an optional boolean. When enabled, the property's value is part of the node's
full-text search metadata when that node is created or updated. Changing an aspect does not reindex
existing nodes. Searchable object and array values are indexed as JSON text. See
[Full-text search](node-querying.md#full-text-search).

### Example Aspect

Save as `book.json` and upload it with `POST /v2/aspects/-/upload`:

```json
{
	"uuid": "book",
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
	"aspects": ["book"],
	"properties": {
		"book:author": "Jane Doe",
		"book:isbn": "978-1-2345-6789-0"
	}
}
```

On every create and update, `properties` is reduced to the keys declared by the node's current
aspects; other keys are dropped. A node without aspects always has `properties: {}`.

On update, the supplied `properties` are merged into the stored ones, so omitted keys keep their
values. Setting a key to `null` (or to `""` in a non-`string` property) removes it, or resets it to
the property's `defaultValue` when there is one; a `readonly` property that has a stored value keeps
it. Removing an aspect from `aspects` drops its properties.

### Changing or Deleting an Aspect

- Re-uploading an aspect does not re-validate or reindex the nodes that use it. The new rules apply
  on each node's next update, which can then fail validation.
- Deleting an aspect does not change the nodes that use it. Their next update fails with
  `Aspect(s) not found: <uuid>` unless that update also removes the uuid from `aspects`. Creating a
  node with a missing aspect fails the same way.

### Filling Aspects with AI (`auto_tag`)

`auto_tag` is a built-in action, run manually. It needs AI to be configured for the tenant.

```bash
curl --fail-with-body "$BASE_URL/v2/actions/auto_tag/-/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant: $TENANT" \
  -H "Content-Type: application/json" \
  -d '{"uuids":["node-1"],"parameters":{"aspects":["book"]}}'
```

Both `uuids` (nodes) and `aspects` (aspect uuids) are required, non-empty string arrays. For each
readable node and each aspect, `auto_tag`:

1. reads the node's stored content markdown. Every node has one: its frontmatter (the node's
   metadata), followed by the text extracted from the file once AI indexing has processed it.
   Nodes without extracted text are tagged from their metadata alone;
2. sends that markdown and the aspect definition to the built-in `--aspect-field-extractor--`
   agent;
3. keeps only the returned keys that are property names declared by the aspect. When none is left,
   the node is skipped for that aspect: it is not updated and the aspect is not added;
4. updates the node, adding the aspect to `aspects` if needed and merging the values into
   `properties`. The update goes through the usual validation.

Each aspect is one update, validated as a whole. If a required property was not extracted and has
no stored or default value, an extracted value has the wrong type or is not allowed, a `uuid` value
does not reference an existing node, or the node does not satisfy the aspect's `filters`, the update
is rejected and every value extracted for that aspect is lost. Extracted values for `readonly`
properties that already have a stored value are ignored. An aspect stored with an invalid
`validationRegex` rejects an update that gives that property a value, like any other validation
failure.

Values are not coerced. Missing parameters or an unavailable agents engine return an error. Any
other failure (unreadable node, missing aspect, agent error, unparsable answer, rejected update) is
only logged and the next node or aspect is processed: the action still reports success. Check the
nodes afterwards to see which were updated.
