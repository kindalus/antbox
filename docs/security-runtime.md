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
      read_only: true
      tmpfs: [/tmp]
      cap_drop: [ALL]
      security_opt: ["no-new-privileges:true"]
      pids_limit: 256
      ports: ["7180:7180"]
      volumes: ["antbox-data:/app/data", "antbox-config:/app/.config/demo"]
      healthcheck:
         test:
            - CMD
            - /usr/local/bin/bun
            - -e
            - "fetch('http://127.0.0.1:7180/v2/heartbeat').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
         interval: 30s
         timeout: 5s
volumes:
   antbox-data:
   antbox-config:
```

## The images

`build/docker/Demo` and `build/docker/Sandbox` are multi-stage builds. A `oven/bun:1.4.0-slim`
stage runs `bun install --frozen-lockfile --production` and prepares the writable directories. The
final stage is `oven/bun:1.4.0-distroless` (both are Debian 13 with glibc). It runs as the numeric
user `65532:65532`, which has no `/etc/passwd` entry, with `HOME=/tmp`, and its entrypoint is
`/usr/local/bin/bun --no-env-file main.ts`. The default command is `--demo --data-dir /app`
(`--sandbox --data-dir /app` for the sandbox), so data goes to `/app/data` and the configuration
directory only holds the config, the JWKS and the generated keys.

The image contains no shell, no package manager and no coreutils. `/bin`, `/usr/bin`, `/sbin` and
`/usr/sbin` are empty; `/usr/local/bin` holds only `bun` and `bunx`. `docker exec <c> sh`, `bash`,
`ls` and `cat` fail with "executable not found".

Named volumes mounted over `/app/data` and the config directory inherit the ownership of the image
path (65532), so they are writable by the process, including when the volume is new. When you
bind-mount a host directory instead, `chown 65532:65532` it first.

## What the shell-less image does and does not do

A shell-less image is **not a sandbox**. It removes the tools an attacker would use after a
shell-style break-in; it does not restrict what the Bun process itself can do. Measured from
dynamic feature code (an uploaded action) running in the hardened container
(`--read-only --tmpfs /tmp --cap-drop=ALL --security-opt=no-new-privileges --pids-limit 256`):

| Attempt from feature code                         | Result                                          |
| ------------------------------------------------- | ----------------------------------------------- |
| `execSync('id')`                                  | Fails: `ENOENT ... posix_spawn '/bin/sh'`       |
| `spawnSync('/bin/sh', ['-c', 'id'])`              | Fails: `ENOENT`                                 |
| `spawnSync(process.execPath, ['-e', ...])`        | Works. Bun can be re-executed with any script   |
| Bun's built-in shell (`Bun.$`)                    | Works for built-ins such as `echo`; no external binaries exist |
| Read `/proc/self/environ`                         | Works. Every environment variable is readable   |
| Read `/app/.config/antbox.key` (JWT signing key)  | Works                                           |
| Read `<config dir>/antbox.key`, `antbox-private.jwk`, `config.toml` | Work, including `rootPasswd` |
| Write to `/app`, `/usr/local/bin`                 | Fails: read-only file system                    |
| Write to `/tmp`, `/app/data`, the config volume   | Works                                           |
| Outbound HTTPS (`fetch`) and raw TCP              | Works                                           |
| Child processes inherit the environment           | Yes                                             |

So dynamic code can still read every secret the process can read (environment variables such as
LLM and S3 keys, the signing key, the private JWK, the root password), forge tokens, read and
rewrite all data and configuration on the volumes, reach any network the container can reach, and
run arbitrary programs by re-executing `bun`. The read-only root filesystem only stops it from
changing the application code and the image.

Still needed: run dynamic code (features, automatic features, `runAs`, AI `run_code`) in a separate
isolated service that does not hold these secrets, and do not share a container, volume or network
with data that dynamic code must not see. Until then, treat anyone who can upload a feature as an
operator.

## Debugging without a shell

There is no `sh` to exec into. Use the Bun binary directly, with the same volumes if you need to
look at state:

```bash
# Inspect files
docker run --rm --entrypoint /usr/local/bin/bun \
  -v antbox-data:/app/data -v antbox-config:/app/.config/demo antbox-demo \
  -e "console.log(require('fs').readdirSync('/app/data'))"

# Run something inside the running container
docker exec antbox /usr/local/bin/bun -e "console.log(process.env.PORT)"

# Test outbound access (CA certificates, DNS)
docker run --rm --entrypoint /usr/local/bin/bun antbox-demo \
  -e "console.log((await fetch('https://example.com')).status)"
```

A Compose `HEALTHCHECK` cannot use `curl`, `wget` or the shell form (`CMD-SHELL`), because none of
them exist. Use the exec form with Bun, as in the Compose example above.

## Notes

- Only `/app/data`, the config directory (Antbox writes its JWKS and generated keys there on first
  start; use `/app/.config/sandbox` for the sandbox image) and `/tmp` are writable. Mount secrets
  and tenant configuration read-only.
- The JWT signing key `/app/.config/antbox.key` referenced by the demo and sandbox configs is copied
  into the image from the repository. It is not secret. Do not use these images as they are for
  anything that matters; mount your own configuration and key.
- The sandbox image keeps its data in memory and loses it on restart.
- `bun` runs as PID 1 and does not handle `SIGTERM`, so `docker stop` waits for its timeout and
  then kills it (about 10 seconds). Use `--stop-timeout 1` or `--init` if the runtime provides one.
- Restrict outbound traffic with network policy if features do not need internet access. Feature
  code can reach anything the container can reach, including cloud metadata endpoints.
- Do not give feature authors more trust than you give an operator of the host.
