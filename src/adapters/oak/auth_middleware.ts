import { User } from "../../domain/auth/user.ts";
import { Context } from "/deps/oak";
import * as jose from "/deps/jose";
import { AuthKey, AuthKeys } from "/application/auth_keys.ts";

export function authMiddleware(
  keys: AuthKeys,
  secret: string
): (ctx: Context, next: () => Promise<unknown>) => Promise<unknown> {
  return async function (ctx: Context, next: () => Promise<unknown>) {
    const token =
      ctx.request.headers.get("x-access-token") ??
      (await ctx.cookies.get("antbox-access-token"));

    ctx.state.userPrincipal = User.ANONYMOUS_USER;

    if (!token) {
      return await next();
    }

    const payload = await jose.decodeJwt(token);

    if (!payload) {
      return await next();
    }

    if (
      payload.iss === "urn:antbox" &&
      (await verifyRootToken(token, secret))
    ) {
      ctx.state.userPrincipal = User.ROOT_USER;
      return await next();
    }

    if (!(await verifyToken(payload.iss!, keys, token))) {
      return await next();
    }

    return await next();
  };
}

async function verifyRootToken(
  token: string,
  secret: string
): Promise<boolean> {
  const key = await importKey({
    alg: "HS256",
    key: secret,
    type: "Symmetric",
  } as AuthKey);
  try {
    jose.jwtVerify(token, key);
  } catch (_e) {
    return false;
  }

  return true;
}

async function verifyToken(
  issuer: string,
  keys: AuthKeys,
  token: string
): Promise<boolean> {
  const key = keys.find((k) => k.provider === issuer);

  if (!key) {
    return false;
  }

  const publicKey = await importKey(key);
  if (!publicKey) {
    return false;
  }

  try {
    jose.jwtVerify(token, publicKey);
  } catch (_e) {
    return false;
  }

  return true;
}

function importKey(key: AuthKey): Promise<jose.KeyLike | Uint8Array> {
  switch (key.type) {
    case "Symmetric":
      return Promise.resolve(new TextEncoder().encode(key.key as string));
    case "JWK":
      return jose.importJWK(key.key as jose.JWK, key.alg);
    case "SPKI":
      return jose.importSPKI(key.key as string, key.alg);
  }
}
