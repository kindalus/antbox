import { Router } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { rootHandler } from "api/login_handler.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
  const loginRouter = new Router({ prefix: "/login" });

  loginRouter.post("/root", adapt(rootHandler(tenants)));

  return loginRouter;
  // const rootHandler = async (ctx: Context) => {
  //   const tenant = getTenant(ctx, tenants);

  //   const rootPasswd = tenant.rootPasswd;
  //   const symmetricKey = tenant.symmetricKey;

  //   const digestedRootPasswd = await sha256(rootPasswd);

  //   if (ctx.request.hasBody === false) {
  //     return sendBadRequest(ctx);
  //   }

  //   const passwd = await ctx.request.body.json();

  //   if (passwd !== digestedRootPasswd) {
  //     return sendUnauthorized(ctx);
  //   }

  //   const secret = new TextEncoder().encode(symmetricKey);

  //   const jwt = await new jose.SignJWT({ email: ROOT_USER.email })
  //     .setProtectedHeader({ alg: "HS256" })
  //     .setIssuedAt()
  //     .setIssuer("urn:antbox")
  //     .setExpirationTime("4h")
  //     .sign(secret);

  //   sendOK(ctx, { jwt });

  //   return sendOK(ctx);
  // };
}
