import type { AntboxTenant } from "./antbox_tenant";
import { defaultMiddlewareChain } from "./default_middleware_chain";
import { getAuthenticationContext } from "./get_authentication_context";
import { getParams } from "./get_params";
import { getQuery } from "./get_query";
import { getTenant } from "./get_tenant";
import { type HttpHandler } from "./handler";
import { processError } from "./process_error";
import { processServiceResult } from "./process_service_result";

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).actionService;
    const params = getParams(req);
    if (!params.uuid) {
      return Promise.resolve(new Response("{ uuid } not given", { status: 400 }));
    }

    return service
      .get(getAuthenticationContext(req), params.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).actionService;

    return service
      .list(getAuthenticationContext(req))
      .then(processServiceResult)
      .catch(processError);
  });
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).actionService;
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
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).actionService;
    const params = getParams(req);
    if (!params.uuid) {
      return Promise.resolve(new Response("{ uuid } not given", { status: 400 }));
    }

    return Promise.all([
      service.get(getAuthenticationContext(req), params.uuid),
      service.export(getAuthenticationContext(req), params.uuid),
    ])
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

export function runHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).actionService;
    const params = getParams(req);
    const query = getQuery(req);

    if (!params.uuid) {
      return Promise.reject(new Error("{ uuid } not given"));
    }

    if (!query.uuids) {
      return Promise.reject(new Error("Missing uuids query parameter"));
    }
    const uuids = query.uuids.split(",");
    return service
      .run(getAuthenticationContext(req), params.uuid, uuids, query)
      .then(processServiceResult)
      .catch(processError);
  });
}
