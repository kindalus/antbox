# Dependency audit

Reviewed on 2026-10-22 with Deno 2.7.14. `deno audit` reported 31 findings before the refresh and 22
afterward: 11 high, 8 moderate, and 3 low. The remaining findings are described below; the audit
still exits unsuccessfully. No advisory suppression was added.

## Dependency updates

Only DOMPurify changed its direct version, from 3.4.15 to 3.4.17. Deno refreshed the existing Google
Drive, JSDOM, and Pi coding agent dependency trees within their declared constraints, keeping those
direct versions unchanged. That dependency refresh added no direct dependency or override. Lifecycle
scripts were not enabled during this update.

The S3 adapter now directly imports `@aws-sdk/client-s3@3.1040.0` through an explicit `deno.json`
alias. This is the version already installed through `@hk/s3@0.1.0`; it adds a direct declaration
without upgrading the SDK. Direct commands preserve object errors and MIME types and avoid
downloading an object before deleting it.

| Dependency      | Before | After  | Reason                                                                    |
| --------------- | ------ | ------ | ------------------------------------------------------------------------- |
| DOMPurify       | 3.4.15 | 3.4.17 | Sanitizer fixes; Antbox does not use the affected `IN_PLACE` option.      |
| brace-expansion | 5.0.9  | 5.0.12 | Bounds pathological brace expansion through minimatch.                    |
| qs              | 6.15.1 | 6.16.1 | Parser limit and serialization fixes in the Google Drive dependency tree. |
| source-map-js   | 1.2.1  | 1.2.2  | Indexed source-map denial-of-service fix in JSDOM's CSS dependency tree.  |

See the [DOMPurify releases](https://github.com/cure53/DOMPurify/releases),
[brace-expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[qs changelog](https://github.com/ljharb/qs/blob/main/CHANGELOG.md), and
[source-map-js release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).

## Remaining findings

These reachability assessments apply to the application source and dependency versions reviewed on
the date above. Recheck them when adding imports, changing AI execution, or upgrading packages.

### Unused document-template lock entries

`@xmldom/xmldom@0.9.11` accounts for 11 findings, including 9 high. It is retained through the old
`docxtemplater@3.69.3` lock entry. Neither `docxtemplater` nor `pizzip` appears in the manifest or
application imports. No application path to the affected XML parser or serializer was found. The
packages remain in the lockfile and may still be installed by Deno.

[xmldom 0.9.12](https://github.com/xmldom/xmldom/releases/tag/0.9.12) contains fixes. Deno 2.7 keeps
historical lock specifiers. A full lock regeneration would remove these entries but also refresh
unrelated dependency trees. That broader update was deferred; do not reintroduce the old
document-template packages without updating them.

### Pi's pinned Undici

`@earendil-works/pi-coding-agent@0.84.1` pins `undici@8.9.0` exactly, accounting for 10 findings,
including 2 high. Pi's `dist/core/http-dispatcher.js` imports Undici, but constructs its client,
pool, and proxy agent and replaces global fetch only inside `configureHttpDispatcher()`. Calls to
that function occur in Pi's CLI, main, RPC entrypoint, and interactive mode.

Antbox's `src/application/ai/pi_agent_session.ts` and `resolve_model.ts` use the SDK session and
model runtime APIs. They do not start those entrypoints or configure that dispatcher. No Antbox call
to Undici WebSocket, cache, retry, response, or BalancedPool APIs was found. The package is loaded
through Pi's exports, but the vulnerable APIs were not found on the application's execution path.
Deno supplies the application's global fetch.

[Undici 8.10.2](https://github.com/nodejs/undici/releases/tag/v8.10.2) fixes these advisories. Pi
0.84.x and 0.85.x retain the old exact pin. Pi 0.86.0 changes it to 8.10.2, but its
[release notes](https://github.com/earendil-works/pi/releases/tag/v0.86.0) declare breaking
provider-context and tool-data changes. Upgrade Pi as a tested migration; do not force a transitive
override or enable Pi CLI execution based on this assessment.

### UUID buffer APIs

`@google/genai@1.25.0` reaches `uuid@9.0.1` through `google-auth-library@9.15.1` and `gaxios@6.7.1`.
The one moderate finding concerns the `v3`, `v5`, and `v6` methods with caller-supplied output
buffers. Gaxios's `build/src/gaxios.js` calls only `v4()` without a buffer to generate multipart
boundaries. The [advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) explicitly excludes
the `v4` method. No affected call was found. A future Google SDK upgrade should remove this old
dependency; forcing UUID across major versions is unnecessary for this call site.

## Reproducible checks

Keep `deno.lock` in version control. `package.json` remains empty; direct dependencies belong in
`deno.json`. Both Dockerfiles already use frozen dependency resolution. There is no repository CI
workflow; a CI job should use these commands with Deno 2.7.14:

```sh
deno install --frozen --entrypoint main.ts
deno test --frozen --allow-all --unstable-raw-imports
deno audit
```

The audit command currently reports the retained findings above. Review its output rather than
ignoring every unsuccessful audit. Deno blocks dependency lifecycle scripts by default; preserve
that policy and review any package-specific exceptions.

Use Deno's package commands to update the manifest and lockfile, then run frozen checks. Do not edit
integrity hashes or resolved versions in the lockfile by hand. See Deno's
[supply-chain guidance](https://docs.deno.com/runtime/packages/supply_chain/).

Verification after this refresh passed a frozen install of `main.ts` and 68 test steps across the
article, article-integrity, Pi session, model runtime, Google Drive, and metrics suites.
