---
name: authentication
description: Authentication methods and usage
---

# Authentication

Antbox supports multiple authentication methods. The server evaluates credentials in a fixed
priority order and falls back to anonymous access when none are provided.

## Priority Order

1. **API Key (header)**: `Authorization: ApiKey <key>`
2. **API Key (query)**: `?api_key=<key>`
3. **Bearer token (header)**: `Authorization: Bearer <jwt>`
4. **Cookie**: `token=<jwt>`
5. **Anonymous** (no credentials)

## Root Login (JWT)

Root login expects the SHA-256 hash of the root password (`rootPasswd` in tenant config or inherited
from global config). Startup requires a nonempty password. Newly generated `config.toml` files
contain a random password. The commands below use the local demo password; replace it with the value
from your configuration.

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

Root JWTs are valid only for the tenant selected at login, including when tenants share a signing
key. Existing root sessions without a tenant audience must log in again after upgrading.

## Cookie Authentication

The server sets an HTTP-only cookie on login:

```
Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400
```

Notes:

- The cookie is **Secure**, so browsers do not send it over plain HTTP. Use Bearer tokens for local
  HTTP testing or run behind HTTPS.
- `Max-Age` matches the root JWT expiration of 4 hours.
- Cookie authentication accepts same-origin requests. Cross-origin browser clients must send an
  explicit Bearer token or API key.

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
- Antbox validates the JWT against the tenant JWKS
- External JWTs must include `exp`. If `email_verified` or `phone_number_verified` is present for
  the selected identity, it must be `true`.
- Antbox resolves the identity using claims in this order:
  1. `email`
  2. `phone_number`
  3. `phone`
- if both `email` and phone are present, `email` wins
- Antbox then looks up the local user and always resolves groups from the Antbox user record, not
  from JWT groups
- The local user must be active. Builtin system identities, including root, cannot use external
  login.
- Phone login requires exactly one matching local user; ambiguous phone numbers are rejected.

`POST /v2/challenge`

- returns `204` for a valid token with a matching active local user
- returns `404` when the selected identity has no local user
- returns `401` for invalid tokens, inactive users, builtin identities, or ambiguous phone matches
- returns `400` when a verified token has no email or phone identity

`POST /v2/login`

- returns:

```json
{
	"email": "john.doe@example.com",
	"name": "John Doe",
	"groups": ["developers", "staff"]
}
```

Subsequent requests must use a JWT signed by a key trusted through the tenant's JWKS. The login
response does not grant signing authority. Antbox resolves groups on every request from the local
Antbox user record.

## Token Expiration

- Root JWTs expire after 4 hours. External JWTs use their issuer's `exp` claim.
- Antbox does not issue refresh tokens; re-authenticate when a token expires.

## CORS and Credentials

Cross-origin clients authenticate with an explicit `Authorization` header. Browser requests marked
`Sec-Fetch-Site: same-site` or `cross-site` cannot use cookies. `same-origin` requests work behind
TLS termination proxies; proxies must preserve this browser header. When it is absent, cookies
require an absent `Origin` header or an origin matching the API request URL.
