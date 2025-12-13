# WebDAV Implementation Analysis

**Date:** 2025-01-12
**Analyzed Files:**
- `src/integration/webdav/webdav_handlers.ts`
- `src/integration/webdav/webdav_router.ts`
- `src/integration/webdav/webdav_middleware.ts`
- `src/integration/webdav/webdav_xml.ts`
- `src/integration/webdav/webdav_utils.ts`
- `src/integration/webdav/webdav_etag.ts`
- `src/integration/webdav/LIMITATIONS.md`

---

## Executive Summary

The WebDAV implementation provides a functional interface for file operations but has significant opportunities for improvement in **performance**, **robustness**, **standards compliance**, and **maintainability**.

### Current Status: ⚠️ Production-Ready with Limitations

**Strengths:**
- ✅ Core WebDAV methods implemented (OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL, COPY, MOVE)
- ✅ Integrated authentication via standard middleware
- ✅ ETag support for caching
- ✅ Clean separation of concerns (handlers, routing, XML generation)

**Critical Issues:**
- 🔴 **Performance**: O(n) path resolution for every request
- 🔴 **Locking**: Dummy implementation (non-functional)
- 🟡 **XML Generation**: Fragile template strings
- 🟡 **Limited Standards Compliance**: Missing PROPPATCH, recursive operations, conditional requests

---

## Detailed Analysis

### 1. Path Resolution Performance 🔴 CRITICAL

**Location:** `src/integration/webdav/webdav_utils.ts:19-64`

**Current Implementation:**
```typescript
export async function resolvePath(
    service: NodeService,
    authContext: AuthenticationContext,
    path: string,
): Promise<Either<AntboxError, NodeLike>> {
    // ... code ...
    const findResultOrErr = await service.find(authContext, [["title", "==", targetTitle]]);
    const paths = await Promise.all(nodes.map((n) => service.breadcrumbs(authContext, n.uuid)));
    // ... code ...
}
```

**Problem:**
- Every WebDAV request triggers `find()` + multiple `breadcrumbs()` calls
- For path `/folder1/folder2/file.txt`, this means:
  - 1 `find()` query to find all nodes titled "file.txt"
  - N `breadcrumbs()` calls (where N = number of nodes with that title)
  - **Worst case:** O(depth × duplicates) database queries per request

**Impact:**
- Deep folder structures = slow responses
- High concurrency = database bottleneck
- No caching = repeated work for same paths

**Suggested Solutions:**

#### Option 1: Path Cache (Quick Win) ⭐ RECOMMENDED
```typescript
// src/integration/webdav/path_cache.ts
import { LRU } from "lru-cache"; // or simple Map with TTL

interface PathCacheEntry {
    nodeUuid: string;
    timestamp: number;
}

export class WebDAVPathCache {
    #cache: LRU<string, PathCacheEntry>;
    #ttl: number = 5000; // 5 seconds

    constructor(maxSize = 1000, ttl = 5000) {
        this.#cache = new LRU({ max: maxSize });
        this.#ttl = ttl;
    }

    get(tenant: string, path: string): string | undefined {
        const key = `${tenant}:${path}`;
        const entry = this.#cache.get(key);

        if (!entry) return undefined;

        // Check TTL
        if (Date.now() - entry.timestamp > this.#ttl) {
            this.#cache.delete(key);
            return undefined;
        }

        return entry.nodeUuid;
    }

    set(tenant: string, path: string, nodeUuid: string): void {
        const key = `${tenant}:${path}`;
        this.#cache.set(key, { nodeUuid, timestamp: Date.now() });
    }

    invalidate(tenant: string, path: string): void {
        // Invalidate this path and all child paths
        const prefix = `${tenant}:${path}`;
        for (const key of this.#cache.keys()) {
            if (key.startsWith(prefix)) {
                this.#cache.delete(key);
            }
        }
    }

    clear(tenant?: string): void {
        if (tenant) {
            const prefix = `${tenant}:`;
            for (const key of this.#cache.keys()) {
                if (key.startsWith(prefix)) {
                    this.#cache.delete(key);
                }
            }
        } else {
            this.#cache.clear();
        }
    }
}
```

**Usage:**
```typescript
// In webdav_utils.ts
const pathCache = new WebDAVPathCache();

export async function resolvePath(
    service: NodeService,
    authContext: AuthenticationContext,
    path: string,
    tenant: string,
): Promise<Either<AntboxError, NodeLike>> {
    // Check cache first
    const cachedUuid = pathCache.get(tenant, path);
    if (cachedUuid) {
        const nodeOrErr = await service.get(authContext, cachedUuid);
        if (nodeOrErr.isRight()) {
            return nodeOrErr;
        }
        // Cache miss or node deleted - invalidate
        pathCache.invalidate(tenant, path);
    }

    // Original resolution logic...
    const nodeOrErr = await /* ... existing logic ... */;

    if (nodeOrErr.isRight()) {
        pathCache.set(tenant, path, nodeOrErr.value.uuid);
    }

    return nodeOrErr;
}

// Invalidate cache on mutations
export async function putHandler(tenants: AntboxTenant[]): HttpHandler {
    return webdavMiddlewareChain(tenants, async (req: Request) => {
        // ... existing logic ...
        const result = await tenant.nodeService.createFile(/* ... */);

        if (result.isRight()) {
            pathCache.invalidate(tenant.name, path);
            pathCache.invalidate(tenant.name, parentPath); // Parent dir changed
        }

        return /* ... */;
    });
}
```

**Benefits:**
- 🚀 5-10x faster for repeated requests
- ⚡ Minimal code changes
- 💾 Low memory footprint with LRU

**Trade-offs:**
- ⚠️ Cache invalidation complexity
- ⚠️ Potential stale data (5s TTL)

#### Option 2: Virtual Path Field (Long-term) 🏗️
Add a `virtualPath` field to `NodeMetadata` that's maintained automatically:

```typescript
// In NodeService.create/update
const virtualPath = await computeVirtualPath(node);
metadata.virtualPath = virtualPath;

// Then path resolution becomes:
const nodeOrErr = await service.find(authContext, [["virtualPath", "==", path]]);
```

**Benefits:**
- ✅ O(1) path lookups (indexed query)
- ✅ No cache invalidation needed
- ✅ Accurate and consistent

**Trade-offs:**
- ❌ Requires schema migration
- ❌ Extra storage per node
- ❌ Path updates on folder renames

---

### 2. XML Generation 🟡 MEDIUM PRIORITY

**Location:** `src/integration/webdav/webdav_xml.ts`

**Current Implementation:**
```typescript
export function createPropfindResponse(nodes: NodeLike[], req: Request): string {
    const responses = nodes.map((node, index) => {
        return nodeToPropfindXml(node, basePath, index === 0);
    }).join("\n");

    return `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  ${responses}
</D:multistatus>`;
}
```

**Problems:**
- 🔴 No XML escaping for attribute values
- 🟡 Hard to add new properties
- 🟡 Difficult to validate correctness
- 🟡 Poor readability for complex structures

**Example Vulnerability:**
```typescript
// Current code
<D:displayname>${escapeXml(node.title)}</D:displayname>

// But what about attributes?
<D:href>${escapeXml(nodeToHref(node, basePath))}</D:href>
// If href contains quotes, this could break!
```

**Suggested Solution:**

```typescript
// src/integration/webdav/xml_builder.ts
export class XMLBuilder {
    #indent: number = 0;
    #output: string[] = [];

    declaration(): this {
        this.#output.push('<?xml version="1.0" encoding="utf-8"?>');
        return this;
    }

    element(name: string, attrs?: Record<string, string>, content?: string | (() => void)): this {
        const spaces = "  ".repeat(this.#indent);

        let tag = `${spaces}<${name}`;
        if (attrs) {
            for (const [key, value] of Object.entries(attrs)) {
                tag += ` ${key}="${this.escapeAttr(value)}"`;
            }
        }

        if (content === undefined) {
            // Self-closing
            tag += "/>";
            this.#output.push(tag);
        } else if (typeof content === "string") {
            // Text content
            tag += `>${this.escapeText(content)}</${name}>`;
            this.#output.push(tag);
        } else {
            // Child elements
            tag += ">";
            this.#output.push(tag);
            this.#indent++;
            content();
            this.#indent--;
            this.#output.push(`${spaces}</${name}>`);
        }

        return this;
    }

    escapeText(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    escapeAttr(text: string): string {
        return this.escapeText(text)
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    toString(): string {
        return this.#output.join("\n");
    }
}

// Usage
export function createPropfindResponse(nodes: NodeLike[], req: Request): string {
    const basePath = new URL(req.url).pathname.replace(`/webdav`, "") || "/";
    const xml = new XMLBuilder();

    xml.declaration();
    xml.element("D:multistatus", { "xmlns:D": "DAV:" }, () => {
        for (const [index, node] of nodes.entries()) {
            const isFolder = node.mimetype === Nodes.FOLDER_MIMETYPE;
            const first = index === 0;
            const href = nodeToHref(node, basePath, first);

            xml.element("D:response", undefined, () => {
                xml.element("D:href", undefined, href);
                xml.element("D:propstat", undefined, () => {
                    xml.element("D:prop", undefined, () => {
                        xml.element("D:creationdate", undefined, new Date(node.createdTime).toISOString());
                        xml.element("D:getlastmodified", undefined, new Date(node.modifiedTime).toUTCString());
                        xml.element("D:getetag", undefined, `"${generateETag(node)}"`);

                        if (!isFolder) {
                            xml.element("D:getcontentlength", undefined, String((node as any).size || 0));
                        }

                        xml.element("D:resourcetype", undefined, isFolder ? () => {
                            xml.element("D:collection");
                        } : undefined);

                        xml.element("D:displayname", undefined, node.title);
                    });
                    xml.element("D:status", undefined, "HTTP/1.1 200 OK");
                });
            });
        }
    });

    return xml.toString();
}
```

**Benefits:**
- ✅ Proper XML escaping for text AND attributes
- ✅ Type-safe and readable
- ✅ Easier to extend with custom properties
- ✅ Validates structure during build

---

### 3. LOCK/UNLOCK Implementation 🔴 CRITICAL

**Location:** `src/integration/webdav/webdav_handlers.ts:366-432`

**Current Implementation:**
```typescript
export function lockHandler(tenants: AntboxTenant[]): HttpHandler {
    return webdavMiddlewareChain(tenants, async (req: Request) => {
        // ...
        const lockToken = `opaquelocktoken:${crypto.randomUUID()}`;
        // Returns lock token but DOESN'T ACTUALLY LOCK anything
        return new Response(lockResponse, {/* ... */});
    });
}
```

**Problem:**
- ❌ **No actual locking mechanism**
- ❌ Lock tokens are generated but not stored
- ❌ No lock validation on PUT/DELETE/MOVE
- ❌ Multiple clients can "lock" the same resource
- ❌ Locks never expire (no cleanup)

**Impact:**
- Data corruption in collaborative environments
- Microsoft Office/LibreOffice may fail to save properly
- No conflict resolution

**Suggested Solution:**

```typescript
// src/integration/webdav/lock_manager.ts
export interface WebDAVLock {
    token: string;
    nodeUuid: string;
    owner: string; // email
    scope: "exclusive" | "shared";
    depth: 0 | "infinity";
    timeout: number; // timestamp
    createdAt: number;
}

export class WebDAVLockManager {
    #locks: Map<string, WebDAVLock> = new Map(); // nodeUuid -> lock
    #tokens: Map<string, string> = new Map(); // token -> nodeUuid

    /**
     * Attempt to acquire a lock on a node
     */
    async acquireLock(
        nodeUuid: string,
        owner: string,
        scope: "exclusive" | "shared" = "exclusive",
        depth: 0 | "infinity" = 0,
        timeoutSeconds: number = 3600,
    ): Either<AntboxError, WebDAVLock> {
        this.#cleanupExpired();

        const existingLock = this.#locks.get(nodeUuid);

        // Check if already locked
        if (existingLock) {
            if (existingLock.scope === "exclusive") {
                // Can't lock if exclusively locked by someone else
                if (existingLock.owner !== owner) {
                    return left(new AntboxError("ResourceLocked", "Resource is locked by another user"));
                }
                // Owner can refresh their lock
                return this.#refreshLock(existingLock, timeoutSeconds);
            }
            // Shared lock - can add if requesting shared
            if (scope === "exclusive") {
                return left(new AntboxError("ResourceLocked", "Resource has shared locks"));
            }
        }

        // Create new lock
        const token = `opaquelocktoken:${crypto.randomUUID()}`;
        const lock: WebDAVLock = {
            token,
            nodeUuid,
            owner,
            scope,
            depth,
            timeout: Date.now() + (timeoutSeconds * 1000),
            createdAt: Date.now(),
        };

        this.#locks.set(nodeUuid, lock);
        this.#tokens.set(token, nodeUuid);

        return right(lock);
    }

    /**
     * Release a lock
     */
    releaseLock(token: string, owner: string): Either<AntboxError, void> {
        const nodeUuid = this.#tokens.get(token);
        if (!nodeUuid) {
            return left(new AntboxError("LockNotFound", "Lock token not found"));
        }

        const lock = this.#locks.get(nodeUuid);
        if (!lock || lock.owner !== owner) {
            return left(new AntboxError("Forbidden", "Cannot unlock resource owned by another user"));
        }

        this.#locks.delete(nodeUuid);
        this.#tokens.delete(token);

        return right(undefined);
    }

    /**
     * Check if a node is locked and validate token
     */
    validateLock(nodeUuid: string, lockToken?: string, owner?: string): Either<AntboxError, void> {
        this.#cleanupExpired();

        const lock = this.#locks.get(nodeUuid);
        if (!lock) {
            return right(undefined); // Not locked
        }

        // If lock token provided, verify it
        if (lockToken) {
            const cleanToken = lockToken.replace(/^<|>$/g, ""); // Remove <> wrapper
            if (lock.token === cleanToken) {
                return right(undefined); // Valid token
            }
        }

        // If owner matches, allow
        if (owner && lock.owner === owner) {
            return right(undefined);
        }

        return left(new AntboxError("ResourceLocked", `Resource is locked by ${lock.owner}`));
    }

    getLock(nodeUuid: string): WebDAVLock | undefined {
        this.#cleanupExpired();
        return this.#locks.get(nodeUuid);
    }

    #refreshLock(lock: WebDAVLock, timeoutSeconds: number): Either<AntboxError, WebDAVLock> {
        lock.timeout = Date.now() + (timeoutSeconds * 1000);
        return right(lock);
    }

    #cleanupExpired(): void {
        const now = Date.now();
        for (const [nodeUuid, lock] of this.#locks.entries()) {
            if (lock.timeout < now) {
                this.#locks.delete(nodeUuid);
                this.#tokens.delete(lock.token);
            }
        }
    }

    // Run periodic cleanup
    startCleanupTimer(intervalMs: number = 60000): () => void {
        const timer = setInterval(() => this.#cleanupExpired(), intervalMs);
        return () => clearInterval(timer);
    }
}

// Singleton instance
export const lockManager = new WebDAVLockManager();
```

**Usage in Handlers:**
```typescript
// PUT handler
export function putHandler(tenants: AntboxTenant[]): HttpHandler {
    return webdavMiddlewareChain(tenants, async (req: Request) => {
        const tenant = getTenant(req, tenants);
        const authContext = getAuthenticationContext(req);
        const path = getPath(req, tenant);

        const nodeOrErr = await resolvePath(/* ... */);
        if (nodeOrErr.isRight()) {
            const node = nodeOrErr.value;
            const lockToken = req.headers.get("If");

            // Validate lock
            const lockValidation = lockManager.validateLock(
                node.uuid,
                lockToken,
                authContext.principal.email
            );

            if (lockValidation.isLeft()) {
                return processError(lockValidation.value);
            }
        }

        // ... rest of PUT logic ...
    });
}

// LOCK handler
export function lockHandler(tenants: AntboxTenant[]): HttpHandler {
    return webdavMiddlewareChain(tenants, async (req: Request) => {
        const tenant = getTenant(req, tenants);
        const authContext = getAuthenticationContext(req);
        const path = getPath(req, tenant);

        const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);
        if (nodeOrErr.isLeft()) {
            return processError(nodeOrErr.value);
        }

        const node = nodeOrErr.value;
        const timeout = req.headers.get("Timeout") || "Second-3600";
        const timeoutSeconds = parseInt(timeout.replace("Second-", ""));

        const lockResult = lockManager.acquireLock(
            node.uuid,
            authContext.principal.email,
            "exclusive",
            0,
            timeoutSeconds
        );

        if (lockResult.isLeft()) {
            return processError(lockResult.value);
        }

        const lock = lockResult.value;

        // Generate proper lock response XML
        const lockResponse = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>0</D:depth>
      <D:owner>
        <D:href>${authContext.principal.email}</D:href>
      </D:owner>
      <D:timeout>Second-${timeoutSeconds}</D:timeout>
      <D:locktoken>
        <D:href>${lock.token}</D:href>
      </D:locktoken>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;

        return new Response(lockResponse, {
            status: 200,
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Lock-Token": `<${lock.token}>`,
            },
        });
    });
}
```

**Benefits:**
- ✅ Actual resource locking
- ✅ Prevents concurrent modifications
- ✅ Automatic timeout/cleanup
- ✅ Standards-compliant

**Note:** For multi-instance deployments, use Redis or database-backed lock storage instead of in-memory Map.

---

### 4. Recursive Operations 🟡 MEDIUM PRIORITY

**Current Limitation:** COPY and DELETE only affect the target node, not its descendants.

**Problem:**
```
COPY /folder1 -> /folder2
Result: Only folder1 itself is copied, not its contents
```

**Suggested Solution:**

```typescript
// src/integration/webdav/recursive_operations.ts
export async function recursiveCopy(
    nodeService: NodeService,
    authContext: AuthenticationContext,
    sourceUuid: string,
    destParentUuid: string,
): Promise<Either<AntboxError, NodeLike>> {
    // Get source node
    const sourceOrErr = await nodeService.get(authContext, sourceUuid);
    if (sourceOrErr.isLeft()) return left(sourceOrErr.value);
    const source = sourceOrErr.value;

    // Copy the node itself
    const copyResult = await nodeService.copy(authContext, sourceUuid, destParentUuid);
    if (copyResult.isLeft()) return left(copyResult.value);
    const copiedNode = copyResult.value;

    // If folder, recursively copy children
    if (Nodes.isFolder(source)) {
        const childrenOrErr = await nodeService.list(authContext, sourceUuid);
        if (childrenOrErr.isLeft()) return left(childrenOrErr.value);

        for (const child of childrenOrErr.value) {
            const childCopyResult = await recursiveCopy(
                nodeService,
                authContext,
                child.uuid,
                copiedNode.uuid
            );
            if (childCopyResult.isLeft()) {
                // Rollback? Or continue?
                console.error(`Failed to copy child ${child.uuid}:`, childCopyResult.value);
            }
        }
    }

    return right(copiedNode);
}

export async function recursiveDelete(
    nodeService: NodeService,
    authContext: AuthenticationContext,
    nodeUuid: string,
): Promise<Either<AntboxError, void>> {
    const nodeOrErr = await nodeService.get(authContext, nodeUuid);
    if (nodeOrErr.isLeft()) return left(nodeOrErr.value);
    const node = nodeOrErr.value;

    // If folder, recursively delete children first
    if (Nodes.isFolder(node)) {
        const childrenOrErr = await nodeService.list(authContext, nodeUuid);
        if (childrenOrErr.isLeft()) return left(childrenOrErr.value);

        for (const child of childrenOrErr.value) {
            const deleteResult = await recursiveDelete(nodeService, authContext, child.uuid);
            if (deleteResult.isLeft()) {
                return left(deleteResult.value);
            }
        }
    }

    // Delete the node itself
    return await nodeService.delete(authContext, nodeUuid);
}
```

**Usage:**
```typescript
export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
    return webdavMiddlewareChain(tenants, async (req: Request) => {
        const tenant = getTenant(req, tenants);
        const authContext = getAuthenticationContext(req);
        const path = getPath(req, tenant);
        const depth = req.headers.get("Depth") || "infinity";

        const nodeOrErr = await resolvePath(tenant.nodeService, authContext, path);
        if (nodeOrErr.isLeft()) {
            return processError(nodeOrErr.value);
        }

        const node = nodeOrErr.value;

        // Use recursive delete for folders with depth infinity
        const result = Nodes.isFolder(node) && depth === "infinity"
            ? await recursiveDelete(tenant.nodeService, authContext, node.uuid)
            : await tenant.nodeService.delete(authContext, node.uuid);

        return result.isRight() ? sendNoContent() : processError(result.value);
    });
}
```

---

### 5. Conditional Requests 🟡 MEDIUM PRIORITY

**Missing:** Support for `If-Match`, `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since`

**Suggested Implementation:**

```typescript
// src/integration/webdav/conditional_requests.ts
export function checkConditionalHeaders(
    req: Request,
    node: NodeLike
): Either<AntboxError, void> {
    const etag = generateETag(node);
    const modifiedTime = new Date(node.modifiedTime).getTime();

    // If-Match: Must match ETag
    const ifMatch = req.headers.get("If-Match");
    if (ifMatch && ifMatch !== "*") {
        const tags = ifMatch.split(",").map(t => t.trim().replace(/^"|"$/g, ""));
        if (!tags.includes(etag)) {
            return left(new AntboxError("PreconditionFailed", "If-Match failed", 412));
        }
    }

    // If-None-Match: Must NOT match ETag
    const ifNoneMatch = req.headers.get("If-None-Match");
    if (ifNoneMatch) {
        if (ifNoneMatch === "*") {
            return left(new AntboxError("NotModified", "Resource exists", 304));
        }
        const tags = ifNoneMatch.split(",").map(t => t.trim().replace(/^"|"$/g, ""));
        if (tags.includes(etag)) {
            return left(new AntboxError("NotModified", "ETag matches", 304));
        }
    }

    // If-Modified-Since
    const ifModifiedSince = req.headers.get("If-Modified-Since");
    if (ifModifiedSince) {
        const sinceTime = new Date(ifModifiedSince).getTime();
        if (modifiedTime <= sinceTime) {
            return left(new AntboxError("NotModified", "Not modified since", 304));
        }
    }

    // If-Unmodified-Since
    const ifUnmodifiedSince = req.headers.get("If-Unmodified-Since");
    if (ifUnmodifiedSince) {
        const sinceTime = new Date(ifUnmodifiedSince).getTime();
        if (modifiedTime > sinceTime) {
            return left(new AntboxError("PreconditionFailed", "Modified since", 412));
        }
    }

    return right(undefined);
}
```

**Usage:**
```typescript
export function getHandler(tenants: AntboxTenant[]): HttpHandler {
    return webdavMiddlewareChain(tenants, async (req: Request) => {
        // ... resolve node ...

        // Check conditional headers
        const conditionCheck = checkConditionalHeaders(req, node);
        if (conditionCheck.isLeft()) {
            const error = conditionCheck.value;
            if (error.errorCode === "NotModified") {
                return new Response(null, { status: 304 });
            }
            return processError(error);
        }

        // ... return file content ...
    });
}
```

---

### 6. Test Coverage 🟡 MEDIUM PRIORITY

**Current:** Only `webdav_etag_test.ts` exists

**Needed Tests:**

```typescript
// src/integration/webdav/webdav_handlers_test.ts
describe("WebDAV Handlers", () => {
    describe("PROPFIND", () => {
        it("should return folder with children for Depth: 1");
        it("should return only folder for Depth: 0");
        it("should handle root folder");
        it("should escape XML in titles");
        it("should include ETags");
    });

    describe("GET", () => {
        it("should return file content");
        it("should return 404 for non-existent file");
        it("should respect If-None-Match");
        it("should return folder listing as XML");
    });

    describe("PUT", () => {
        it("should create new file");
        it("should update existing file");
        it("should reject files starting with ._");
        it("should detect correct MIME type");
        it("should fail if parent doesn't exist");
        it("should fail if locked by another user");
    });

    describe("DELETE", () => {
        it("should delete file");
        it("should delete empty folder");
        it("should recursively delete folder with Depth: infinity");
        it("should fail if locked");
    });

    describe("MKCOL", () => {
        it("should create folder");
        it("should fail if parent doesn't exist");
        it("should fail if already exists");
    });

    describe("COPY", () => {
        it("should copy file");
        it("should copy folder recursively");
        it("should handle Overwrite header");
    });

    describe("MOVE", () => {
        it("should move file");
        it("should rename file");
        it("should move folder");
        it("should fail if destination locked");
    });

    describe("LOCK/UNLOCK", () => {
        it("should acquire exclusive lock");
        it("should refuse lock if already locked");
        it("should allow owner to unlock");
        it("should refuse unlock by non-owner");
        it("should expire locks after timeout");
    });
});

// src/integration/webdav/path_cache_test.ts
describe("WebDAVPathCache", () => {
    it("should cache path resolutions");
    it("should invalidate on TTL expiry");
    it("should invalidate child paths");
    it("should handle concurrent access");
});
```

---

## Priority Recommendations

### 🔴 High Priority (Production Issues)
1. **Path Resolution Caching** - Implement Option 1 (LRU cache)
   - **Effort:** 4 hours
   - **Impact:** 5-10x performance improvement

2. **Actual Lock Implementation** - Replace dummy locks
   - **Effort:** 8 hours
   - **Impact:** Prevents data corruption

### 🟡 Medium Priority (Standards Compliance)
3. **XML Builder** - Replace template strings
   - **Effort:** 6 hours
   - **Impact:** Better maintainability, fewer bugs

4. **Recursive Operations** - COPY/DELETE folders
   - **Effort:** 4 hours
   - **Impact:** Expected WebDAV behavior

5. **Conditional Requests** - If-Match, If-None-Match
   - **Effort:** 3 hours
   - **Impact:** Better caching, fewer transfers

### 🟢 Low Priority (Nice to Have)
6. **PROPPATCH Support** - Custom properties
   - **Effort:** 6 hours
   - **Impact:** Advanced WebDAV clients

7. **Range Requests** - Partial file downloads
   - **Effort:** 4 hours
   - **Impact:** Better video streaming, resume downloads

8. **Comprehensive Tests** - Full handler coverage
   - **Effort:** 12 hours
   - **Impact:** Confidence in changes

---

## Additional Suggestions

### Performance Monitoring
Add metrics to track WebDAV performance:

```typescript
// src/integration/webdav/metrics.ts
export class WebDAVMetrics {
    static recordPathResolution(durationMs: number, cacheHit: boolean) {
        // Log to metrics system
    }

    static recordLockAcquisition(nodeUuid: string, success: boolean) {
        // Log to metrics system
    }
}
```

### Error Logging
Improve error context:

```typescript
// In handlers
if (nodeOrErr.isLeft()) {
    console.error(`WebDAV error for path ${path}:`, {
        error: nodeOrErr.value,
        method: req.method,
        user: authContext.principal.email,
        tenant: tenant.name,
    });
    return processError(nodeOrErr.value);
}
```

### Configuration
Make WebDAV behavior configurable:

```typescript
export interface WebDAVConfiguration {
    enableLocking: boolean;
    cacheTTL: number;
    maxCacheSize: number;
    enableRecursiveOperations: boolean;
}
```

---

## Conclusion

The WebDAV implementation is **functional but has critical performance and correctness issues**. Implementing the high-priority recommendations will make it production-ready for collaborative environments.

**Estimated Total Effort:** 40-50 hours for all recommendations
**Recommended First Sprint:** Items 1, 2, 3 (18 hours, addresses all critical issues)
