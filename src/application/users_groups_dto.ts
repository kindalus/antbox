import { UserNode } from "domain/users_groups/user_node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Users } from "domain/users_groups/users.ts";

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
	active: boolean;
}

export interface GroupDTO {
	uuid: string;
	title: string;
	createdTime: string;
	modifiedTime: string;
}

export function toUserDTO(metadata: UserNode): UserDTO {
	return {
		uuid: metadata.uuid,
		name: metadata.title,
		email: metadata.email,
		group: metadata.group,
		groups: [...(metadata.groups ?? [])],
		phone: metadata.phone,
		hasWhatsapp: metadata.hasWhatsapp,
		createdTime: metadata.createdTime,
		modifiedTime: metadata.modifiedTime,
		active: metadata.active,
	};
}

export function fromUserDTO(
	dto: UserDTO,
): UserNode {
	const groups = new Set(dto.groups ?? []);

	return UserNode.create({
		uuid: dto.uuid,
		title: dto.name,
		email: dto.email,
		owner: Users.ROOT_USER_EMAIL,
		group: dto.group,
		groups: Array.from(groups),
		phone: dto.phone,
		hasWhatsapp: dto.phone ? (dto.hasWhatsapp ?? false) : false,
		active: dto.active ?? true,
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
