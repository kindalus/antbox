import { ROOT_USER } from "application/builtin_users";
import * as jose from "jose";
import { readTextStream } from "shared/readers";
import type { AntboxTenant } from "./antbox_tenant";
import { defaultMiddlewareChain } from "./default_middleware_chain";
import { getTenant } from "./get_tenant";
import { sendOK, sendUnauthorized, type HttpHandler } from "./handler";

export function rootHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const tenant = getTenant(req, tenants);

    const rootPasswd = tenant.rootPasswd;
    const symmetricKey = tenant.symmetricKey;

    const digestedRootPasswd = await sha256(rootPasswd);

    const passwd = await readTextStream(req.body);

    if (passwd !== digestedRootPasswd) {
      return sendUnauthorized();
    }

    const secret = new TextEncoder().encode(symmetricKey);

    const jwt = await new jose.SignJWT({ email: ROOT_USER.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("urn:antbox")
      .setExpirationTime("4h")
      .sign(secret);

    return sendOK({ jwt });
  });
}

async function sha256(str: string) {
  const strAsBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", strAsBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
