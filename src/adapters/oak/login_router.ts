import { Context, Router } from "/deps/oak";
import { crypto } from "/deps/crypto";
import * as jose from "/deps/jose";
import { sendBadRequest, sendOK, sendUnauthorized } from "./send_response.ts";
import { Root } from "../../application/builtin_users/root.ts";

export default function (symmetricKey: string, rootPasswd: string) {
	let digestedRootPasswd: string;
	sha256(rootPasswd).then((v) => (digestedRootPasswd = v));

	const rootHandler = async (ctx: Context) => {
		if (ctx.request.hasBody === false) {
			return sendBadRequest(ctx);
		}

		const passwd = await ctx.request.body().value;

		if (passwd !== digestedRootPasswd) {
			return sendUnauthorized(ctx);
		}

		const secret = new TextEncoder().encode(symmetricKey);

		const jwt = await new jose.SignJWT({ email: Root.email })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setIssuer("urn:antbox")
			.setExpirationTime("30m")
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
