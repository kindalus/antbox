# Authentication

Antbox provides multiple authentication methods to secure your content and API access. This guide covers all supported authentication methods and best practices.

## Overview

Antbox supports four authentication methods with a defined priority order:

1. **API Key (Header)** - `Authorization: ApiKey <key>` (Priority 1)
2. **Bearer Token (Header)** - `Authorization: Bearer <jwt>` (Priority 2)
3. **Cookie** - `token=<jwt>` (Priority 3)
4. **API Key (Query)** - `?api_key=<key>` (Priority 4)
5. **Anonymous** - If no credentials are provided (Priority 5)

## Authentication Methods

### 1. Bearer Token (JWT)

The most common method for API clients and SPAs.

**Login:**
```bash
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)"
```

**Response:**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Usage:**
```bash
curl http://localhost:7180/v2/nodes \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Token Expiration:** 4 hours

**Best for:**
- Mobile apps
- Single-page applications (SPAs)
- Server-to-server communication
- CLI tools

### 2. HTTP-Only Cookies

Secure, automatic authentication for web applications.

**Login:**
```bash
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)" \
  -c cookies.txt
```

The server automatically sets an HTTP-only cookie:
```
Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400
```

**Usage (same-origin):**
```javascript
// Browser automatically sends cookie - no headers needed!
fetch('/v2/nodes')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Usage (cross-origin):**
```javascript
// Must explicitly include credentials
fetch('https://api.antbox.com/v2/nodes', {
  credentials: 'include'  // Required for cross-origin requests
})
  .then(res => res.json())
  .then(data => console.log(data));
```

**Logout:**
```bash
curl -X POST http://localhost:7180/login/logout \
  -b cookies.txt
```

**Cookie Attributes:**
- `HttpOnly` - JavaScript cannot access (XSS protection)
- `Secure` - Only sent over HTTPS
- `SameSite=Strict` - CSRF protection for same-origin requests
- `Max-Age=14400` - 4 hours (matches JWT expiration)

**Best for:**
- Traditional web applications
- Same-origin SPAs
- Better security against XSS attacks

### 3. API Keys

Long-lived credentials for programmatic access.

**Header Format (Recommended):**
```bash
curl http://localhost:7180/v2/nodes \
  -H "Authorization: ApiKey your-api-key-here"
```

**Query Parameter Format (Fallback):**
```bash
curl "http://localhost:7180/v2/nodes?api_key=your-api-key-here"
```

**Best for:**
- Third-party integrations
- Webhooks
- CI/CD pipelines
- Service accounts

**Note:** API keys take highest priority and override other authentication methods in the same request.

### 4. Anonymous Access

Access public resources without authentication.

```bash
curl http://localhost:7180/v2/nodes?parent=public-folder-uuid
```

**Permissions:**
Anonymous users can access resources where the folder's `permissions.anonymous` includes the required permission (`Read`, `Write`, or `Export`).

## Authentication Priority

When multiple authentication methods are provided in a single request, Antbox uses this priority order:

```
1. Authorization: ApiKey <key>     ← Highest priority
2. Authorization: Bearer <token>
3. Cookie: token=<jwt>
4. Query: ?api_key=<key>
5. Anonymous                       ← Lowest priority (no auth)
```

**Example:** If a request includes both a Bearer token and a cookie, the Bearer token will be used.

## CORS and Credentials

### Same-Origin Requests

Cookies are automatically sent with no additional configuration:

```javascript
// From https://api.antbox.com to https://api.antbox.com
fetch('/v2/nodes')  // Cookie automatically included ✓
```

### Cross-Origin Requests

For cross-origin requests with cookies, you must:

1. **Client-side:** Use `credentials: 'include'`
```javascript
fetch('https://api.antbox.com/v2/nodes', {
  credentials: 'include'
})
```

2. **Server-side:** Antbox automatically sets proper CORS headers:
```
Access-Control-Allow-Origin: <your-origin>
Access-Control-Allow-Credentials: true
```

**Note:** Wildcard (`*`) origins are not supported with credentials.

## Security Best Practices

### For Web Applications

1. **Use HTTP-only cookies** for same-origin applications
2. **Enable SameSite=Strict** (default in Antbox)
3. **Always use HTTPS** in production
4. **Implement logout** to clear cookies

### For Mobile/Desktop Apps

1. **Use Bearer tokens** with Authorization header
2. **Store tokens securely** (Keychain/KeyStore)
3. **Never log tokens** or expose them in error messages
4. **Handle token expiration** (4 hours)

### For API Integrations

1. **Use API keys** with Authorization header
2. **Never commit keys** to version control
3. **Rotate keys** regularly
4. **Use query parameters** only as a last resort

### For Public APIs

1. **Configure folder permissions** carefully
2. **Use `permissions.anonymous`** for public read access
3. **Never grant Write** to anonymous users
4. **Monitor anonymous usage**

## Token Expiration and Renewal

**JWT Expiration:** 4 hours from issuance

When a token expires:
1. API returns `401 Unauthorized`
2. Client must re-authenticate via `/login/root`
3. New JWT is issued

**Cookie Expiration:** Automatically expires with JWT (4 hours)

**Current Limitation:** Antbox does not yet support refresh tokens. Users must re-authenticate after token expiration.

## Multi-Tenancy

Authentication is tenant-specific. Specify the tenant via:

1. **Header:** `X-Tenant: tenant-name`
2. **Query:** `?x-tenant=tenant-name`
3. **Default:** First tenant in configuration

**Example:**
```bash
curl http://localhost:7180/v2/nodes \
  -H "Authorization: Bearer <jwt>" \
  -H "X-Tenant: demo"
```

## Common Scenarios

### Scenario 1: SPA with Same Origin

```javascript
// Login
const password = await sha256('demo');
const response = await fetch('/login/root', {
  method: 'POST',
  body: password
});

// Cookie automatically set by browser
// All subsequent requests automatically authenticated
const nodes = await fetch('/v2/nodes').then(r => r.json());
```

### Scenario 2: Mobile App

```javascript
// Login
const response = await fetch('https://api.antbox.com/login/root', {
  method: 'POST',
  body: hashedPassword
});
const { jwt } = await response.json();

// Store JWT securely
await SecureStore.setItemAsync('auth_token', jwt);

// Use JWT in requests
const nodes = await fetch('https://api.antbox.com/v2/nodes', {
  headers: {
    'Authorization': `Bearer ${jwt}`
  }
}).then(r => r.json());
```

### Scenario 3: Server-to-Server

```bash
# Using API key
curl https://api.antbox.com/v2/nodes \
  -H "Authorization: ApiKey ${ANTBOX_API_KEY}"
```

### Scenario 4: Public Website

```javascript
// No authentication needed for public folders
const publicDocs = await fetch('/v2/nodes?parent=public-folder-uuid')
  .then(r => r.json());
```

## API Endpoints

### Login
- **POST** `/login/root` - Root user login
  - Body: SHA-256 hashed password (plain text)
  - Returns: JWT in response body + Sets cookie

### Logout
- **POST** `/login/logout` - Clear authentication cookie
  - Returns: Success message

## Troubleshooting

### "401 Unauthorized" Error

**Cause:** Token expired or invalid

**Solution:**
```bash
# Re-authenticate
curl -X POST http://localhost:7180/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)"
```

### Cookies Not Working

**Cause:** Cross-origin without `credentials: 'include'`

**Solution:**
```javascript
fetch(url, { credentials: 'include' })
```

### "403 Forbidden" Error

**Cause:** Authenticated but insufficient permissions

**Solution:**
Check folder permissions or user groups.

## Next Steps

- Learn about [Permissions and Authorization](./permissions.md)
- Configure [Multi-Tenant Authentication](./multi-tenancy.md)
- Set up [API Keys](./api-keys.md)
