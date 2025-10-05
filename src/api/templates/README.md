# Antbox Templates

This directory contains template files that can be accessed via the `/v2/templates` API endpoint.

## Available Templates

### Features
- **example-feature** - TypeScript feature template with NodeService integration
- **example-action** - JavaScript action template for processing nodes

### Configuration
- **example-config** - JSON configuration template

## Usage

### List All Templates
```bash
GET /v2/templates
```

Returns:
```json
[
  {
    "uuid": "example-feature",
    "mimetype": "text/typescript",
    "size": 581
  },
  {
    "uuid": "example-action",
    "mimetype": "text/javascript",
    "size": 613
  },
  {
    "uuid": "example-config",
    "mimetype": "application/json",
    "size": 193
  }
]
```

### Get Template Content
```bash
GET /v2/templates/example-feature
```

Returns the template file content with appropriate Content-Type header.

## Adding New Templates

Simply add files to this directory with supported extensions:
- `.ts` - TypeScript (text/typescript)
- `.js` - JavaScript (text/javascript)
- `.json` - JSON (application/json)
- `.md` - Markdown (text/markdown)
- `.txt` - Plain text (text/plain)

The filename (without extension) becomes the template UUID.
