import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).skillService;
    const params = getParams(req);
    if (!params.uuid) {
      return Promise.resolve(
        new Response("{ uuid } not given", { status: 400 }),
      );
    }

    return service
      .getAction(getAuthenticationContext(req), params.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).skillService;

      return service
        .listActions(getAuthenticationContext(req))
        .then(processServiceResult)
        .catch(processError);
    },
  );
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).skillService;
      const params = getParams(req);
      if (!params.uuid) {
        return new Response("{ uuid } not given", { status: 400 });
      }
      return service
        .deleteAction(getAuthenticationContext(req), params.uuid)
        .then(processServiceResult)
        .catch(processError);
    },
  );
}

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).skillService;
    const params = getParams(req);
    if (!params.uuid) {
      return Promise.resolve(
        new Response("{ uuid } not given", { status: 400 }),
      );
    }

    return Promise.all([
      service.getAction(getAuthenticationContext(req), params.uuid),
      service.exportAction(getAuthenticationContext(req), params.uuid),
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
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).skillService;
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
        .runAction(getAuthenticationContext(req), params.uuid, uuids, query)
        .then(processServiceResult)
        .catch(processError);
    },
  );
}
