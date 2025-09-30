# API Key Authentication

This document describes the API key authentication mechanism for the Antbox API.

## Overview

API keys can be provided in two ways, following modern API design standards:

1. **Authorization Header** (Recommended)
2. **Query Parameter** (Fallback)

## Authorization Header (Recommended)

The standard and recommended way to provide an API key is using the `Authorization` header with the `ApiKey` scheme:

```
Authorization: ApiKey <your-api-key>
```

### Examples

```bash
# Basic usage
curl -H "Authorization: ApiKey my-secret-key-123" https://api.example.com/nodes

# With complex API key
curl -H "Authorization: ApiKey sk_live_1234567890abcdef" https://api.example.com/nodes
```

### Notes

- The scheme name `ApiKey` is case-insensitive (`apikey`, `APIKEY`, `ApiKey` are all valid)
- There must be exactly one space between `ApiKey` and the actual key
- The API key can contain letters, numbers, hyphens, underscores, and dots

## Query Parameter (Fallback)

As a fallback, you can provide the API key using the `api_key` query parameter:

```
GET /nodes?api_key=<your-api-key>
```

### Examples

```bash
# Basic usage
curl "https://api.example.com/nodes?api_key=my-secret-key-123"

# With other query parameters
curl "https://api.example.com/nodes?filter=active&api_key=my-secret-key-123&limit=10"
```

### Security Considerations

- Query parameters may be logged by web servers and proxy servers
- Query parameters are visible in browser history and server logs
- Use the Authorization header when possible for better security

## Precedence

When both methods are provided, the Authorization header takes precedence over the query parameter.

## Legacy Format (Deprecated)

The following legacy formats are **no longer supported** and will result in authentication failure:

- ❌ `x-api-key` header
- ❌ `x-api-key` query parameter

### Migration

If you're currently using the legacy format, update your code as follows:

```bash
# OLD (no longer works)
curl -H "x-api-key: my-secret-key" https://api.example.com/nodes
curl "https://api.example.com/nodes?x-api-key=my-secret-key"

# NEW (recommended)
curl -H "Authorization: ApiKey my-secret-key" https://api.example.com/nodes
curl "https://api.example.com/nodes?api_key=my-secret-key"
```

## Error Handling

If no valid API key is provided or the API key is invalid, the request will be processed as an anonymous user with limited permissions.

## Implementation Details

The API key extraction follows this order:

1. Check `Authorization` header for `ApiKey <key>` format (case-insensitive)
2. Check `api_key` query parameter
3. If neither is found, treat as anonymous request

This change ensures compliance with RFC 7235 and modern API design standards while maintaining a clear upgrade path from legacy implementations.
