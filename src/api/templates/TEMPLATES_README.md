# Antbox Templates

This directory contains example templates for creating various types of features and components in Antbox. These templates demonstrate best practices and provide starting points for common use cases.

## Overview

The templates include:

1. **Actions** - Server-side JavaScript that implements the Feature interface and processes selected nodes
2. **Extensions** - Server-side JavaScript that implements the Feature interface and serves as custom API endpoints
3. **Aspects** - JSON configurations that define metadata schemas for categorizing and enriching content
4. **AI Agents** - JSON configurations that define conversational AI assistants with specialized capabilities

## Templates Included

### Actions

#### Factura Date Prefix Action (`example-action.js`)

**Purpose:** Automatically adds submission dates to PDF invoice titles

**Features:**

- Implements the Feature interface with embedded configuration
- Runs manually and automatically on document creation
- Only processes PDF files with "factura" in the title
- Restricted to "accounts" group members
- Adds date prefix in yyyy-mm-dd format
- Skips files that already have date prefixes

**Usage Example:**

```javascript
// Input: "factura-001.pdf"
// Output: "2024-03-15 factura-001.pdf"
```

### Extensions

#### Folder Content Summary Extension (`example-feature.js`)

**Purpose:** Generates HTML reports showing comprehensive folder statistics

**Features:**

- Implements the Feature interface with embedded configuration
- Displays file/folder counts and total sizes
- Shows file type breakdown with top 10 categories
- Includes size distribution visualization
- Responsive HTML layout with professional styling
- Runs with admin privileges

**Usage Example:**

```
GET /extensions/folder-content-summary?folderId=<uuid>
```

### Aspects

#### Movie Aspect (`movie-aspect.json`)

**Purpose:** JSON configuration for cataloging movies and films

**Properties Include:**

- Basic information (title, year, duration, plot)
- Classification (genre, ratings, content warnings)
- Production details (director, cast, studio, budget)
- Technical specifications (resolution, aspect ratio, sound)
- Personal tracking (watch status, rating, notes)

**Applied to:** Video files, movie-related documents, media folders

#### AWB (Air Waybill) Aspect (`awb-aspect.json`)

**Purpose:** JSON configuration for air cargo shipping documents

**Properties Include:**

- AWB identification and numbering
- Shipper and consignee information
- Flight and routing details
- Cargo specifications and handling requirements
- Charges and payment information
- Status tracking and customs data

**Applied to:** PDF documents, shipping manifests, logistics folders

### AI Agents

#### Document Summarizer Agent (`document-summarizer-agent.json`)

**Purpose:** JSON configuration for an AI agent that analyzes documents and generates summaries

**Features:**

- Processes multiple document formats (PDF, text, images)
- Extracts key information and topics
- Generates structured summaries
- Updates node description fields automatically
- Uses reasoning capabilities for better understanding

**Summary Format:**

```
**Document Type:** [Type identification]
**Purpose:** [Main objective]
**Key Details:** [Essential information]
**Topics:** [Main subjects covered]
**Summary:** [2-3 sentence overview]
```

## Installation and Usage

### 1. Upload Features

Upload feature JavaScript files to the `/features` endpoint. The Feature interface implementation includes all necessary metadata:

```bash
# Upload the action
curl -X POST /features \
  -F "file=@example-action.js"

# Upload the extension
curl -X POST /features \
  -F "file=@example-feature.js"
```

### 2. Create Aspects

Use the aspect creation API with the JSON configurations:

```bash
# Create movie aspect
curl -X POST /aspects \
  -H "Content-Type: application/json" \
  -d @movie-aspect.json

# Create AWB aspect
curl -X POST /aspects \
  -H "Content-Type: application/json" \
  -d @awb-aspect.json
```

### 3. Deploy AI Agents

Upload agent JSON configurations:

```bash
curl -X POST /agents \
  -H "Content-Type: application/json" \
  -d @document-summarizer-agent.json
```

## Customization Guide

### Modifying Features

1. **Change Filters:** Update the `filters` array in the Feature object to target different file types
2. **Adjust Permissions:** Modify `groupsAllowed` and `runAs` to control access
3. **Update Logic:** Edit the `run` method to change processing behavior

Example filter changes:

```javascript
// In the Feature object
filters: [["mimetype", "==", "application/pdf"]], // Target all PDFs

filters: [["parent", "==", "folder-uuid"]], // Target specific folder

filters: [ // Multiple conditions
  ["mimetype", "==", "application/pdf"],
  ["size", ">", 1000000]
]
```

### Modifying Extensions

1. **Change Parameters:** Update the `parameters` array in the Feature object
2. **Modify Output:** Change `returnContentType` and `run` method logic
3. **Add Authentication:** Adjust `runAs` and `groupsAllowed` in the Feature object

### Extending Aspects

1. **Add Properties:** Extend the properties array in the JSON with new fields
2. **Update Validation:** Add regex patterns or value lists for validation
3. **Modify Filters:** Change which node types the aspect applies to

Example new property:

```json
{
  "name": "custom_field",
  "title": "Custom Field",
  "type": "string",
  "required": false,
  "searchable": true,
  "validationRegex": "^[A-Z]{3}-\\d{4}$"
}
```

### Customizing AI Agents

1. **Adjust Temperature:** Change the `temperature` value in JSON for more/less creative responses
2. **Modify Instructions:** Update `systemInstructions` for different behavior
3. **Enable Tools:** Set `useTools: true` in the JSON configuration

## Best Practices

### Security

- Always validate input parameters
- Use appropriate `runAs` settings (user vs admin)
- Implement proper error handling
- Escape HTML output to prevent XSS

### Performance

- Use filters to limit processing scope
- Implement pagination for large datasets
- Cache expensive operations when possible
- Set reasonable token limits for AI agents

### Maintainability

- Include comprehensive JSDoc comments
- Use descriptive variable and function names
- Implement proper error messages
- Version your features appropriately

### Testing

- Test with various file types and sizes
- Verify permission restrictions work correctly
- Test error conditions and edge cases
- Validate output formats and content

## Common Patterns

### Error Handling

```javascript
try {
  const result = await someOperation();
  if (result.isLeft()) {
    return {
      success: false,
      error: result.value.message,
    };
  }
  // Process success case
} catch (error) {
  return {
    success: false,
    error: `Unexpected error: ${error.message}`,
  };
}
```

### Node Processing Loop

```javascript
// Inside the Feature's run method
const results = [];
for (const nodeUuid of args.uuids || []) {
  const nodeResult = await nodeService.get(authenticationContext, nodeUuid);

  if (nodeResult.isRight()) {
    // Process node
    const processed = await processNode(nodeResult.value);
    results.push(processed);
  } else {
    results.push({
      uuid: nodeUuid,
      error: "Failed to fetch node",
    });
  }
}
```

### HTML Generation

```javascript
function generatePage(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(data.title)}</title>
  <style>/* CSS styles */</style>
</head>
<body>
  <h1>${escapeHtml(data.title)}</h1>
  <!-- Content -->
</body>
</html>`;
}
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Check `groupsAllowed` settings in Feature object
   - Verify user group membership
   - Ensure `runAs` is appropriate

2. **Feature Not Running**
   - Verify filters match target nodes in Feature object
   - Check feature implements the Feature interface correctly
   - Review execution logs

3. **JavaScript Errors**
   - Ensure proper Feature interface implementation
   - Validate input parameters in run method
   - Check return value formats match returnType

4. **Performance Issues**
   - Optimize database queries
   - Implement proper pagination
   - Review filter efficiency

### Debugging Tips

- Use console.log for debugging (logs appear in server logs)
- Test with small datasets first
- Verify Feature object configuration matches implementation
- Ensure run method signature matches: `async run(ctx, args)`
- Check network connectivity for external API calls

## Support

For additional help:

- Review the main Antbox documentation
- Check the API reference
- Examine existing built-in features for patterns
- Contact the development team for complex customizations

## License

These templates are provided as examples and can be modified freely for your use cases.
