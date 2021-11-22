import EcmRegistry from "../ecm/ecm_registry";
import * as express from "express";
import { Request, Response } from "express";
import processError from "./process_error";

const nodesRouter = express.Router();

export default nodesRouter;

nodesRouter.get("/:uuid", getHandler);
nodesRouter.get("/:uuid/export", exportHandler);
nodesRouter.get("/:uuid/copy", copyHandler);
nodesRouter.get("/:uuid/evaluate", evaluateHandler);

nodesRouter.get("/", listHandler);

nodesRouter.post("/", createFolderHandler);
nodesRouter.post("/query", queryHandler);

nodesRouter.patch("/:uuid", updateHandler);

nodesRouter.delete("/:uuid", deleteHandler);

async function listHandler(req: Request, res: Response) {
	return EcmRegistry.nodeService
		.list(req.query.parent as string)
		.then((result) => res.json(result))
		.catch((err) => processError(err, res));
}

async function getHandler(req: Request, res: Response) {
	return EcmRegistry.nodeService
		.get(req.params.uuid)
		.then((result) => res.json(result))
		.catch((err) => processError(err, res));
}

async function exportHandler(req: Request, res: Response) {
	const uuid = req.params.uuid;

	return Promise.all([EcmRegistry.nodeService.get(uuid), EcmRegistry.nodeService.export(uuid)])
		.then(async ([node, blob]) => {
			res.writeHead(200, {
				"Content-Type": node.mimetype,
				"Content-Length": blob.size,
			});

			const chunks = new Uint8Array(await blob.arrayBuffer());

			res.write(chunks);
			res.end();
		})
		.catch((err) => processError(err, res));
}

async function createFolderHandler(req: Request, res: Response) {
	const { title, parent }: { title: string; parent?: string } = req.body;

	if (!title) {
		return Promise.resolve(res.status(400).json("{ title } not given"));
	}

	return EcmRegistry.nodeService
		.createFolder(title, parent)
		.then((result) => res.json(result))
		.catch((err) => processError(err, res));
}

async function updateHandler(req: Request, res: Response) {
	return EcmRegistry.nodeService
		.update(req.params.uuid, req.body)
		.then(() => res.sendStatus(200))
		.catch((err) => processError(err, res));
}

async function deleteHandler(req: Request, res: Response) {
	return EcmRegistry.nodeService
		.delete(req.params.uuid)
		.then(() => res.sendStatus(200))
		.catch((err) => processError(err, res));
}

async function copyHandler(req: Request, res: Response) {
	return EcmRegistry.nodeService
		.copy(req.params.uuid)
		.then((result) => res.json(result))
		.catch((err) => processError(err, res));
}

async function queryHandler(req: Request, res: Response) {
	const { constrais, pageSize, pageToken } = req.body;

	return EcmRegistry.nodeService
		.query(constrais, pageSize, pageToken)
		.then((result) => res.json(result))
		.catch((err) => processError(err, res));
}

async function evaluateHandler(req: Request, res: Response) {
	return EcmRegistry.nodeService
		.evaluate(req.params.uuid)
		.then((result) => res.json(result))
		.catch((err) => processError(err, res));
}
