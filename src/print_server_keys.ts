import { Logger } from "shared/logger.ts";
import { ROOT_PASSWD } from "setup/server_defaults.ts";
import { fileExistsSync, readFileSync } from "shared/os_helpers.ts";
import { join } from "node:path";
import { getDefaultConfigDir } from "setup/load_configuration.ts";

/**
 * Prints server cryptographic keys to stdout.
 *
 * @remarks
 * External setup:
 * - Ensure the JWKS file exists in the config directory.
 * - Deno requires `--allow-read` to read the files.
 *
 * @example
 * printServerKeys({ configDir: "/path/to/config" });
 */
export function printServerKeys(opts?: {
	passwd?: string;
	configDir?: string;
}) {
	const dir = opts?.configDir || getDefaultConfigDir();
	const keyPath = join(dir, "antbox.key");
	const jwksPath = join(dir, "antbox.jwks");

	Logger.info("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

	if (fileExistsSync(keyPath)) {
		Logger.info("Symmetric Key:\t", readFileSync(keyPath).trim());
	} else {
		Logger.warn(`Symmetric Key file not found: ${keyPath}`);
	}

	if (!fileExistsSync(jwksPath)) {
		Logger.error(`JWKS file not found: ${jwksPath}`);
		Deno.exit(-1);
	}

	Logger.info("JSON Web Key Set:\t", JSON.stringify(JSON.parse(readFileSync(jwksPath)), null, 4));
}
