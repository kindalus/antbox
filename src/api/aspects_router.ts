import express, { Request, Response } from "express";
import Aspect from "../ecm/aspect";
import EcmRegistry from "../ecm/ecm_registry";
import { getRequestContext } from "./request_context_builder";

const aspectsRouter = express.Router();

aspectsRouter.post("/", createHandler);
aspectsRouter.delete("/:uuid", deleteHandler);
aspectsRouter.get("/", listHandler);
aspectsRouter.get("/:uuid", getHandler);
aspectsRouter.put("/:uuid", updateHandler);

function createHandler(req: Request, res: Response) {
	const aspect = req.body as unknown as Aspect;

	EcmRegistry.instance.aspectService
		.create(getRequestContext(req), aspect)
		.then(() => res.sendStatus(200))
		.catch((err) => handleError(req, res, err));
}

function deleteHandler(req: Request, res: Response) {
	EcmRegistry.instance.aspectService
		.delete(getRequestContext(req), req.params.uuid)
		.then(() => res.sendStatus(200))
		.catch((err) => handleError(req, res, err));
}

function getHandler(req: Request, res: Response) {
	EcmRegistry.instance.aspectService
		.get(getRequestContext(req), req.params.uuid)
		.then((aspect) => res.json(aspect))
		.catch((err) => handleError(req, res, err));
}

function listHandler(req: Request, res: Response) {
	EcmRegistry.instance.aspectService
		.list(getRequestContext(req))
		.then((list) => res.json(list))
		.catch((err) => handleError(req, res, err));
}

function updateHandler(req: Request, res: Response) {
	const aspect = req.body as unknown as Aspect;
	EcmRegistry.instance.aspectService
		.update(getRequestContext(req), req.params.uuid, aspect)
		.then(() => res.sendStatus(200))
		.catch((err) => handleError(req, res, err));
}

function handleError(req: Request, res: Response, err: any) {
	res.status(500).json(err);
}

export default aspectsRouter;
