import EcmRegistry from "../ecm/ecm_registry";
import express, { Request, Response } from "express";
import { getRequestContext } from "./request_context_builder";

const webContentsRouter = express.Router();

webContentsRouter.get("/:uuid/:lang", handleGet);

async function handleGet(req: Request, res: Response) {
	try {
		const blob = await EcmRegistry.instance.nodeService.export(
			getRequestContext(req),
			req.params.uuid,
		);

		const webContent = await blob.text().then(JSON.parse);

		return res.send(webContent[req.params.lang] ?? webContent.pt);
	} catch (err: any) {
		const status = err.errorCode && err.errorCode === "NodeNotFoundError" ? 404 : 500;
		return res.status(status).json(err);
	}
}

export default webContentsRouter;
