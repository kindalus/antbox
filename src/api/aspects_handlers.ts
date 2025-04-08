import type { AntboxTenant } from "./antbox_tenant";
import { defaultMiddlewareChain } from "./default_middleware_chain";
import { getAuthenticationContext } from "./get_authentication_context";
import { getParams } from "./get_params";
import { getTenant } from "./get_tenant";
import type { HttpHandler } from "./handler";
import { processError } from "./process_error";
import { processServiceResult } from "./process_service_result";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;

    return service.list().then();
  });
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const params = getParams(req);
    if (!params.uuid) {
      return new Response("{ uuid } not given", { status: 400 });
    }
    return service.get(params.uuid).then(processServiceResult).catch(processError);
  });
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const params = getParams(req);
    if (!params.uuid) {
      return new Response("{ uuid } not given", { status: 400 });
    }

    return service
      .delete(getAuthenticationContext(req), params.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const params = getParams(req);
    if (!params.uuid) {
      return new Response("{ uuid } not given", { status: 400 });
    }

    return Promise.all([service.get(params.uuid), service.export(params.uuid)])
      .then(([node, blob]) => {
        if (node.isLeft()) {
          return processError(node.value);
        }

        if (blob.isLeft()) {
          return processError(blob.value);
        }

        const response = new Response(blob.value);
        response.headers.set("Content-Type", node.value.mimetype);
        response.headers.set("Content-length", blob.value.size.toString());
        return response;
      })
      .catch(processError);
  });
}

export function createOrReplaceHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const metadata = await req.json();
    if (!metadata) {
      return new Response("Missing metadata", { status: 400 });
    }

    return service
      .createOrReplace(getAuthenticationContext(req), metadata)
      .then(processServiceResult)
      .catch(processError);
  });
}
