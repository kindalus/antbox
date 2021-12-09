import { json, opine } from "../../deps.ts";

import EcmRegistry, { EcmConfig } from "../ecm/ecm_registry.ts";
import aspectsRouter from "./aspects_router.ts";

import nodesRouter from "./nodes_router.ts";
import uploadRouter from "./upload_router.ts";
import webContentsRouter from "./web_contents_router.ts";

export default function startServer(config: EcmConfig) {
	EcmRegistry.buildIfNone(config);
	const app = opine();

	app.use(json()); // for parsing application/json

	app.use("/nodes", nodesRouter);
	app.use("/web-contents", webContentsRouter);
	app.use("/aspects", aspectsRouter);
	app.use("/upload", uploadRouter);

	return app;
}
