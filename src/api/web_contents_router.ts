import { OpineRequest, OpineResponse, Router } from "../../deps.ts";
import EcmRegistry from "../ecm/ecm_registry.ts";
import processError from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

const webContentsRouter = Router();

webContentsRouter.get("/:uuid/:lang", handleGet);

function handleGet(req: OpineRequest, res: OpineResponse) {
	EcmRegistry.instance.nodeService.export(
		getRequestContext(req),
		req.params.uuid,
	)
		.then((blob) => blob.text())
		.then(JSON.parse)
		.then((webContent) =>
			res.send(webContent[req.params.lang] ?? webContent.pt)
		)
		.catch((err) => processError(err, res));
}

export default webContentsRouter;
