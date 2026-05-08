# Upload to Search Example

This runnable example demonstrates the first Antbox content loop:

```text
folder → upload file → define metadata → attach metadata → find node → export file
```

## Run

Start the demo server in another terminal:

```bash
./start_server.sh --demo
```

Then run:

```bash
./examples/upload-to-search/upload-to-search.sh
```

Optional environment variables:

```bash
BASE_URL="http://localhost:7180" \
TENANT="demo" \
ROOT_PASSWORD="demo" \
./examples/upload-to-search/upload-to-search.sh
```

See `docs/tutorial-upload-to-search.md` for the guided walkthrough.
