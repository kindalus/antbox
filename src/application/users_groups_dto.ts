import { UserNode } from "domain/users_groups/user_node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";

export interface UserDTO {
	uuid: string;
	name: string;
	email: string;
	group: string;
	groups: string[];
	phone?: string;
	hasWhatsapp?: boolean;
	createdTime: string;
	modifiedTime: string;
}

export interface GroupDTO {
	uuid: string;
	title: string;
	createdTime: string;
	modifiedTime: string;
}

export function nodeToUser(metadata: UserNode): UserDTO {
	return {
		uuid: metadata.uuid,
		name: metadata.title,
		email: metadata.email,
		group: metadata.group,
		groups: [...metadata.groups],
		phone: metadata.phone,
		hasWhatsapp: metadata.hasWhatsapp,
		createdTime: metadata.createdTime,
		modifiedTime: metadata.modifiedTime,
	};
}

export function userToNode(
	ctx: AuthenticationContext,
	metadata: UserDTO,
): UserNode {
	const groups = new Set(metadata.groups ?? []);

	return UserNode.create({
		uuid: metadata.uuid,
		title: metadata.name,
		email: metadata.email,
		owner: ctx.principal.email,
		group: metadata.group,
		groups: Array.from(groups),
		phone: metadata.phone,
		hasWhatsapp: metadata.phone ? (metadata.hasWhatsapp ?? false) : false,
	}).right;
}

export function nodeToGroup(metadata: GroupDTO): GroupDTO {
	return {
		uuid: metadata.uuid,
		title: metadata.title,
		createdTime: metadata.createdTime,
		modifiedTime: metadata.modifiedTime,
	};
}

export function groupToNode(
	ctx: AuthenticationContext,
	metadata: GroupDTO,
): GroupNode {
	return GroupNode.create({
		uuid: metadata.uuid,
		title: metadata.title,
		owner: ctx.principal.email,
	}).right;
}
