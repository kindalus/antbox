import EcmRegistry from "../ecm/ecm_registry.js";
import express, { Request, Response } from "express";
import { getRequestContext } from "./request_context_builder.js";

const webContentsRouter = express.Router();

webContentsRouter.get("/:uuid/:lang", handleGet);

async function handleGet(req: Request, res: Response) {

	const blob = await EcmRegistry.nodeService.export(
		getRequestContext(req),
		req.params.uuid,
	);


	if(!blob) {
		return res.status(401).json("Web content not found: " + req.params.uuid)
	}

	const webContent = await blob.text().then(JSON.parse)

	return res.send(webContent[req.params.lang] ?? webContent.pt);
}

export default webContentsRouter;
