import { AuthenticationContext } from "application/authentication_context.ts";
import { AspectService } from "application/aspect_service.ts";

/**
 * A per-request wrapper around AspectService that binds an AuthenticationContext.
 *
 * This prevents user-authored Features from supplying an arbitrary AuthenticationContext
 * when calling AspectService methods.
 */
export class AspectServiceProxy {
	readonly #aspectService: AspectService;
	readonly #ctx: AuthenticationContext;

	constructor(aspectService: AspectService, authenticationContext: AuthenticationContext) {
		this.#aspectService = aspectService;
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
		return this.#aspectService.list(this.#ctx);
	}
}
