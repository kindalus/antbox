---
name: security-administration
description: Users, groups, and API keys administration
---

# Security Administration

This guide covers user, group, and API key administration endpoints.

## Users API

- `POST /v2/users` - create user
- `GET /v2/users` - list users
- `GET /v2/users/{email}` - get user
- `PATCH /v2/users/{email}` - update user
- `DELETE /v2/users/{email}` - delete user

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

- Creating and deleting users, groups, and API keys requires admin access.
- Users can update their own profile. Only admins can change `group`, `groups`, or `active`.
- Non-admin users can only read what their specific service rules allow.

Notifications and user preferences require authentication for every operation. Anonymous requests
return `401`; they cannot create notifications or read and modify a shared anonymous preferences
record. Authenticated callers retain access to their own preferences.
