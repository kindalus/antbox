# Handlers and Routers Architecture

This document describes the clean separation between API handlers and HTTP server adapters in Antbox.

## Overview

Antbox implements a **three-layer HTTP architecture** that promotes:
- **Framework independence**: Core handlers are HTTP-framework agnostic
- **Code reusability**: Same handlers work with Oak (Deno) and H3 (Node.js)
- **Testability**: Handlers can be tested without server infrastructure
- **Maintainability**: Clear separation of concerns

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│  HTTP Server Adapters (Oak/H3)              │
│  - Routes configuration                      │
│  - Framework-specific Request/Response      │
│  - Adapter functions                         │
└─────────────────┬───────────────────────────┘
                  │
                  │ uses
                  ↓
┌─────────────────────────────────────────────┐
│  API Handlers (Framework-agnostic)          │
│  - Business logic orchestration              │
│  - Service calls                             │
│  - Standard Request/Response objects         │
└─────────────────┬───────────────────────────┘
                  │
                  │ calls
                  ↓
┌─────────────────────────────────────────────┐
│  Application Services                        │
│  - Domain logic                              │
│  - Data access                               │
│  - Business rules                            │
└─────────────────────────────────────────────┘
```

## Handler Layer (`src/api/*_handlers.ts`)

Handlers are **pure functions** that:
1. Accept standard `Request` objects
2. Return `Promise<Response>` objects
3. Are completely framework-agnostic
4. Contain zero Oak/H3-specific code

### Handler Pattern

```typescript
import type { HttpHandler } from "api/handler.ts";
import { sendBadRequest } from "api/handler.ts";
import { checkServiceAvailability } from "api/service_availability.ts";

export function exampleHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const tenant = getTenant(req, tenants);
      const service = tenant.someService;

      // 1. Service availability check
      const unavailableResponse = checkServiceAvailability(service, "Service name");
      if (unavailableResponse) {
        return unavailableResponse;
      }

      // 2. Extract and validate parameters
      const params = getParams(req);
      if (!params.uuid) {
        return sendBadRequest({ error: "{ uuid } not given" });
      }

      // 3. Call service and process result
      return service
        .operation(getAuthenticationContext(req), params.uuid)
        .then(processServiceResult)
        .catch(processError);
    },
  );
}
```

### Standard Helpers

#### Service Availability
```typescript
import { checkServiceAvailability } from "api/service_availability.ts";

const unavailableResponse = checkServiceAvailability(service, "Service name");
if (unavailableResponse) {
  return unavailableResponse; // Returns 503 Service Unavailable
}
```

#### Response Helpers
```typescript
import {
  sendOK,
  sendCreated,
  sendBadRequest,
  sendNotFound,
  sendForbidden,
  sendUnauthorized,
  sendServiceUnavailable
} from "api/handler.ts";

// Usage
return sendOK({ data: result });
return sendBadRequest({ error: "Invalid input" });
return sendNotFound({ error: "Resource not found" });
```

#### Parameter Extraction
```typescript
import { getParams } from "api/get_params.ts";
import { getQuery } from "api/get_query.ts";
import { getTenant } from "api/get_tenant.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";

const params = getParams(req);        // Path parameters
const query = getQuery(req);          // Query string parameters
const tenant = getTenant(req, tenants); // Current tenant
const auth = getAuthenticationContext(req); // Auth context
```

## Router Layer (`src/adapters/{oak|h3}/*_router.ts`)

Routers are **framework-specific** and handle:
1. Route definitions and HTTP methods
2. Path prefixes
3. Adapter function to convert framework types
4. Mounting routes to the server

### Oak Router Example

```typescript
import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { exampleHandler } from "api/example_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = new Router({ prefix: "/example" });

  // CRUD operations
  router.post("/", adapt(exampleHandler(tenants)));
  router.get("/:uuid", adapt(getExampleHandler(tenants)));

  return router;
}
```

### H3 Router Example

```typescript
import { createRouter, type Router } from "h3";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { exampleHandler } from "api/example_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = createRouter();

  // CRUD operations (H3 doesn't support prefix in createRouter)
  router.post("/", adapt(exampleHandler(tenants)));
  router.get("/:uuid", adapt(getExampleHandler(tenants)));

  return router;
}
```

### Adapter Functions

Each framework has an `adapt()` function that converts framework-specific types to standard Web API types:

**Oak Adapter** (`src/adapters/oak/adapt.ts`):
```typescript
export function adapt(handler: HttpHandler) {
  return async (ctx: Context) => {
    const response = await handler(ctx.request);
    ctx.response = response;
  };
}
```

**H3 Adapter** (`src/adapters/h3/adapt.ts`):
```typescript
export function adapt(handler: HttpHandler) {
  return async (event: H3Event) => {
    const request = toWebRequest(event);
    const response = await handler(request);
    return fromWebResponse(response, event);
  };
}
```

## Current Handler Files

| Handler File | Endpoints | Service Used |
|--------------|-----------|--------------|
| `actions_handlers.ts` | `/actions/*` | `featureService` |
| `agents_handlers.ts` | `/agents/*` | `agentService`, `ragService` |
| `ai_tools_handlers.ts` | `/ai-tools/*` | `featureService` |
| `api_keys_handlers.ts` | `/api-keys/*` | `apiKeyService` |
| `aspects_handlers.ts` | `/aspects/*` | `aspectService` |
| `extensions_handlers.ts` | `/extensions/*` | `featureService` |
| `features_handlers.ts` | `/features/*` | `featureService` |
| `groups_handlers.ts` | `/groups/*` | `usersGroupsService` |
| `login_handler.ts` | `/login/*` | `authService` |
| `nodes_handlers.ts` | `/nodes/*` | `nodeService` |
| `users_handlers.ts` | `/users/*` | `usersGroupsService` |

## Server Setup

Both Oak and H3 servers follow the same pattern:

1. Import all routers
2. Create router instances with tenants
3. Mount routers under `/v2` prefix
4. Return server startup function

**Oak Server** (`src/adapters/oak/server.ts`):
```typescript
export default function setupOakServer(tenants: AntboxTenant[]): startHttpServer {
  const app = new Application();
  const v2 = new Router({ prefix: "/v2" });

  // Mount routers
  v2.use(nodesRouter(tenants).routes());
  v2.use(featuresRouter(tenants).routes());
  // ... more routers

  app.use(v2.routes());
  return (options) => app.listen(options);
}
```

**H3 Server** (`src/adapters/h3/server.ts`):
```typescript
export default function setupH3Server(tenants: AntboxTenant[]): App {
  const app = createApp();
  const v2Router = createRouter();

  // Mount routers with prefixes
  v2Router.use("/nodes/**", useBase("/nodes", nodesRouter(tenants).handler));
  v2Router.use("/features/**", useBase("/features", featuresRouter(tenants).handler));
  // ... more routers

  app.use("/v2/**", useBase("/v2", v2Router.handler));
  return app;
}
```

## Benefits

### 1. **Framework Independence**
- Handlers work with any HTTP framework
- Easy to add new server adapters (e.g., Hono, Express)
- Business logic is not tied to Oak or H3

### 2. **Code Reusability**
- **100% handler code reuse** between Oak and H3
- Only routers are framework-specific
- Reduced duplication and maintenance burden

### 3. **Testability**
- Handlers are pure functions
- Can be tested with standard `Request` objects
- No need to mock framework-specific types

### 4. **Consistency**
- All handlers follow the same pattern
- Standardized error handling
- Uniform response formats

### 5. **Type Safety**
- TypeScript ensures correct types throughout
- Service availability checks prevent null errors
- Helper functions provide type-safe APIs

## Error Handling

All handlers use a consistent error handling pattern:

```typescript
return service
  .operation(auth, params)
  .then(processServiceResult)  // Handles Either<Error, Result>
  .catch(processError);         // Handles AntboxError types
```

**Error Processor** (`src/api/process_error.ts`):
- Maps domain errors to HTTP status codes
- Returns consistent error response format
- Logs unexpected errors

**Result Processor** (`src/api/process_service_result.ts`):
- Handles `Either<Error, Success>` pattern
- Automatically sends appropriate status codes
- Converts domain types to JSON

## Best Practices

### ✅ DO

1. **Keep handlers framework-agnostic**
   ```typescript
   // Good
   export function handler(tenants: AntboxTenant[]): HttpHandler {
     return async (req: Request): Promise<Response> => { /*...*/ };
   }
   ```

2. **Use standard helper functions**
   ```typescript
   return sendBadRequest({ error: "Invalid input" });
   ```

3. **Check service availability consistently**
   ```typescript
   const unavailable = checkServiceAvailability(service, "Service name");
   if (unavailable) return unavailable;
   ```

4. **Follow the middleware chain pattern**
   ```typescript
   return defaultMiddlewareChain(tenants, handlerFn);
   ```

### ❌ DON'T

1. **Don't use framework-specific code in handlers**
   ```typescript
   // Bad - Oak-specific
   return (ctx: Context) => { ctx.response.body = data; };
   ```

2. **Don't create inline response objects**
   ```typescript
   // Bad
   return new Response(JSON.stringify({error}), {status: 400});

   // Good
   return sendBadRequest({ error });
   ```

3. **Don't duplicate service checks**
   ```typescript
   // Bad
   if (!service) {
     return new Response(/*...*/);
   }

   // Good
   const unavailable = checkServiceAvailability(service, "Name");
   if (unavailable) return unavailable;
   ```

## Migration Guide

### Adding a New Handler

1. **Create handler file** in `src/api/`
2. **Export handler functions** following the pattern
3. **Create Oak router** in `src/adapters/oak/`
4. **Create H3 router** in `src/adapters/h3/`
5. **Mount routers** in both server files
6. **Update OpenAPI spec** with new endpoints

### Converting Old Handlers

1. **Extract business logic** to handler function
2. **Use standard helpers** (sendOK, sendBadRequest, etc.)
3. **Add service availability checks**
4. **Update routers** to use new handler
5. **Test with both** Oak and H3 servers

## Summary

The handler/router separation in Antbox provides a clean, maintainable architecture that:
- Separates concerns between business logic and HTTP routing
- Enables framework flexibility without code duplication
- Provides consistent patterns for all API endpoints
- Makes the codebase easier to understand and maintain

All handlers are framework-agnostic, all routers are framework-specific, and the adapt() function bridges the gap.
