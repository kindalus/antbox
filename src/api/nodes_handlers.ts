import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).nodeService;
    const query = getQuery(req);

    const parent = query.parent?.length > 0 ? query.parent : undefined;

    return service
      .list(getAuthenticationContext(req), parent)
      .then(processServiceResult)
      .catch(processError);
  });
}
export function getHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).nodeService;
    const query = getQuery(req);
    return service
      .get(getAuthenticationContext(req), query.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function createHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).nodeService;
      const metadata = await req.json();
      if (!metadata?.mimetype) {
        return Promise.resolve(
          new Response("{ mimetype } not given", { status: 400 }),
        );
      }

      return service
        .create(getAuthenticationContext(req), metadata)
        .then(processServiceResult)
        .catch(processError);
    },
  );
}

export function updateHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).nodeService;
      const body = await req.json();
      return service
        .update(getAuthenticationContext(req), body.uuid, body)
        .then(processServiceResult)
        .catch(processError);
    },
  );
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).nodeService;
    const query = getQuery(req);
    return service
      .delete(getAuthenticationContext(req), query.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function copyHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).nodeService;
      const body = await req.json();
      return service
        .copy(getAuthenticationContext(req), body.uuid, body.to)
        .then(processServiceResult)
        .catch(processError);
    },
  );
}

export function duplicateHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).nodeService;
    const query = getQuery(req);
    return service
      .duplicate(getAuthenticationContext(req), query.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}

export function findHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(
    tenants,
    async (req: Request): Promise<Response> => {
      const service = getTenant(req, tenants).nodeService;
      const body = await req.json();
      return service
        .find(
          getAuthenticationContext(req),
          body.filters,
          body.pageSize,
          body.pageToken,
        )
        .then(processServiceResult)
        .catch(processError);
    },
  );
}

export function evaluateHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).nodeService;
    const query = getQuery(req);
    return service
      .evaluate(getAuthenticationContext(req), query.uuid)
      .then(processServiceResult)
      .catch(processError);
  });
}
// TODO: Implement recognizeHandler
// export function recognizeHandler(tenants: AntboxTenant[]): HttpHandler {
// 	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
// 		const service = getTenant(req, tenants).nodeService;
// 		const query = getQuery(req);
// 		return service
// 			.recognizeText(getAuthenticationContext(req), query.uuid)
// 			.then(processServiceResult)
// 			.catch(processError);
// 	});
// }

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
  return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
    const service = getTenant(req, tenants).nodeService;
    const query = getQuery(req);
    return Promise.all([
      service.get(getAuthenticationContext(req), query.uuid),
      service.export(getAuthenticationContext(req), query.uuid),
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
