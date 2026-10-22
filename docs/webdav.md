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
- Requests without a known tenant in this exact path return `400 Bad Request`.

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

File GET and HEAD responses keep the original bytes and MIME type. They include `nosniff` and a
[CSP sandbox](https://www.w3.org/TR/CSP3/#directive-sandbox) so browser views cannot run scripts,
submit forms, or load external resources from uploaded documents. Native WebDAV file transfers are
unchanged.

## Common issues

- `401 Unauthorized`: wrong credentials, missing auth, or wrong username prefix.
- `403 Forbidden`: your group lacks required permissions on the target folder.
- `400 Bad Request`: unknown tenant, conflicting tenant selectors, or invalid destination URL.
- `404` / `NodeNotFoundError`: the requested path does not exist.
- `409 Conflict`: a COPY or MOVE destination already exists; replacement is not supported.
- `412 Precondition Failed`: a destination exists and the request specified `Overwrite: F`.
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
- The tenant in the URL selects both authentication and content storage. An `x-tenant` query or
  `X-Tenant` header must agree with that tenant; conflicting selectors return `400`.
- COPY and MOVE accept an absolute URL or an absolute path in `Destination`. It must remain within
  the same origin and tenant. Behind a reverse proxy, an absolute URL must match the effective
  request origin; an absolute path such as `/webdav/demo/Folder/file.txt` avoids that mismatch.
- COPY requires Read and Export on the source file and Write on the destination folder. MOVE also
  checks Write on the destination. Moving a folder inside itself is rejected.
- Existing COPY/MOVE destinations are preserved: `Overwrite: F` returns `412`; the default or `T`
  returns `409` because replacing an existing destination is not implemented.
- Lock timeouts and conditional `If` headers are not fully implemented. Locks follow Antbox's
  owner/group authorization model, and an advertised timeout does not expire a lock automatically.
- `OPTIONS /webdav/*` is explicitly supported for capability negotiation.
