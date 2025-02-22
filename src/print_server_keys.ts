import { ROOT_PASSWD, SYMMETRIC_KEY } from "setup/server_defaults";

export async function printServerKeys(opts?: {
  passwd?: string;
  symmetricKey?: string;
  jwkPath?: string;
}) {
  console.log("Root passwd:\t", opts?.passwd ?? ROOT_PASSWD);

  console.log("Symmetric Key:\t", opts?.symmetricKey ?? SYMMETRIC_KEY);

  const file = Bun.file(opts?.jwkPath ?? "");
  if (!file.exists) {
    console.error("JWK file not found");
    process.exit(-1);
  }

  console.log("JSON Web Key:\t", JSON.stringify(await file.json(), null, 4));
}
