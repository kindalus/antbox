# Antbox REST API Reference

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoints](#core-endpoints)
   - [Authentication API](#authentication-api)
   - [Nodes API](#nodes-api)
   - [Features API](#features-api)
   - [Aspects API](#aspects-api)
   - [Extensions API](#extensions-api)
4. [Request/Response Format](#requestresponse-format)
5. [Error Handling](#error-handling)
6. [Examples](#examples)

## Overview

Antbox provides a comprehensive REST API that follows RESTful principles and supports the
feature-centric architecture. The API enables complete management of nodes, features, aspects, and
all other system entities.

**Base URL**: `http://localhost:7180` (default) **API Version**: v1 **Content Type**:
`application/json` (unless specified otherwise)

## Authentication

Antbox uses JWT (JSON Web Tokens) for authentication with tenant-based access control.

### Headers Required

- `x-access-token`: JWT token obtained from login
- `x-tenant`: Tenant name (defaults to first configured tenant if not specified)
- `Content-Type`: `application/json` (for JSON payloads)

### Login Flow

```http
POST /login/root
Content-Type: text/plain
Body: <sha256-hashed-password>
```

Response:

```json
{
	"jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Core Endpoints

### Authentication API

#### Root Login

```http
POST /login/root
```

Authenticate as root user using SHA256 hashed password.

**Request Body**: Plain text SHA256 hash of password **Response**: JWT token for subsequent requests

---

### Nodes API

Base path: `/nodes`

#### Get Node by UUID

```http
GET /nodes/{uuid}
```

**Parameters**:

- `uuid` (path): Node UUID or FID

**Response**: Node object with metadata and properties

#### List Nodes

```http
GET /nodes
```

**Query Parameters**:

- `parent` (optional): Parent folder UUID
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response**: Array of node objects

#### Create Node

```http
POST /nodes
```

**Request Body**:

```json
{
	"mimetype": "text/plain",
	"title": "My Document",
	"description": "Document description",
	"parent": "folder-uuid",
	"content": "File content here"
}
```

**Response**: Created node object

#### Update Node

```http
PATCH /nodes/{uuid}
```

**Request Body**: Partial node metadata to update

**Response**: Updated node object

#### Delete Node

```http
DELETE /nodes/{uuid}
```

**Response**: `204 No Content` on success

#### Query Nodes

```http
POST /nodes/-/query
```

Advanced node searching with filters.

**Request Body**:

```json
{
	"filters": [
		{
			"property": "mimetype",
			"operator": "equals",
			"value": "text/plain"
		},
		{
			"property": "createdTime",
			"operator": ">=",
			"value": "2024-01-01T00:00:00Z"
		}
	],
	"limit": 100,
	"offset": 0
}
```

#### Copy Node

```http
POST /nodes/{uuid}/-/copy
```

**Request Body**:

```json
{
	"parent": "destination-folder-uuid",
	"title": "New Title (optional)"
}
```

#### Export Node

```http
GET /nodes/{uuid}/-/export
```

Export node in various formats.

**Query Parameters**:

- `format` (optional): Export format (json, raw, etc.)

#### Duplicate Node

```http
GET /nodes/{uuid}/-/duplicate
```

Create a duplicate of the node in the same parent folder.

#### Evaluate Node

```http
GET /nodes/{uuid}/-/evaluate
```

Execute/evaluate node content (for executable node types).

---

### Features API

Base path: `/features`

#### List All Features

```http
GET /features
```

**Response**: Array of all features in the system

#### Get Feature by UUID

```http
GET /features/{uuid}
```

**Response**: Feature object with metadata and parameters

#### Delete Feature

```http
DELETE /features/{uuid}
```

**Response**: `204 No Content` on success

#### Export Feature

```http
GET /features/{uuid}/-/export
```

Export feature as JavaScript file.

**Query Parameters**:

- `type` (optional): Export type (`feature`, `action`, `extension`, `mcp`)

**Response**: JavaScript code as `text/javascript`

#### List Actions

```http
GET /features/-/actions
```

List all features that can be exposed as actions.

**Response**: Array of features with action-specific metadata

#### List Extensions

```http
GET /features/-/extensions
```

List all features that can be exposed as extensions.

**Response**: Array of features with extension-specific metadata

#### List MCP Tools

```http
GET /features/-/mcp-tools
```

List all features that can be exposed as MCP (Model Context Protocol) tools.

**Response**: Array of features with MCP tool metadata

#### Run Feature as Action

```http
GET /features/{uuid}/-/run-action
```

Execute a feature in action mode.

**Query Parameters**:

- `uuids` (required): Comma-separated list of target node UUIDs
- `additionalParams` (optional): JSON-encoded additional parameters

**Response**: Action execution result

#### Run Feature as Extension

```http
GET /features/{uuid}/-/run-ext
POST /features/{uuid}/-/run-ext
```

Execute a feature in extension mode.

**Query/Body Parameters**: Varies by feature parameter definitions

**Response**: Feature-specific response (HTML, JSON, etc.)

---

### Aspects API

Base path: `/aspects`

#### List All Aspects

```http
GET /aspects
```

**Response**: Array of all aspect definitions

#### Get Aspect by UUID

```http
GET /aspects/{uuid}
```

**Response**: Aspect object with properties and validation rules

---

### Extensions API

Base path: `/ext`

#### Execute Extension (GET)

```http
GET /ext/{uuid}
```

Execute a feature as an extension using GET method.

**Query Parameters**: Defined by the specific feature

#### Execute Extension (POST)

```http
POST /ext/{uuid}
```

Execute a feature as an extension using POST method.

**Request Body**: Parameters defined by the specific feature

---

## Request/Response Format

### Standard Node Object

```json
{
	"uuid": "123e4567-e89b-12d3-a456-426614174000",
	"fid": "my-document",
	"title": "My Document",
	"description": "Document description",
	"mimetype": "text/plain",
	"parent": "parent-folder-uuid",
	"owner": "user@example.com",
	"createdTime": "2024-01-01T12:00:00Z",
	"modifiedTime": "2024-01-01T12:00:00Z",
	"size": 1024,
	"fulltext": "Extracted text content",
	"aspects": {
		"custom-aspect": {
			"property1": "value1",
			"property2": "value2"
		}
	}
}
```

### Feature Object

```json
{
	"uuid": "feature-uuid",
	"name": "my-feature",
	"title": "My Custom Feature",
	"description": "Feature description",
	"parameters": [
		{
			"name": "param1",
			"type": "string",
			"required": true,
			"description": "Parameter description"
		}
	],
	"runOnCreates": false,
	"runOnUpdates": false,
	"runManually": true,
	"filters": [],
	"groupsAllowed": ["admins"]
}
```

### NodeFilter Query System

NodeFilter is the core query mechanism in Antbox, providing powerful and flexible content discovery
capabilities. It uses a tuple-based format: `[field, operator, value]`.

#### Supported Filter Operators

**Equality & Comparison:**

- `==`: Exact equality match
- `!=`: Not equal
- `<`, `<=`, `>`, `>=`: Numeric/date comparisons

**Array Operations:**

- `in`: Value exists in array
- `not-in`: Value does not exist in array
- `contains`: Array contains specific value
- `contains-all`: Array contains all specified values
- `contains-any`: Array contains any of the specified values
- `not-contains`: Array does not contain value
- `contains-none`: Array contains none of the specified values

**Text Matching:**

- `match`: Regex-based fuzzy matching (case-insensitive)

#### NodeFilter Structure Types

**1D Filters (AND Logic):**

```json
[
	["mimetype", "==", "application/pdf"],
	["size", ">", 1048576]
]
```

**2D Filters (OR between groups, AND within groups):**

```json
[
	[
		["type", "==", "file"],
		["size", ">", 1000]
	],
	[
		["type", "==", "folder"],
		["name", "match", "important"]
	]
]
```

#### Field Path Resolution

NodeFilter supports deep property access using dot notation:

```json
[
	["metadata.name", "match", "document"],
	["aspects.custom.category", "==", "report"],
	["tags", "contains", "urgent"]
]
```

#### Example Filter Queries

**Find all PDF files larger than 1MB:**

```json
{
	"filters": [
		["mimetype", "==", "application/pdf"],
		["size", ">", 1048576]
	]
}
```

**Find urgent files OR files in specific folder:**

```json
{
	"filters": [
		[["tags", "contains", "urgent"]],
		[["parent", "==", "folder-uuid-here"]]
	]
}
```

**Complex aspect-based filtering:**

```json
{
	"filters": [
		["aspects.document.category", "==", "report"],
		["metadata.name", "match", "2024"],
		["size", ">=", 500000]
	]
}
```

## Error Handling

### Standard Error Response

```json
{
	"error": {
		"code": "NODE_NOT_FOUND",
		"message": "Node with UUID 'invalid-uuid' not found",
		"details": {
			"uuid": "invalid-uuid"
		}
	}
}
```

### HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `204 No Content`: Successful deletion
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., duplicate)
- `422 Unprocessable Entity`: Validation error
- `500 Internal Server Error`: Server error

### Common Error Codes

- `AUTHENTICATION_REQUIRED`: No valid JWT token provided
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `NODE_NOT_FOUND`: Specified node doesn't exist
- `FEATURE_NOT_FOUND`: Specified feature doesn't exist
- `VALIDATION_ERROR`: Request data validation failed
- `DUPLICATE_NODE`: Node with same identifier already exists
- `INVALID_MIMETYPE`: Unsupported or invalid MIME type
- `FOLDER_NOT_FOUND`: Parent folder doesn't exist

## Examples

### Complete Workflow Example

1. **Authenticate**:

```bash
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'mypassword' | sha256sum | cut -d' ' -f1)"
```

2. **Create a folder**:

```bash
curl -X POST http://localhost:7180/nodes \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "x-tenant: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "mimetype": "application/vnd.antbox.folder",
    "title": "My Documents",
    "description": "Document storage folder"
  }'
```

3. **Upload a file**:

```bash
curl -X POST http://localhost:7180/nodes \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "x-tenant: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "mimetype": "text/plain",
    "title": "README.txt",
    "parent": "FOLDER_UUID_FROM_STEP_2",
    "content": "This is my readme file content"
  }'
```

4. **Query files**:

```bash
curl -X POST http://localhost:7180/nodes/-/query \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "x-tenant: demo" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": [
      {
        "property": "mimetype",
        "operator": "equals",
        "value": "text/plain"
      }
    ]
  }'
```

5. **Execute a feature as extension**:

```bash
curl -X GET "http://localhost:7180/ext/FEATURE_UUID?param1=value1&param2=value2" \
  -H "x-access-token: YOUR_JWT_TOKEN" \
  -H "x-tenant: demo"
```

### Feature Development Example

Create a custom feature that processes text files:

```javascript
// text-processor-feature.js
export default async function (context, params) {
	const { nodeService, user } = context;
	const { operation, targetUuids } = params;

	const results = [];

	for (const uuid of targetUuids) {
		const node = await nodeService.get(uuid);

		if (node.mimetype === "text/plain") {
			const content = await nodeService.getContent(uuid);

			let processedContent;
			switch (operation) {
				case "uppercase":
					processedContent = content.toString().toUpperCase();
					break;
				case "lowercase":
					processedContent = content.toString().toLowerCase();
					break;
				case "word_count":
					const wordCount = content.toString().split(/\s+/).length;
					results.push({ uuid, wordCount });
					continue;
			}

			if (processedContent) {
				await nodeService.updateContent(uuid, processedContent);
				results.push({ uuid, processed: true });
			}
		}
	}

	return { results };
}
```

This comprehensive API reference provides everything needed to integrate with and extend the Antbox
ECM system through its feature-centric architecture.
