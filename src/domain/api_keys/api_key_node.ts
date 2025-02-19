import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { InvalidApiKeyParentError } from "./invalid_api_key_parent_error.ts";

export class ApiKeyNode extends Node {
	#group: string = null as unknown as string;
	#secret: string = null as unknown as string;

	static create(metadata: Partial<NodeMetadata>): Either<ValidationError, ApiKeyNode> {
		try {
			const node = new ApiKeyNode(metadata.group, metadata.secret, metadata.description, metadata.owner);
			
			return right(node);
		}catch(e) {
			return left(ValidationError.from(e as AntboxError))
		}
	}

	private constructor(group = "", secret = "", description = "", owner = "") {
		const errors = []
		
		if(!secret || secret.length === 0 ) {
			errors.push(new PropertyRequiredError("Node.secret"))
		}
		
		if(!group || group.length === 0) {
			errors.push(new PropertyRequiredError("Node.group"))
		}

		if(errors.length > 0) {
			throw ValidationError.from(...errors)
		}

		super(
			{
				description,
				mimetype: Nodes.API_KEY_MIMETYPE,
				parent: Folders.API_KEYS_FOLDER_UUID,
				title: secret.replace(/^(\w{4}).*$/g, "$1******"),
				owner
			},
		);

		this.#group = group;
		this.#secret = secret;
	}

	override update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
		const updateResult = super.update(metadata)

		if(updateResult.isLeft()) {
			return left(updateResult.value)
		}

		this.#group = metadata.group ?? this.#group
		this.#secret = metadata.secret ?? this.#secret

		try {
			this.#validate()
		}catch(e) {
			return left(e as ValidationError)
		}
 	
		return right(undefined)
	}

	#validate() {
		const errors = []

		if(!this.#group || this.#group.length === 0) {
			 errors.push(ValidationError.from(new PropertyRequiredError("Node.group")))
		}

		if(!this.#secret || this.#secret.length === 0) {
			 errors.push(ValidationError.from(new PropertyRequiredError("Node.secret")))
		}

		if(this.parent !== Folders.API_KEYS_FOLDER_UUID) {
			 errors.push(ValidationError.from(new InvalidApiKeyParentError(this.parent)))
		}

		if(errors.length > 0) {
			throw ValidationError.from(...errors)
		}
	}

	cloneWithSecret(): ApiKeyNode {
		return new ApiKeyNode(this.#group, this.#secret, this.description, this.owner);
	}

	get group(): string {
		return this.#group
	}

	get secret(): string {
		return this.#secret
	}
}
