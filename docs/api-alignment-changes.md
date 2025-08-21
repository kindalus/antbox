# API Alignment Changes

This document describes the changes made to align the Oak adapters with the API folder structure and the OpenAPI specification.

## Overview

The Oak adapters have been updated to properly integrate with the centralized API handlers in the `src/api/` folder and to match the OpenAPI v3 specification defined in `openapi.yaml`.

## Key Changes

### 1. Parameter Handling Fix

**Problem**: Route parameters from Oak router weren't being passed to the API handlers.

**Solution**: Updated `src/adapters/oak/adapt.ts` to properly serialize route parameters into the `x-params` header:

```typescript
headers.set(
  "x-params",
  JSON.stringify(
    (ctx as Context & { params: Record<string, string> }).params,
  ),
);
```

### 2. Response Header Forwarding

**Enhancement**: Updated the Oak adapter to forward all response headers from the API handlers:

```typescript
// Copy all response headers
for (const [key, value] of res.headers.entries()) {
  ctx.response.headers.set(key, value);
}
```

### 3. Enhanced Content Type Support

**Enhancement**: Extended `src/adapters/oak/read_body.ts` to handle `application/x-www-form-urlencoded` content type used by extension endpoints:

```typescript
if (contentType?.includes("application/x-www-form-urlencoded")) {
  const body = await ctx.request.body.form();
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, String(value));
  }
  return formData;
}
```

### 4. Router Endpoint Alignment

#### Skills Router (`src/adapters/oak/skills_router.ts`)
- Reordered routes to match OpenAPI specification
- Proper grouping of list, core, and run operations
- All endpoints align with `/skills/*` pattern

#### Nodes Router (`src/adapters/oak/nodes_router.ts`)
- Fixed parameter handling consistency (path vs query parameters)
- Updated duplicate and export handlers to use path parameters
- Added backward compatibility alias for `/nodes/-/query`
- Organized routes by function (core, operations, search)

#### Actions Router (`src/adapters/oak/actions_router.ts`)
- Maintained backward compatibility for legacy action endpoints
- All endpoints marked as deprecated in OpenAPI spec
- Routes properly redirect to skills handlers

#### H3 Router (`src/adapters/h3/nodes_router.ts`)
- Updated to match Oak router structure
- Changed `PUT` to `PATCH` for updates
- Fixed duplicate endpoint HTTP method

### 5. API Handler Fixes

**Fixed Parameter Source Inconsistencies**:
- `duplicateHandler`: Changed from `getQuery(req)` to `getParams(req)`
- `exportHandler`: Changed from `getQuery(req)` to `getParams(req)`

**Added Parameter Validation**:
- Enhanced error handling for missing UUID parameters
- Consistent error responses across all handlers

## Router Structure

### Skills Router Endpoints
```
GET    /skills                     - List all skills
GET    /skills/-/actions           - List action-exposed skills
GET    /skills/-/extensions        - List extension-exposed skills
GET    /skills/-/mcp-tools         - List MCP tool-exposed skills
GET    /skills/:uuid               - Get skill by UUID
DELETE /skills/:uuid               - Delete skill
GET    /skills/:uuid/-/export      - Export skill
GET    /skills/:uuid/-/run-action  - Run skill as action
GET    /skills/:uuid/-/run-ext     - Run skill as extension (GET)
POST   /skills/:uuid/-/run-ext     - Run skill as extension (POST)
POST   /skills/:uuid/-/run-mcp     - Run skill as MCP tool
```

### Nodes Router Endpoints
```
GET    /nodes                      - List nodes
POST   /nodes                      - Create node
GET    /nodes/:uuid                - Get node by UUID
PATCH  /nodes/:uuid                - Update node
DELETE /nodes/:uuid                - Delete node
POST   /nodes/:uuid/-/copy         - Copy node
GET    /nodes/:uuid/-/duplicate    - Duplicate node
GET    /nodes/:uuid/-/export       - Export node
GET    /nodes/:uuid/-/evaluate     - Evaluate node
POST   /nodes/-/find               - Find nodes with filters
POST   /nodes/-/query              - Legacy alias for find
```

### Legacy Actions Router Endpoints (Deprecated)
```
GET    /actions                    - List action-exposed skills
GET    /actions/:uuid              - Get skill by UUID
DELETE /actions/:uuid              - Delete skill
GET    /actions/:uuid/-/export     - Export skill
GET    /actions/:uuid/-/run        - Run action
```

## OpenAPI Specification

The complete API is documented in `openapi.yaml` with:
- Full endpoint documentation
- Request/response schemas
- Authentication requirements
- Error response formats
- Data models for all entities

## Testing

To verify the changes:

1. **Start the server**: The Oak server should start without TypeScript errors
2. **Test parameter passing**: Route parameters should be available in handlers via `getParams(req)`
3. **Test content types**: Form data should be properly parsed for extension endpoints
4. **Test response headers**: File downloads should include proper Content-Disposition headers
5. **Verify OpenAPI compatibility**: All endpoints should match the OpenAPI specification

## Backward Compatibility

- Legacy `/actions/*` endpoints are maintained for backward compatibility
- Query aliases like `/nodes/-/query` are preserved
- All existing functionality remains available

## Future Improvements

1. **Additional Routers**: Enable commented-out routers (upload, users, groups, etc.)
2. **Enhanced Validation**: Add request body validation based on OpenAPI schemas
3. **Rate Limiting**: Add rate limiting middleware
4. **Metrics**: Add request/response metrics collection
5. **WebSocket Support**: Add real-time API capabilities

## Related Files

- `src/adapters/oak/adapt.ts` - Main Oak-to-API adapter
- `src/adapters/oak/read_body.ts` - Request body parsing
- `src/adapters/oak/setup_oak_server.ts` - Server configuration
- `src/api/*_handlers.ts` - API request handlers
- `openapi.yaml` - Complete API specification
