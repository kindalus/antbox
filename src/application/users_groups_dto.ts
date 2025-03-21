import type { UserNode } from "domain/users_groups/user_node";

export interface UserDTO {
    name: string;
    email: string;
    secret?: string;
    groups: string[];
}
  
export interface GroupDTO {
    uuid: string;
    title: string;
}

export function nodeToUser(metadata: UserNode): UserDTO {
    return {
        name: metadata.title,
        email: metadata.email,
        secret: metadata.secret,
        groups: [...metadata.groups, metadata.group],
    }
}

export function nodeToGroup(metadata: GroupDTO): GroupDTO {
    return {
        uuid: metadata.uuid,
        title: metadata.title,
    }
}