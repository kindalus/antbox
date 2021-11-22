import { IncomingMessage, ServerResponse } from "http";
import EcmRegistry from "../ecm/ecm_registry";
import express, {Request, Response} from "express";

const webContentsRouter = express.Router();

webContentsRouter.get("/:uuid", handleGet);

async function handleGet(req: Request, res: Response) {
	

	if (!req.params.uuid) {
		res.statusCode = 400;
		return res.end();
	}

	const blob = await EcmRegistry.nodeService.export(req.params.uuid);
	const text = await blob.text();

	res.send(text);
};


export default webContentsRouter;