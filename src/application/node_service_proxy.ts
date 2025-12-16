import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

/**
 * A per-request wrapper around NodeService that binds an AuthenticationContext.
 *
 * This prevents user-authored Features from supplying an arbitrary AuthenticationContext
 * when calling NodeService methods.
 */
export class NodeServiceProxy {
	readonly #nodeService: NodeService;
	readonly #ctx: AuthenticationContext;

	constructor(nodeService: NodeService, authenticationContext: AuthenticationContext) {
		this.#nodeService = nodeService;
		this.#ctx = {
			tenant: authenticationContext.tenant,
			mode: authenticationContext.mode,
			principal: {
				email: authenticationContext.principal.email,
				groups: [...authenticationContext.principal.groups],
			},
		};
	}

	copy(uuid: string, parent: string) {
		return this.#nodeService.copy(this.#ctx, uuid, parent);
	}

	create(metadata: Partial<NodeMetadata>) {
		return this.#nodeService.create(this.#ctx, metadata);
	}

	createFile(file: File, metadata: Partial<NodeMetadata>) {
		return this.#nodeService.createFile(this.#ctx, file, metadata);
	}

	delete(uuid: string) {
		return this.#nodeService.delete(this.#ctx, uuid);
	}

	duplicate(uuid: string) {
		return this.#nodeService.duplicate(this.#ctx, uuid);
	}

	export(uuid: string) {
		return this.#nodeService.export(this.#ctx, uuid);
	}

	evaluate(uuid: string) {
		return this.#nodeService.evaluate(this.#ctx, uuid);
	}

	find(filters: Parameters<NodeService["find"]>[1], pageSize?: number, pageToken?: number) {
		return this.#nodeService.find(this.#ctx, filters, pageSize, pageToken);
	}

	get(uuid: string) {
		return this.#nodeService.get(this.#ctx, uuid);
	}

	list(parent?: string) {
		return this.#nodeService.list(this.#ctx, parent);
	}

	breadcrumbs(uuid: string) {
		return this.#nodeService.breadcrumbs(this.#ctx, uuid);
	}

	update(uuid: string, metadata: Partial<NodeMetadata>) {
		return this.#nodeService.update(this.#ctx, uuid, metadata);
	}

	updateFile(uuid: string, file: File) {
		return this.#nodeService.updateFile(this.#ctx, uuid, file);
	}

	lock(uuid: string, unlockAuthorizedGroups?: string[]) {
		return this.#nodeService.lock(this.#ctx, uuid, unlockAuthorizedGroups);
	}

	unlock(uuid: string) {
		return this.#nodeService.unlock(this.#ctx, uuid);
	}
}
