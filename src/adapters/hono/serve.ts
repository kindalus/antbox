/** Runtime seam: the only file of the HTTP adapter that touches the platform server API. */

export interface ServeOptions {
	port?: number;
	hostname?: string;
	signal?: AbortSignal;
	tls?: { cert: string; key: string };
}

export interface ListenInfo {
	hostname: string;
	port: number;
}

// Antbox imposes no transport-level limits: tenant quotas bound uploads and handlers may stream
// for as long as they need.
const MAX_REQUEST_BODY_SIZE = Number.MAX_SAFE_INTEGER;

/**
 * Starts serving a fetch function and resolves once the socket is listening.
 *
 * @remarks
 * External setup: the process needs permission to bind the port.
 */
export function startServer(
	fetch: (request: Request) => Response | Promise<Response>,
	options: ServeOptions,
): Promise<ListenInfo> {
	const server = Bun.serve({
		port: options.port ?? 7180,
		hostname: options.hostname,
		idleTimeout: 0,
		maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
		tls: options.tls ? { cert: options.tls.cert, key: options.tls.key } : undefined,
		fetch,
	});

	options.signal?.addEventListener("abort", () => void server.stop(true), { once: true });
	if (options.signal?.aborted) void server.stop(true);

	return Promise.resolve({ hostname: server.hostname ?? "0.0.0.0", port: server.port ?? 0 });
}
