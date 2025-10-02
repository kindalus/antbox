# Understanding Nodes and Aspects

## Table of Contents

- [Introduction](#introduction)
- [Core Concepts](#core-concepts)
  - [1. Node - The Foundation](#1-node---the-foundation)
  - [2. Node Types](#2-node-types)
  - [3. Aspects - Extensible Schema](#3-aspects---extensible-schema)
  - [4. NodeFilter - Query System](#4-nodefilter---query-system)

- [Node Architecture](#node-architecture)
- [Practical Examples](#practical-examples)
- [Advantages of This Approach](#advantages-of-this-approach)
- [Conclusion](#conclusion)

## Introduction

Antbox ECM employs a sophisticated node-based architecture where everything is represented as a
**Node** - the fundamental building block of the system. This approach, combined with **Aspects**
for schema extension, creates a flexible and extensible content management foundation.

This guide explains how nodes, aspects, and the overall architecture work together to provide
powerful content management capabilities.

## Core Concepts

### 1. Node - The Foundation

The `Node` class is the base class for all content in Antbox ECM. Every entity - whether it's a
document, folder, user, or feature - is ultimately a node with common properties:

```typescript
class Node {
	readonly uuid: string; // Unique identifier
	protected _fid: string; // Friendly ID (human-readable)
	protected _title: string; // Display title
	protected _description?: string; // Optional description
	protected _mimetype: string; // Content type
	protected _parent: string; // Parent folder UUID
	protected _owner: string; // Owner email
	protected _createdTime: string; // Creation timestamp
	protected _modifiedTime: string; // Last modification timestamp
	protected _fulltext: string; // Searchable text content
}
```

### 2. Node Types

Antbox implements various specialized node types, each serving specific purposes:

#### Content Nodes

- **FileNode**: Represents documents, images, and other files
  - Extends Node with content storage capabilities
  - Supports binary and text content
  - Automatic MIME type detection

- **FolderNode**: Hierarchical organization containers
  - Contains permission settings for access control
  - Supports nested folder structures
  - Provides security boundaries

- **SmartFolderNode**: Dynamic content aggregation
  - Automatically populated based on filters
  - Real-time content updates
  - Query-based content organization

#### System Nodes

- **UserNode**: Represents system users
  - Contains authentication information
  - Group membership management
  - Permission inheritance

- **GroupNode**: User collections for permission management
  - Defines access levels
  - Supports nested group hierarchies
  - Role-based security

- **AspectNode**: Schema definitions for extending nodes
  - Defines custom properties
  - Validation rules and constraints
  - Applied dynamically to other nodes

#### Specialized Nodes

- **FeatureNode**: JavaScript functions for automation
  - Custom business logic implementation
  - Multiple exposure modes (actions, extensions, MCP tools)
  - Parameter definitions and validation

- **ArticleNode**: Rich text content management
  - Markdown support
  - Publishing workflows
  - Content versioning capabilities

- **MetaNode**: Auxiliary organizational entities
  - Non-content nodes for structure
  - Tagging and categorization
  - Relationship management

- **ApiKeyNode**: Programmatic access credentials
  - Token-based authentication
  - Scope-limited access
  - Audit trail support

### 3. Aspects - Extensible Schema

Aspects provide a powerful mechanism for extending node capabilities without modifying core classes:

```typescript
class AspectNode extends Node {
	protected _filters: NodeFilters; // When this aspect applies
	protected _properties: AspectProperties; // Custom property definitions
}
```

#### Aspect Properties

Each aspect defines a collection of properties that can be added to nodes:

```typescript
interface AspectProperty {
	name: string; // Property identifier
	type: PropertyType; // Data type (string, number, date, etc.)
	required: boolean; // Validation requirement
	defaultValue?: any; // Default value
	validation?: ValidationRules; // Custom validation logic
}
```

#### Aspect Application

Aspects are applied to nodes based on filters:

- **Mimetype filters**: Apply to specific content types
- **Path filters**: Apply to content in specific locations
- **Property filters**: Apply based on existing node properties
- **Custom filters**: Complex rule-based application

### 4. NodeFilter - Query System

NodeFilter is a fundamental concept that enables sophisticated querying and filtering of nodes
throughout Antbox. It provides a unified way to express search criteria, apply business rules, and
automate workflows.

#### Filter Structure

NodeFilter uses a tuple-based approach: `[field, operator, value]`

```typescript
type NodeFilter = [field: string, operator: FilterOperator, value: unknown];

// Examples:
["mimetype", "==", "application/pdf"][("size", ">", 1048576)][
	("aspects.document.category", "==", "report")
];
```

#### Filter Combinations

**1D Filters (AND logic):**

```typescript
// Find PDF files larger than 1MB
[
	["mimetype", "==", "application/pdf"],
	["size", ">", 1048576],
];
```

**2D Filters (OR between groups, AND within groups):**

```typescript
// Find urgent files OR files in specific folder
[[["tags", "contains", "urgent"]], [["parent", "==", "folder-uuid"]]];
```

#### Supported Operations

- **Equality**: `==`, `!=`
- **Comparison**: `<`, `<=`, `>`, `>=`
- **Array operations**: `in`, `not-in`, `contains`, `contains-all`, `contains-any`, `not-contains`,
  `contains-none`
- **Text matching**: `match` (fuzzy regex-based matching)

#### Deep Property Access

NodeFilter supports dot notation for accessing nested properties:

```typescript
// Access node metadata
["metadata.name", "match", "document"][
	// Access aspect properties
	("aspects.custom.category", "==", "important")
][
	// Access array elements
	("tags", "contains", "urgent")
];
```

#### Key Use Cases

1. **Content Discovery**: Power the `/nodes/-/find` API endpoint
2. **Smart Folders**: Dynamic content aggregation based on criteria
3. **Feature Targeting**: Actions and Extensions use filters to determine applicability
4. **Aspect Application**: Aspects use filters to determine which nodes they apply to
5. **Access Control**: Folder-based security leverages filters for permission evaluation

## Node Architecture

### Inheritance Hierarchy

```
Node (base class)
├── FileNode (content storage)
├── FolderNode (container + permissions)
├── SmartFolderNode (dynamic aggregation)
├── MetaNode (organizational)
├── UserNode (identity)
├── GroupNode (permissions)
├── AspectNode (schema definition)
├── FeatureNode (automation logic)
├── ArticleNode (rich content)
└── ApiKeyNode (access credentials)
```

### Node Identification

Nodes support multiple identification methods:

- **UUID**: Globally unique identifier (e.g., `123e4567-e89b-12d3-a456-426614174000`)
- **FID**: Human-friendly identifier (e.g., `my-document`)
- **FID-UUID**: Prefixed FID for internal use (e.g., `--fid--my-document`)

### Content Storage

Nodes can store content through the storage provider abstraction:

```typescript
interface StorageProvider {
	write(uuid: string, content: Uint8Array): Promise<void>;
	read(uuid: string): Promise<Uint8Array>;
	exists(uuid: string): Promise<boolean>;
	delete(uuid: string): Promise<void>;
}
```

## Practical Examples

### Creating a Custom Document Type

```typescript
// 1. Define an aspect for invoice properties
const invoiceAspect = {
	uuid: "invoice-aspect",
	title: "Invoice Properties",
	properties: [
		{ name: "invoiceNumber", type: "string", required: true },
		{ name: "amount", type: "number", required: true },
		{ name: "dueDate", type: "date", required: true },
		{ name: "vendor", type: "string", required: true },
	],
	filters: [
		{ property: "mimetype", operator: "equals", value: "application/pdf" },
		{ property: "title", operator: "contains", value: "invoice" },
	],
};

// 2. Create an invoice document
const invoice = await nodeService.create({
	mimetype: "application/pdf",
	title: "Invoice-2024-001.pdf",
	parent: "invoices-folder-uuid",
	content: pdfContent,
	aspects: {
		"invoice-aspect": {
			invoiceNumber: "INV-2024-001",
			amount: 1250.0,
			dueDate: "2024-02-15",
			vendor: "Acme Corp",
		},
	},
});
```

### Smart Folder for Overdue Invoices

```typescript
const overdueInvoicesFolder = await nodeService.create({
	mimetype: "application/vnd.antbox.smartfolder",
	title: "Overdue Invoices",
	parent: "reports-folder-uuid",
	filters: [
		{
			property: "aspects.invoice-aspect.dueDate",
			operator: "<",
			value: "NOW()",
		},
		{ property: "aspects.invoice-aspect.amount", operator: ">", value: 0 },
	],
	aggregations: [
		{ property: "aspects.invoice-aspect.amount", operation: "sum" },
	],
});
```

### Custom Feature for Invoice Processing

```typescript
// invoice-processor.ts
export default async function (context, params) {
	const { nodeService, uuids } = context;

	for (const uuid of uuids) {
		const node = await nodeService.get(uuid);

		if (node.aspects?.["invoice-aspect"]) {
			// Process invoice data
			const content = await nodeService.getContent(uuid);

			// Update processing status
			await nodeService.update(uuid, {
				processed: true,
				processedTime: new Date().toISOString(),
			});

			// Send notification
			await sendNotification({
				type: "invoice_processed",
				invoice: node.aspects["invoice-aspect"].invoiceNumber,
			});
		}
	}

	return { processed: uuids.length };
}
```

## Advantages of This Approach

1. **Unified Architecture**: Everything is a node, providing consistency across all system entities

2. **Type Safety**: Strong TypeScript typing ensures compile-time validation and better IDE support

3. **Flexible Extension**: Aspects allow adding custom properties without modifying core classes

4. **Dynamic Schema**: Aspects can be applied conditionally based on filters

5. **Hierarchical Security**: Folder-based permissions with inheritance

6. **Content Agnostic**: Supports any content type through MIME type system

7. **Search Integration**: Automatic full-text indexing and searchable metadata

8. **Audit Trail**: Built-in creation/modification tracking

9. **Multi-tenancy**: Complete isolation between tenants

## Conclusion

Antbox ECM's node and aspect architecture provides a powerful foundation for enterprise content
management. The combination of:

- **Nodes** as the universal building block
- **Aspects** for flexible schema extension

- **Smart folders** for dynamic organization
- **Features** for automation and extensibility

Creates a system that is both powerful enough for complex enterprise needs and flexible enough to
adapt to changing requirements. This architecture enables organizations to model their content and
workflows naturally while maintaining the technical benefits of a well-structured, extensible
system.
