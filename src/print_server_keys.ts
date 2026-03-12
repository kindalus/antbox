import { Logger } from "shared/logger.ts";
import { ROOT_PASSWD, SYMMETRIC_KEY } from "setup/server_defaults.ts";
import { fileExistsSync, readFileSync } from "shared/os_helpers.ts";

/**
 * Prints server cryptographic keys to stdout.
 *
 * @remarks
 * External setup:
 * - Ensure the JWKS file exists (default: `.config/antbox.jwks`) or pass `jwksPath`.
 * - Deno requires `--allow-read` to read the JWKS file.
 *
 * @example
 * printServerKeys({ jwksPath: "./.config/antbox.jwks" });
 */
export function printServerKeys(opts?: {
	passwd?: string;
	symmetricKey?: string;
	jwksPath?: string;
}) {
	Logger.info("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

	Logger.info("Symmetric Key:\t", opts?.symmetricKey ?? SYMMETRIC_KEY);

	const path = opts?.jwksPath ?? ".config/antbox.jwks";
	if (!fileExistsSync(path)) {
		Logger.error(`JWKS file not found: ${path}`);
		Deno.exit(-1);
	}

	Logger.info("JSON Web Key Set:\t", JSON.stringify(readFileSync(path), null, 4));
}
