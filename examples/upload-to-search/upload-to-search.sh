#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:7180}"
TENANT="${TENANT:-demo}"
ROOT_PASSWORD="${ROOT_PASSWORD:-demo}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

hash_root_password() {
  if command -v shasum >/dev/null 2>&1; then
    printf "%s" "$ROOT_PASSWORD" | shasum -a 256 | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then
    printf "%s" "$ROOT_PASSWORD" | sha256sum | cut -d' ' -f1
  else
    echo "shasum or sha256sum is required" >&2
    exit 1
  fi
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

ROOT_HASH=$(hash_root_password)
JWT=$(curl -sS -X POST "$BASE_URL/v2/login/root" \
  -H "X-Tenant: $TENANT" \
  --data "$ROOT_HASH" | jq -r '.jwt')

if [[ -z "$JWT" || "$JWT" == "null" ]]; then
  echo "Could not log in. Is Antbox running at $BASE_URL with tenant '$TENANT'?" >&2
  exit 1
fi

COMMON=(-H "X-Tenant: $TENANT" -H "Authorization: Bearer $JWT")
JSON=(-H "Content-Type: application/json")

FOLDER_UUID=$(curl -sS -X POST "$BASE_URL/v2/nodes" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d '{
    "title": "Tutorial Contracts",
    "mimetype": "application/vnd.antbox.folder",
    "parent": "--root--"
  }' | jq -r '.uuid')

cat > "$TMP_DIR/antbox-sample-contract.txt" <<'EOF'
ACME renewal agreement

This sample document is used by the Antbox upload-to-search example.
It demonstrates upload, metadata tagging, search, and export.
EOF

UPLOAD_METADATA=$(jq -nc --arg parent "$FOLDER_UUID" '{
  parent: $parent,
  title: "Sample Contract - ACME Renewal",
  description: "Demo document for the upload-to-search example",
  mimetype: "text/plain",
  tags: ["tutorial", "contract", "acme"]
}')

FILE_UUID=$(curl -sS -X POST "$BASE_URL/v2/nodes/-/upload" \
  "${COMMON[@]}" \
  -F "file=@$TMP_DIR/antbox-sample-contract.txt;type=text/plain" \
  -F "metadata=$UPLOAD_METADATA" | jq -r '.uuid')

cat > "$TMP_DIR/contract-metadata.json" <<'EOF'
{
  "title": "Contract Metadata Tutorial",
  "description": "Metadata used by the upload-to-search example",
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
  -F "file=@$TMP_DIR/contract-metadata.json;type=application/json" | jq -r '.uuid')

NODE_PATCH=$(jq -nc --arg aspect "$ASPECT_UUID" '{
  aspects: [$aspect],
  properties: {
    ($aspect + ":status"): "In Review",
    ($aspect + ":counterparty"): "ACME Ltd"
  }
}')

curl -sS -X PATCH "$BASE_URL/v2/nodes/$FILE_UUID" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "$NODE_PATCH" >/dev/null

SEARCH_BODY=$(jq -nc --arg aspect "$ASPECT_UUID" '{
  filters: [
    ["aspects", "contains", $aspect],
    [($aspect + ":status"), "==", "In Review"]
  ],
  pageSize: 10,
  pageToken: 1
}')

SEARCH_RESULT=$(curl -sS -X POST "$BASE_URL/v2/nodes/-/find" \
  "${COMMON[@]}" "${JSON[@]}" \
  -d "$SEARCH_BODY")

curl -sS "$BASE_URL/v2/nodes/$FILE_UUID/-/export" \
  "${COMMON[@]}" \
  -o "$TMP_DIR/downloaded-antbox-sample-contract.txt"

cat <<EOF
Upload-to-search example completed.

Folder UUID: $FOLDER_UUID
File UUID:   $FILE_UUID
Aspect UUID: $ASPECT_UUID

Search result:
$(printf "%s" "$SEARCH_RESULT" | jq '.nodes[] | {uuid, title, tags, properties}')

Exported content:
$(cat "$TMP_DIR/downloaded-antbox-sample-contract.txt")
EOF
