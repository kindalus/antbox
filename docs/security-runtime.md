---
name: security-runtime
description: Runtime isolation and container hardening
---

# Runtime Security

Bun has no permission model. Deno blocked subprocesses and limited file and network access for
dynamic feature code; Bun does not. Dynamic features, automatic features, `runAs` features and the
`run_code` tool of AI agents can read any file the process can read, open network connections and
spawn processes.

The container is the security boundary. Antbox does not ship a seccomp profile: the entrypoint needs
`execve` to start, so plain seccomp cannot deny it afterwards. Reduce what the process can do
instead.

## Recommended run options

```bash
docker run -d --name antbox \
  --user antx \
  --read-only \
  --tmpfs /tmp \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit 256 \
  -p 7180:7180 \
  -v antbox-data:/app/data \
  -v antbox-config:/app/.config/demo \
  antbox-demo
```

Compose equivalent:

```yaml
services:
   antbox:
      image: antbox-demo
      user: antx
      read_only: true
      tmpfs: [/tmp]
      cap_drop: [ALL]
      security_opt: ["no-new-privileges:true"]
      pids_limit: 256
      ports: ["7180:7180"]
      volumes: ["antbox-data:/app/data", "antbox-config:/app/.config/demo"]
volumes:
   antbox-data:
   antbox-config:
```

## Notes

- Only `/app/data`, the config directory (Antbox writes its crypto keys there on first start; use
  `/app/.config/sandbox` for the sandbox image) and `/tmp` are writable. Mount secrets and tenant configuration read-only.
- The images in `build/docker/` run as the non-root user `antx`, contain no compilers, and start
  `bun` directly, without a shell wrapper. The base image still ships a shell and basic tools; a
  distroless image with the Bun binary removes them.
- Restrict outbound traffic with network policy if features do not need internet access. Feature
  code can reach anything the container can reach, including cloud metadata endpoints.
- Do not give feature authors more trust than you give an operator of the host.
