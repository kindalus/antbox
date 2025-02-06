import { FolderNode } from "../domain/nodes/folder_node.ts";
import { Permission } from "../domain/nodes/node.ts";
import { NodeLike } from "../domain/nodes/node_like.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";

export async function isPrincipalAllowedTo(
	service: NodeService,
	ctx: AuthenticationContext,
	node: NodeLike,
	permission: Permission,
): Promise<boolean> {
	let folder: FolderNode | undefined;
	if (!Nodes.isFolder(node)) {
		const parentOrErr = await service.get(ctx, node.parent);
		if (parentOrErr.isLeft()) {
			return false;
		}

		folder = parentOrErr.value as FolderNode;
	} else {
		folder = node;
	}

	if (
		isOwner(ctx, folder) ||
		isAnonymousAllowedTo(folder, permission) ||
		isAuthenticatedAllowedTo(folder, permission) ||
		isGroupAllowedTo(ctx, folder, permission)
	) {
		return true;
	}

	return false;
}

function isOwner(ctx: AuthenticationContext, folder: FolderNode): boolean {
	return folder.owner === ctx.principal.email;
}

function isAnonymousAllowedTo(folder: FolderNode, permission: Permission): boolean {
	return folder.permissions.anonymous.includes(permission);
}

function isAuthenticatedAllowedTo(folder: FolderNode, permission: Permission): boolean {
	return folder.permissions.authenticated.includes(permission);
}

function isGroupAllowedTo(
	ctx: AuthenticationContext,
	folder: FolderNode,
	permission: Permission,
): boolean {
	if (!ctx.principal.groups.includes(folder.group)) {
		return false;
	}

	if (folder.permissions.group.includes(permission)) {
		return true;
	}

	Object.entries(folder.permissions.advanced ?? [])
		.forEach(([group, permissions]) => {
			if (permissions.includes(permission) && ctx.principal.groups.includes(group)) {
				return true;
			}
		});

	return false;
}
