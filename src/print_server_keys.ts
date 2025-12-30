import { Logger } from "shared/logger.ts";
import { ROOT_PASSWD, SYMMETRIC_KEY } from "setup/server_defaults.ts";
import { fileExistsSync, readFileSync } from "shared/os_helpers.ts";

/**
 * Prints server cryptographic keys to stdout.
 *
 * @remarks
 * External setup:
 * - Ensure the JWK file exists (default: `.config/antbox.jwk`) or pass `jwkPath`.
 * - Deno requires `--allow-read` to read the JWK file.
 *
 * @example
 * printServerKeys({ jwkPath: "./.config/antbox.jwk" });
 */
export function printServerKeys(opts?: {
	passwd?: string;
	symmetricKey?: string;
	jwkPath?: string;
}) {
	Logger.info("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

	Logger.info("Symmetric Key:\t", opts?.symmetricKey ?? SYMMETRIC_KEY);

	const path = opts?.jwkPath ?? ".config/antbox.jwk";
	if (!fileExistsSync(path)) {
		Logger.error(`JWK file not found: ${path}`);
		Deno.exit(-1);
	}

	Logger.info("JSON Web Key:\t", JSON.stringify(readFileSync(path), null, 4));
}
