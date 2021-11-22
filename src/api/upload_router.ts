import * as express from "express";
import { Request, Response } from "express";
import processError from "./process_error";
import multer from "multer";

import buffer from "buffer";

import EcmRegistry from "../ecm/ecm_registry";

const multerHandler = multer({ storage: multer.memoryStorage(), limits: { fieldSize: 10485760 } });

const uploadRouter = express.Router();
export default uploadRouter;

uploadRouter.post("/nodes", multerHandler.single("file"), createNodeFileHandler);
uploadRouter.post("/nodes/:uuid", multerHandler.single("file"), updateNodeFileHandler);

async function createNodeFileHandler(req: Request, res: Response) {
	if (req.file) {
		const blob = getFileBlob(req.file);
		blob.name = req.file.originalname;

		return EcmRegistry.nodeService
			.createFile(blob, req.body?.parent)
			.then((result) => res.json(result))
			.catch((err) => processError(err, res));
	}

	return Promise.resolve(res.sendStatus(400));
}

function getFileBlob(file: Express.Multer.File) {
	return new buffer.Blob([file.buffer], { type: file.mimetype }) as any;
}

async function updateNodeFileHandler(req: Request, res: Response) {
	if (req.file) {
		return EcmRegistry.nodeService
			.updateFile(req.params.uuid, getFileBlob(req.file))
			.then((result) => res.json(result))
			.catch((err) => processError(err, res));
	}

	return Promise.resolve(res.sendStatus(400));
}
