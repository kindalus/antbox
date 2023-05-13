import { Group } from "../domain/auth/group.ts";
import { GroupCreatedEvent } from "../domain/auth/group_created_event.ts";
import { GroupSpec } from "../domain/auth/group_spec.ts";
import { User } from "../domain/auth/user.ts";
import { UserCreatedEvent } from "../domain/auth/user_created_event.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { UserSpec } from "../domain/auth/user_spec.ts";
import { Node } from "../domain/nodes/node.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { DomainEvents } from "./domain_events.ts";
import { nodeToUser, userToNode } from "./node_mapper.ts";
import { NodeService } from "./node_service.ts";

export class AuthService {
	#userSpec = new UserSpec();
	#groupSpec = new GroupSpec();

	constructor(private readonly nodeService: NodeService) {}

	async getUserByEmail(email: string): Promise<Either<AntboxError, User>> {
		const nodeOrErr = await this.nodeService.query(
			[["properties.user:email", "==", email]],
			1,
			1,
		);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (nodeOrErr.value.nodes.length === 0) {
			return left(new UserNotFoundError(email));
		}

		return right(nodeToUser(nodeOrErr.value.nodes[0]));
	}

	async createGroup(group: Partial<Group>): Promise<Either<AntboxError, Node>> {
		const trueOrErr = this.#groupSpec.isSatisfiedBy(group as Group);

		if (trueOrErr.isLeft()) {
			return left(trueOrErr.value);
		}

		const nodeOrErr = await this.nodeService.createMetanode({
			...group,
			uuid: group.uuid ?? this.nodeService.uuidGenerator.generate(),
			parent: Node.GROUPS_FOLDER_UUID,
			aspects: ["group"],
		});

		if (nodeOrErr.isRight()) {
			const evt = new GroupCreatedEvent(
				nodeOrErr.value.owner,
				nodeOrErr.value.uuid,
				nodeOrErr.value.title,
			);

			DomainEvents.notify(evt);
		}

		return nodeOrErr;
	}

	async createUser(user: User): Promise<Either<AntboxError, Node>> {
		const trueOrErr = this.#userSpec.isSatisfiedBy(user);

		if (trueOrErr.isLeft()) {
			return left(trueOrErr.value);
		}

		const node = userToNode(
			Object.assign(user, {
				uuid: user.uuid ?? this.nodeService.uuidGenerator.generate(),
			}),
		);
		const nodeOrErr = await this.nodeService.createMetanode(node);

		if (nodeOrErr.isRight()) {
			const evt = new UserCreatedEvent(
				nodeOrErr.value.owner,
				user.email,
				user.fullname,
			);

			DomainEvents.notify(evt);
		}

		return nodeOrErr;
	}
}
