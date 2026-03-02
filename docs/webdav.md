# WebDAV

Antbox exposes a WebDAV adapter under `/webdav`.

## Endpoint prefix

- `/webdav/*`

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

## Notes

- Authentication and tenant resolution follow the same middleware model used by HTTP APIs.
- Use `X-Tenant` header (or `x-tenant` query parameter) when running multi-tenant deployments.
- `OPTIONS /webdav/*` is explicitly supported for capability negotiation.
