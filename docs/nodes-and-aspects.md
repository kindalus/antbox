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

## Aspects

Aspects are **configuration records**, not nodes. They define reusable metadata schemas that can be
applied to nodes.

Note: creating, updating, or deleting aspects is restricted to admins. Listing and fetching aspects
is available to all users.

### AspectData

```ts
interface AspectData {
  uuid: string;              // generated on create
  title: string;
  description?: string;
  filters: NodeFilters;      // optional constraints
  properties: AspectProperty[];
  createdTime: string;
  modifiedTime: string;
}
```

### AspectProperty

```ts
interface AspectProperty {
  name: string;              // /^[a-zA-Z_][_a-zA-Z0-9_]{2,}$/
  title: string;
  type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "file";
  arrayType?: "string" | "number" | "uuid";
  contentType?: string;
  readonly?: boolean;
  searchable?: boolean;
  validationRegex?: string;
  validationList?: string[];
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

Set `aspects` and `properties` using the key format `aspectUuid:propertyName`:

```json
{
  "aspects": ["<aspect-uuid>"],
  "properties": {
    "<aspect-uuid>:author": "Jane Doe",
    "<aspect-uuid>:isbn": "978-1-2345-6789-0"
  }
}
```
