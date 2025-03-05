import { Context, Router } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { ROOT_USER } from "application/builtin_users/index.ts";
import * as jose from "jose";
import { getTenant } from "./get_tenant.ts";
import { sendBadRequest, sendOK, sendUnauthorized } from "./send_response.ts";

export default function (tenants: AntboxTenant[]) {
  const rootHandler = async (ctx: Context) => {
    const tenant = getTenant(ctx, tenants);

    const rootPasswd = tenant.rootPasswd;
    const symmetricKey = tenant.symmetricKey;

    const digestedRootPasswd = await sha256(rootPasswd);

    if (ctx.request.hasBody === false) {
      return sendBadRequest(ctx);
    }

    const passwd = await ctx.request.body.json();

    if (passwd !== digestedRootPasswd) {
      return sendUnauthorized(ctx);
    }

    const secret = new TextEncoder().encode(symmetricKey);

    const jwt = await new jose.SignJWT({ email: ROOT_USER.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("urn:antbox")
      .setExpirationTime("4h")
      .sign(secret);

    sendOK(ctx, { jwt });

    return sendOK(ctx);
  };

  const loginRouter = new Router({ prefix: "/login" });

  loginRouter.post("/root", rootHandler);

  return loginRouter;
}

async function sha256(str: string) {
  const strAsBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", strAsBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
