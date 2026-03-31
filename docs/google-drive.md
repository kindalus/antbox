---
name: google-drive
description: Google Drive Shared Drive adapter setup guide
---

# Google Drive

Antbox supports Google Drive through a **Shared Drive-only** storage adapter.

- Antbox uses a Google **service account** JSON key
- the configured Google target is a **Shared Drive ID**
- top-level Antbox nodes are written directly under the Shared Drive root
- Antbox only manages items it created, identified by `appProperties.uuid`

## Antbox Configuration

Use the Google Drive storage adapter in `config.toml`:

```toml
storage = [
	"google_drive/google_drive_storage_provider.ts",
	"./google-service-account.json",
	"<shared-drive-id>"
]
```

Parameters:

- first value: adapter module path
- second value: path to the Google service account JSON key
- third value: Google Shared Drive ID

Relative paths like `./google-service-account.json` are resolved from the Antbox config directory.

## Google Cloud Setup

### 1. Create or choose a Google Cloud project

- Open Google Cloud Console
- create a new project or select an existing one for Antbox

### 2. Enable the Google Drive API

- In the selected project, open `APIs & Services`
- enable `Google Drive API`

### 3. Create a service account

- Open `IAM & Admin` -> `Service Accounts`
- create a service account for Antbox
- generate a JSON key
- store the downloaded JSON file securely on the Antbox host

## Google Workspace Setup

Shared Drives require **Google Workspace**. Personal Google accounts are not enough.

### 4. Make sure Shared Drives are enabled

- In Google Workspace Admin, confirm Shared Drives are enabled for your organization
- confirm the users/admins who will manage the drive can create or administer Shared Drives

### 5. Create a Shared Drive

- In Google Drive, open `Shared drives`
- create a Shared Drive dedicated to Antbox content, or one where Antbox may coexist with other
  content

Antbox can coexist with unrelated content in the same Shared Drive, but it only manages items that
carry its `appProperties.uuid` marker.

## Blob Export Behavior

- regular uploaded files are exported from Google Drive as their stored binary content
- native Google Workspace files are exported through the Drive export API
- current built-in export mappings are:
  - Google Docs -> PDF
  - Google Sheets -> XLSX
  - Google Slides -> PDF

### 6. Add the service account as a member

- Open the Shared Drive
- open `Manage members`
- add the service account email from the JSON key

Recommended role:

- `Content manager`

This role should be sufficient for:

- creating files
- creating folders
- renaming files and folders
- moving files and folders
- trashing files and folders

### 7. Get the Shared Drive ID

- Open the Shared Drive in Google Drive
- copy the Shared Drive ID from the URL
- use that ID as the third value in the Antbox `storage` adapter config

## Validation Checklist

Before starting Antbox, verify:

- the Google Drive API is enabled in the Cloud project
- the service account JSON key path is correct on disk
- the service account is a member of the Shared Drive
- the Shared Drive ID in `config.toml` is correct

## Troubleshooting

### Service Accounts do not have storage quota

This usually means Google Drive operations are not being performed against a Shared Drive.

For Antbox, verify:

- you configured a **Shared Drive ID**, not a normal folder ID
- the service account is a member of that Shared Drive
- the Drive API is enabled in the same Google Cloud project as the service account

### Shared drive not found or access denied

Check:

- the Shared Drive ID is correct
- the service account was added as a member
- the membership role allows file creation and updates

### Files are not visible where expected

Antbox writes top-level nodes directly under the Shared Drive root. Child nodes are placed under the
corresponding Antbox folder nodes inside the same Shared Drive.

### Delete returns a Google Drive error for an existing file

Antbox delete in Shared Drive mode moves items to the Google Drive trash instead of permanently
deleting them.

Verify:

- the service account still has `Content manager` or stronger access on the Shared Drive
- the item still belongs to the configured Shared Drive
- the item still has the Antbox `appProperties.uuid` metadata used for lookup
