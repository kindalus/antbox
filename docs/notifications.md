---
name: notifications
description: Notifications API usage
---

# Notifications

Notifications are stored in configuration and can target:

- a user (`targetUser`)
- a group (`targetGroup`)
- or both

Priorities:

- `CRITICAL`
- `INFO`
- `INSIGHT`

## Endpoints

- `GET /v2/notifications` - list notifications visible to current user
- `POST /v2/notifications/-/critical`
- `POST /v2/notifications/-/info`
- `POST /v2/notifications/-/insight`
- `POST /v2/notifications/-/delete`
- `POST /v2/notifications/-/clear`

## Send payload

All three send endpoints accept:

```json
{
  "targetUser": "user@example.com",
  "targetGroup": "--admins--",
  "title": "Build finished",
  "body": "Nightly process completed"
}
```

Rules:

- `title` is required.
- `body` is required.
- at least one target (`targetUser` or `targetGroup`) is required.

## Delete payload

`POST /v2/notifications/-/delete`

```json
{
  "uuids": ["uuid-1", "uuid-2"]
}
```

## Clear behavior

`POST /v2/notifications/-/clear` removes notifications targeted directly to the current user.
Group-targeted notifications are not removed by this endpoint.

## Access model

- list returns notifications that target the current user or one of the user's groups.
- delete enforces the same visibility rule per notification.
