import type { NodeLike } from "domain/node_like.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { AntboxError, BadRequestError, ForbiddenError, UnknownError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import { left, right } from "shared/either.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AuthorizationService } from "../security/authorization_service.ts";
import type { NodeLookup } from "./node_lookup.ts";

export class NodeLocking {
	constructor(
		private readonly repository: NodeRepository,
		private readonly lookup: NodeLookup,
		private readonly authorizationService: AuthorizationService,
	) {}

	async lock(
		ctx: AuthenticationContext,
		uuid: string,
		unlockAuthorizedGroups: string[] = [],
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.lookup.getStored(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		if (node.locked) {
			return left(new BadRequestError(`Node is already locked by ${node.lockedBy}`));
		}

		const parentOrErr = await this.lookup.getFolder(node.parent);
		if (parentOrErr.isLeft()) {
			return left(new UnknownError(`Parent folder not found for node uuid='${uuid}'`));
		}

		const allowedOrErr = this.authorizationService.isPrincipalAllowedTo(
			ctx,
			parentOrErr.value,
			"Write",
		);
		if (allowedOrErr.isLeft()) {
			return left(allowedOrErr.value);
		}

		const authorizedGroups = unlockAuthorizedGroups.length
			? unlockAuthorizedGroups
			: ctx.principal.groups;
		node.update({
			locked: true,
			lockedBy: ctx.principal.email,
			unlockAuthorizedGroups: authorizedGroups,
		});

		const updateResult = await this.repository.update(node);
		if (updateResult.isLeft()) {
			return left(updateResult.value);
		}

		if (Nodes.isFolder(node)) {
			const lockSystemCtx = this.#systemContext(ctx);
			for (const child of await this.lookup.listChildren(uuid)) {
				if (!child.locked) {
					await this.lock(lockSystemCtx, child.uuid);
				}
			}
		}

		return right(undefined);
	}

	async unlock(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.lookup.getStored(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		if (!node.locked) {
			return left(new BadRequestError("Node is not locked"));
		}
		if (
			node.lockedBy === Users.LOCK_SYSTEM_USER_EMAIL &&
			ctx.principal.email !== Users.LOCK_SYSTEM_USER_EMAIL
		) {
			return left(
				new BadRequestError(
					"Cannot unlock this node directly. It was locked by the system when a parent folder was locked. Unlock the parent folder instead.",
				),
			);
		}
		if (!this.#canUnlock(ctx, node)) {
			return left(new ForbiddenError());
		}

		node.update({
			locked: false,
			lockedBy: "",
			unlockAuthorizedGroups: [],
		});
		const updateResult = await this.repository.update(node);
		if (updateResult.isLeft()) {
			return left(updateResult.value);
		}

		if (Nodes.isFolder(node)) {
			const lockSystemCtx = this.#systemContext(ctx);
			for (const child of await this.lookup.listChildren(uuid)) {
				if (child.locked && child.lockedBy === Users.LOCK_SYSTEM_USER_EMAIL) {
					await this.unlock(lockSystemCtx, child.uuid);
				}
			}
		}

		return right(undefined);
	}

	checkModification(
		ctx: AuthenticationContext,
		node: NodeLike,
	): Either<BadRequestError, void> {
		if (!node.locked || this.#canUnlock(ctx, node)) {
			return right(undefined);
		}
		return left(
			new BadRequestError(
				`Node is locked by ${node.lockedBy}. You are not authorized to modify it.`,
			),
		);
	}

	#systemContext(ctx: AuthenticationContext): AuthenticationContext {
		return {
			tenant: ctx.tenant,
			principal: {
				email: Users.LOCK_SYSTEM_USER_EMAIL,
				groups: [Groups.ADMINS_GROUP_UUID],
			},
			mode: ctx.mode,
		};
	}

	#canUnlock(ctx: AuthenticationContext, node: NodeLike): boolean {
		return node.lockedBy === ctx.principal.email ||
			(node.unlockAuthorizedGroups || []).some((group) => ctx.principal.groups.includes(group));
	}
}
