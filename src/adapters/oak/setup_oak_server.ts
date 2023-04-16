import { Application } from "/deps/oak";
import { oakCors } from "/deps/cors";

import aspectsRouter from "./aspects_router.ts";

import nodesRouter from "./nodes_router.ts";
import uploadRouter from "./upload_router.ts";
import actionsRouter from "./actions_router.ts";
import webContentsRouter from "./web_contents_router.ts";
import extRouter from "./ext_router.ts";
import { AntboxService } from "/application/antbox_service.ts";
import loginRouter from "./login_router.ts";
import { createAuthMiddleware } from "./create_auth_middleware.ts";

export const SYMMETRIC_KEY = "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=";

export interface ServerOpts {
	port?: number;
}

export async function setupOakServer(
	service: AntboxService,
	rootPasswd: string,
	rawJwk: Record<string, string>,
	symmetricKey = SYMMETRIC_KEY,
) {
	const app = new Application();

	app.use(oakCors());

	const authMiddleware = await createAuthMiddleware(service.authService, rawJwk, symmetricKey);
	app.use(authMiddleware);

	const nodes = nodesRouter(service);
	const upload = uploadRouter(service);
	const actions = actionsRouter(service);
	const webContent = webContentsRouter(service);
	const ext = extRouter(service);
	const aspects = aspectsRouter(service);
	const login = loginRouter(symmetricKey, rootPasswd);

	app.use(nodes.routes());
	app.use(webContent.routes());
	app.use(aspects.routes());
	app.use(actions.routes());
	app.use(upload.routes());
	app.use(ext.routes());
	app.use(login.routes());

	app.use(nodes.allowedMethods());
	app.use(webContent.allowedMethods());
	app.use(aspects.allowedMethods());
	app.use(actions.allowedMethods());
	app.use(upload.allowedMethods());
	app.use(ext.allowedMethods());

	return (options: ServerOpts = { port: 7180 }) => {
		return new Promise<void>((resolve) => {
			app.addEventListener("listen", () => {
				resolve();
			});

			app.listen({ ...options });
		});
	};
}
