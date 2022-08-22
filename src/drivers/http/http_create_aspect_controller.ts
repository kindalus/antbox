import { Aspect } from "/domain/aspects/aspect.ts";
import { HttpResponse, ok, serverError, badRequest } from "./http_response.ts";
import { HttpController } from "./http_controller.ts";
import { HttpRequest } from "./http_request.ts";
import AspectService from "/application/aspect_service.ts";

export class HttpCreateAspectController
  implements HttpController<Aspect, void>
{
  constructor(private readonly service: AspectService) {}

  handle(req: HttpRequest<Aspect>): Promise<HttpResponse<void>> {
    const aspect = req.payload;

    return this.service
      .create(req.userPrincipal, aspect)
      .then((res) => {
        if (res.error) {
          return badRequest<void>(res.error);
        }

        return ok(undefined);
      })
      .catch((err) => serverError(err));
  }
}
