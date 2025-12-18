# Nodes and Aspects

## Nodes

The node is the fundamental building block in Antbox. Everything is a node: a file, a folder, a
user, a group, an aspect, a feature, etc.

A node is a simple data structure that has a set of metadata properties, such as a `uuid`, `title`,
`mimetype`, `owner`, and `parent`. The `mimetype` property is used to determine the type of the
node.

For example, a folder has a mimetype of `application/vnd.antbox.folder`, while a JPEG image has a
mimetype of `image/jpeg`.

### Node Metadata

Here are some of the most important node metadata properties:

- `uuid`: A unique identifier for the node.
- `fid`: A "file identifier" that is derived from the title. It is used to create human-readable
  URLs.
- `title`: The title of the node.
- `mimetype`: The mimetype of the node.
- `parent`: The `uuid` of the parent node.
- `owner`: The email address of the owner of the node.
- `createdTime`: The timestamp of when the node was created.
- `modifiedTime`: The timestamp of when the node was last modified.

## Aspects

Aspects are a powerful feature that allow you to extend the metadata of a node. An aspect is a
reusable set of properties that can be attached to a node.

For example, you could create an `image` aspect that has properties for the width, height, and
resolution of an image. You could then attach this aspect to any node that represents an image.

This allows you to create your own custom content types without having to modify the core data model
of the application.

### Aspect Properties

An aspect is defined by a set of properties. Each property has a name, a type, and a set of
constraints.

Here are some of the most important aspect property attributes:

- `name`: The name of the property.
- `type`: The data type of the property (e.g., `string`, `number`, `boolean`, `date`).
- `title`: A human-readable title for the property.
- `description`: A description of the property.
- `readonly`: Whether the property is read-only.
- `hidden`: Whether the property is hidden from the UI.
- `validations`: A set of validation rules for the property.

### Example

Here is an example of an aspect that defines the metadata for a book:

```json
{
	"title": "Book",
	"name": "book",
	"description": "An aspect for books",
	"mimetype": "application/json",
	"properties": [
		{
			"name": "author",
			"type": "string",
			"title": "Author",
			"description": "The author of the book"
		},
		{
			"name": "publishedDate",
			"type": "date",
			"title": "Published Date",
			"description": "The date the book was published"
		},
		{
			"name": "isbn",
			"type": "string",
			"title": "ISBN",
			"description": "The ISBN of the book"
		}
	]
}
```

Once you have created this aspect, you can attach it to any node to turn it into a "book". You can
then set the `author`, `publishedDate`, and `isbn` properties on the node.
