---
name: authentication
description: Authentication methods and usage
---

# Authentication

Antbox supports multiple authentication methods. The server evaluates credentials in a fixed
priority order and falls back to anonymous access when none are provided.

## Priority Order

1. **API Key (header)**: `Authorization: ApiKey <key>`
2. **Bearer token (header)**: `Authorization: Bearer <jwt>`
3. **Cookie**: `token=<jwt>`
4. **API Key (query)**: `?api_key=<key>`
5. **Anonymous** (no credentials)

## Root Login (JWT)

Root login expects the SHA-256 hash of the root password (`rootPasswd` in tenant config).

```bash
curl -X POST http://localhost:7180/v2/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | sha256sum | cut -d' ' -f1)"
```

macOS:

```bash
curl -X POST http://localhost:7180/v2/login/root \
  -H "Content-Type: text/plain" \
  -d "$(echo -n 'demo' | shasum -a 256 | cut -d' ' -f1)"
```

Response:

```json
{
	"jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Cookie Authentication

The server sets an HTTP-only cookie on login:

```
Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400
```

Notes:

- The cookie is **Secure**, so browsers do not send it over plain HTTP. Use Bearer tokens for local
  HTTP testing or run behind HTTPS.
- `Max-Age` matches the JWT expiration (4 hours).

## API Keys

Use an API key in the Authorization header:

```bash
curl http://localhost:7180/v2/nodes \
  -H "Authorization: ApiKey your-api-key"
```

Fallback query format:

```bash
curl "http://localhost:7180/v2/nodes?api_key=your-api-key"
```

## Multi-Tenancy

Specify the tenant per request:

- **Header**: `X-Tenant: tenant-name`
- **Query**: `?x-tenant=tenant-name`

If omitted, Antbox uses the first tenant in the configuration.

## Endpoints

- **POST** `/v2/challenge` - validate external bearer JWT and check whether a local Antbox user
  exists
- **POST** `/v2/login` - validate external bearer JWT and return `{ email, name, groups }`
- **POST** `/v2/login/root` - root login (returns JWT + cookie)
- **POST** `/v2/login/logout` - clear auth cookie
- **GET** `/v2/login/me` - current user profile (requires auth)

## External Login Flow

For non-root users, Antbox supports an external identity resolution flow.

- both `/v2/challenge` and `/v2/login` require `Authorization: Bearer <jwt>`
- Antbox validates the JWT against the tenant JWK
- Antbox resolves the identity using claims in this order:
  1. `email`
  2. `phone_number`
  3. `phone`
- if both `email` and phone are present, `email` wins
- Antbox then looks up the local user and always resolves groups from the Antbox user record, not
  from JWT groups

`POST /v2/challenge`

- returns `204` if a matching local user exists
- returns `404` otherwise

`POST /v2/login`

- returns:

```json
{
	"email": "john.doe@example.com",
	"name": "John Doe",
	"groups": ["developers", "staff"]
}
```

The external tool can use this response to build its own JWT for subsequent requests. Antbox will
still override JWT groups on every request with the groups stored in the local Antbox user.

## Token Expiration

- JWTs expire after 4 hours.
- Antbox does not issue refresh tokens; re-authenticate when a token expires.

## CORS and Credentials

For cross-origin cookie usage, the client must send `credentials: "include"` and the server responds
with `Access-Control-Allow-Credentials: true` and a specific origin.
