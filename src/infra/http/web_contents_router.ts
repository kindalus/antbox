import { OpineRequest, OpineResponse, Router } from "/deps/opine";
import { RequestContext } from "/application/request_context.ts";
import { WebContent } from "/application/builtin_aspects/web_content.ts";
import EcmRegistry from "/application/ecm_registry.ts";
import processError from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";

const webContentsRouter = Router();

webContentsRouter.get("/:uuid/:lang", handleGetByLanguage);
webContentsRouter.get("/:uuid", handleGet);

function handleGet(req: OpineRequest, res: OpineResponse) {
	const requestCtx = getRequestContext(req);
	const uuid = req.params.uuid as string;

	Promise.all([
		EcmRegistry.instance.nodeService.get(requestCtx, uuid),
		getWebContentText(requestCtx, uuid),
	])
		.then(([node, webContent]) => {
			res.send({
				...webContent,
				uuid: node.uuid,
				fid: node.fid,
				title: node.title,
			});
		})
		.catch((err) => processError(err, res));
}

function handleGetByLanguage(req: OpineRequest, res: OpineResponse) {
	const lang = req.params.lang as "pt" | "en" | "es" | "fr";
	getWebContentText(getRequestContext(req), req.params.uuid)
		.then((webContent) => res.send(webContent[lang] ?? webContent.pt))
		.catch((err) => processError(err, res));
}

function getWebContentText(
	ctx: RequestContext,
	uuid: string,
): Promise<Partial<WebContent>> {
	return EcmRegistry.instance.nodeService
		.export(ctx, uuid)
		.then((blob) => blob.text())
		.then(JSON.parse);
}

export default webContentsRouter;
