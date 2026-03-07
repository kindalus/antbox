---
name: webdav
description: WebDAV desktop mounting guide and protocol details
---

# WebDAV

Use Antbox WebDAV to mount content as a network drive on desktop clients (macOS, Windows, Linux).

## End-user quick start

### What you need from your administrator

- Server base URL (example: `https://files.example.com`)
- Tenant name (example: `demo`)
- API key secret

### Mount URL

Use this URL format:

- `https://<host>/webdav/<tenant-name>/`

Example:

- `https://files.example.com/webdav/demo/`

Important:

- Include the tenant in the path (`/webdav/<tenant-name>/`).
- If you only use `/webdav`, most clients will not resolve the repository root correctly.

### Credentials (recommended)

Use Basic authentication with:

- Username: `key`
- Password: `<api-key-secret>`

Do not use your email as WebDAV username. Antbox WebDAV accepts `key` or `jwt` only.

## Mount on desktop systems

### macOS (Finder)

1. Finder -> Go -> Connect to Server (or `Cmd + K`)
2. Server Address: `https://<host>/webdav/<tenant-name>/`
3. Username: `key`
4. Password: `<api-key-secret>`

### Windows (File Explorer)

1. Open "Map network drive" or "Add a network location"
2. Address: `https://<host>/webdav/<tenant-name>/`
3. Username: `key`
4. Password: `<api-key-secret>`

### Linux (file manager)

- HTTPS: `davs://<host>/webdav/<tenant-name>/`
- HTTP (local/dev): `dav://<host>:<port>/webdav/<tenant-name>/`
- Username: `key`
- Password: `<api-key-secret>`

## What users can do through WebDAV

- Browse folders and files
- Download files
- Upload new files
- Replace file content
- Create folders
- Copy, move, and delete nodes
- Lock and unlock resources (client dependent)

## Common issues

- `401 Unauthorized`: wrong credentials, missing auth, or wrong username prefix.
- `403 Forbidden`: your group lacks required permissions on the target folder.
- `404` / `NodeNotFoundError`: wrong tenant path in URL.
- `423 Locked`: resource locked by another user.
- `400 Invalid file name`: uploads like `._*` are rejected.

## Alternative authentication mode

WebDAV also supports JWT via Basic auth:

- Username: `jwt`
- Password: `<jwt-token>`

API key mode (`key`) is usually better for persistent desktop mounts.

## Supported methods

- `OPTIONS`
- `PROPFIND`
- `GET`
- `HEAD`
- `PUT`
- `DELETE`
- `MKCOL`
- `COPY`
- `MOVE`
- `LOCK`
- `UNLOCK`

## Technical notes

- Endpoint prefix: `/webdav/*`
- WebDAV Basic auth is translated internally as:
  - `key:<secret>` -> `Authorization: ApiKey <secret>`
  - `jwt:<token>` -> `Authorization: Bearer <token>`
- Tenant resolution follows server rules (`x-tenant` query, then `X-Tenant` header, then default).
- `OPTIONS /webdav/*` is explicitly supported for capability negotiation.
