---
name: tutorial-upload-to-search
description: End-to-end tutorial for uploading, tagging, searching, and exporting a document
---

# Tutorial: Upload, Tag, Search, and Export a Document

This tutorial walks through a complete first content workflow using only the REST API:

1. Start the demo server.
2. Log in as root.
3. Create a folder.
4. Upload a text document.
5. Create an aspect metadata schema.
6. Attach metadata to the uploaded document.
7. Find the document by metadata.
8. Export the document content.

The same flow is available as a runnable shell script in
`examples/upload-to-search/upload-to-search.sh`.

## Prerequisites

- Deno 2.0+
- `curl`
- `jq`
- macOS or Linux shell

## 1. Start Antbox

In one terminal:

```bash
./start_server.sh --demo
```

The demo server listens on `http://localhost:7180` and uses:

- tenant: `demo`
- root password: `demo`

## 2. Set variables and log in

In another terminal:

```bash
BASE_URL="http://localhost:7180"
TENANT="demo"
ROOT_PASSWORD="demo"

ROOT_HASH=$(printf "%s" "$ROOT_PASSWORD" | shasum -a 256 | cut -d' ' -f1)

JWT=$(curl -sS -X POST "$BASE_URL/v2/login/root" \
  -H "X-Tenant: $TENANT" \
  --data "$ROOT_HASH" | jq -r '.jwt')

COMMON=(-H "X-Tenant: $TENANT" -H "Authorization: Bearer $JWT")
JSON=(-H "Content-Type: application/json")
```

If you are on Linux and do not have `shasum`, use `sha256sum` instead:

```bash
ROOT_HASH=$(printf "%s" "$ROOT_PASSWORD" | sha256sum | cut -d' ' -f1)
```

## 3. Create a folder

```bash
FOLDER_UUID=$(curl -sS -X POST "$BASE_URL/v2/nodes" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{
    "title": "Tutorial Contracts",
    "mimetype": "application/vnd.antbox.folder",
    "parent": "--root--"
  }' | jq -r '.uuid')

echo "Folder: $FOLDER_UUID"
```

## 4. Upload a document

Create a small local text file:

```bash
cat > ./antbox-sample-contract.txt <<'EOF'
ACME renewal agreement

This sample document is used by the Antbox upload-to-search tutorial.
It demonstrates upload, metadata tagging, search, and export.
EOF
```

Upload it as a file node:

```bash
UPLOAD_METADATA=$(jq -nc --arg parent "$FOLDER_UUID" '{
  parent: $parent,
  title: "Sample Contract - ACME Renewal",
  description: "Demo document for the upload-to-search tutorial",
  mimetype: "text/plain",
  tags: ["tutorial", "contract", "acme"]
}')

FILE_UUID=$(curl -sS -X POST "$BASE_URL/v2/nodes/-/upload" \
  "${COMMON[@]}" \
  -F "file=@./antbox-sample-contract.txt;type=text/plain" \
  -F "metadata=$UPLOAD_METADATA" | jq -r '.uuid')

echo "File: $FILE_UUID"
```

## 5. Create an aspect metadata schema

Aspects define reusable metadata fields. This aspect applies to text files and makes both fields
searchable.

```bash
cat > ./contract-metadata.json <<'EOF'
{
  "title": "Contract Metadata Tutorial",
  "description": "Metadata used by the upload-to-search tutorial",
  "filters": [["mimetype", "==", "text/plain"]],
  "properties": [
    {
      "name": "status",
      "title": "Status",
      "type": "string",
      "required": true,
      "searchable": true,
      "validationList": ["Draft", "In Review", "Approved"],
      "defaultValue": "Draft"
    },
    {
      "name": "counterparty",
      "title": "Counterparty",
      "type": "string",
      "required": false,
      "searchable": true
    }
  ]
}
EOF

ASPECT_UUID=$(curl -sS -X POST "$BASE_URL/v2/aspects/-/upload" \
  "${COMMON[@]}" \
  -F "file=@./contract-metadata.json;type=application/json" | jq -r '.uuid')

echo "Aspect: $ASPECT_UUID"
```

## 6. Attach metadata to the uploaded document

```bash
NODE_PATCH=$(jq -nc --arg aspect "$ASPECT_UUID" '{
  aspects: [$aspect],
  properties: {
    ($aspect + ":status"): "In Review",
    ($aspect + ":counterparty"): "ACME Ltd"
  }
}')

curl -sS -X PATCH "$BASE_URL/v2/nodes/$FILE_UUID" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "$NODE_PATCH" | jq
```

## 7. Find the uploaded document

Search for the document by the aspect metadata you just attached:

```bash
SEARCH_BODY=$(jq -nc --arg aspect "$ASPECT_UUID" '{
  filters: [
    ["aspects", "contains", $aspect],
    [($aspect + ":status"), "==", "In Review"]
  ],
  pageSize: 10,
  pageToken: 1
}')

curl -sS -X POST "$BASE_URL/v2/nodes/-/find" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "$SEARCH_BODY" | jq '.nodes[] | {uuid, title, tags, properties}'
```

You can also search by the tags set during upload:

```bash
curl -sS -X POST "$BASE_URL/v2/nodes/-/find" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{"filters":[["tags","contains","tutorial"]],"pageSize":10,"pageToken":1}' | \
  jq '.nodes[] | {uuid, title, tags}'
```

## 8. Export the document

```bash
curl -sS "$BASE_URL/v2/nodes/$FILE_UUID/-/export" \
  "${COMMON[@]}" \
  -o ./downloaded-antbox-sample-contract.txt

cat ./downloaded-antbox-sample-contract.txt
```

## What you learned

You completed the core Antbox content loop:

```text
folder → upload file → define metadata → attach metadata → find node → export file
```

From here, try adding a workflow definition, a feature action, or an AI agent on top of the same
uploaded document.
