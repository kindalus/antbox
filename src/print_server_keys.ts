import { ROOT_PASSWD, SYMMETRIC_KEY } from "setup/server_defaults.ts";
import { fileExistsSync, readFileSync } from "shared/os_helpers.ts";

export function printServerKeys(opts?: {
  passwd?: string;
  symmetricKey?: string;
  jwkPath?: string;
}) {
  console.log("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

  console.log("Symmetric Key:\t", opts?.symmetricKey ?? SYMMETRIC_KEY);

  const path = opts?.jwkPath ?? ".config/antbox.jwk";
  if (!fileExistsSync(path)) {
    console.error(`JWK file not found: ${path}`);
    Deno.exit(-1);
  }

  console.log("JSON Web Key:\t", JSON.stringify(readFileSync(path), null, 4));
}
