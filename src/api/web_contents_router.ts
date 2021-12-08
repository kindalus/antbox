import { OpineRequest, OpineResponse, Router } from "../deps.ts";
import EcmRegistry from "../ecm/ecm_registry.ts";
import { getRequestContext } from "./request_context_builder.ts";

const webContentsRouter = Router();

webContentsRouter.get("/:uuid/:lang", handleGet);

async function handleGet(req: OpineRequest, res: OpineResponse) {
  try {
    const blob = await EcmRegistry.instance.nodeService.export(
      getRequestContext(req),
      req.params.uuid,
    );

    const webContent = await blob.text().then(JSON.parse);

    return res.send(webContent[req.params.lang] ?? webContent.pt);
  } catch (err: any) {
    const status = err.errorCode && err.errorCode === "NodeNotFoundError"
      ? 404
      : 500;
    return res.setStatus(status).json(err);
  }
}

export default webContentsRouter;
