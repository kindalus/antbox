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
	return new Promise((resolve) => {
		Deno.serve({
			port: options.port ?? 7180,
			hostname: options.hostname,
			signal: options.signal,
			cert: options.tls?.cert,
			key: options.tls?.key,
			onListen: (addr) => resolve({ hostname: addr.hostname, port: addr.port }),
		}, fetch);
	});
}
