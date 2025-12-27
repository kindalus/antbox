import { AuthenticationContext } from "application/authentication_context.ts";
import { AspectsService } from "application/aspects_service.ts";

/**
 * A per-request wrapper around AspectsService that binds an AuthenticationContext.
 *
 * This prevents user-authored Features from supplying an arbitrary AuthenticationContext
 * when calling AspectsService methods.
 */
export class AspectServiceProxy {
	readonly #aspectsService: AspectsService;
	readonly #ctx: AuthenticationContext;

	constructor(aspectsService: AspectsService, authenticationContext: AuthenticationContext) {
		this.#aspectsService = aspectsService;
		this.#ctx = {
			tenant: authenticationContext.tenant,
			mode: authenticationContext.mode,
			principal: {
				email: authenticationContext.principal.email,
				groups: [...authenticationContext.principal.groups],
			},
		};
	}

	listAspects() {
		return this.#aspectsService.listAspects(this.#ctx);
	}

	get(uuid: string) {
		return this.#aspectsService.getAspect(this.#ctx, uuid);
	}
}
