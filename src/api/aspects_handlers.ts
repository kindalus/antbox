import type { AntboxTenant } from "./antbox_tenant";
import { defaultMiddlewareChain } from "./default_middleware_chain";
import { getAuthenticationContext } from "./get_authentication_context";
import { getQuery } from "./get_query";
import { getTenant } from "./get_tenant";
import type { HttpHandler } from "./handler";
import { processError } from "./process_error";
import { processServiceResult } from "./process_service_result";

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const query = getQuery(req);
    return service.get(query.uuid).then(processServiceResult).catch(processError);
  });
}

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;

    return service.list().then();
  });
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const query = getQuery(req);

    return service
      .delete(getAuthenticationContext(req), query.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).aspectService;
    const query = getQuery(req);
    return Promise.all([service.get(query.uuid), service.export(query.uuid)])
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
