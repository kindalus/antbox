# Security Administration

This guide covers user, group, and API key administration endpoints.

## Users API

- `POST /v2/users` - create user
- `GET /v2/users` - list users
- `GET /v2/users/{email}` - get user
- `PATCH /v2/users/{email}` - update user
- `DELETE /v2/users/{uuid}` - delete user (current route shape)

Create payload example:

```json
{
  "email": "jane@example.com",
  "title": "Jane Doe",
  "group": "--users--",
  "groups": ["--users--"],
  "hasWhatsapp": false,
  "active": true
}
```

## Groups API

- `POST /v2/groups`
- `GET /v2/groups`
- `GET /v2/groups/{uuid}`
- `DELETE /v2/groups/{uuid}`

Create payload example:

```json
{
  "title": "Finance",
  "description": "Finance department"
}
```

## API keys API

- `POST /v2/api-keys`
- `GET /v2/api-keys`
- `GET /v2/api-keys/{uuid}`
- `DELETE /v2/api-keys/{uuid}`

Create payload example:

```json
{
  "title": "CI pipeline",
  "group": "--admins--",
  "description": "Key for automated tasks",
  "active": true
}
```

The create response includes the generated `secret`. Store it securely; it is the credential used in
`Authorization: ApiKey <secret>`.

## Access model

- users/groups/API keys create/update/delete operations are admin-only.
- non-admin users can only read what their specific service rules allow.
