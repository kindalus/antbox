import { Logger } from "shared/logger.ts";
import { ROOT_PASSWD, SYMMETRIC_KEY } from "setup/server_defaults.ts";
import { fileExistsSync, readFileSync } from "shared/os_helpers.ts";

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
