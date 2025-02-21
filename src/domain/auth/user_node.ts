import { Node } from "../nodes/node.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Either, left, right } from "../../shared/either.ts";
import { Folders } from "../nodes/folders.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { InvalidFullnameFormatError } from "./invalid_fullname_format_error.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";
import { InvalidPasswordFormatError } from "./invalid_password_format_error.ts";
import { Nodes } from "../nodes/nodes.ts";
import { EmailValue } from "../nodes/email_value.ts";

export class UserNode extends Node {
	static async shaSum(email: string, password: string): Promise<string> {
		const encoder = new TextEncoder();
		const dataBuffer = encoder.encode(email.concat(password));

		const hashBuffer = await crypto.subtle.digest("SHA-512", dataBuffer);

		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	static create(metadata: Partial<NodeMetadata> = {}): Either<ValidationError, UserNode> {
		try {
			const node = new UserNode(metadata);
			return right(node);
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	email: EmailValue;
	group: string;
	groups: string[];
	secret: string | undefined;

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.USER_MIMETYPE, parent: Folders.USERS_FOLDER_UUID });
		this.group = metadata?.group ?? "";
		this.groups = metadata?.groups ?? [];

		this.email = undefined as unknown as EmailValue;
		if (metadata.email) {
			const emailOrErr = EmailValue.fromString(metadata.email);

			if (emailOrErr.isLeft()) {
				throw emailOrErr.value;
			}

			this.email = emailOrErr.value;
		}

		this.#validate();

		if (metadata.secret) {
			this.#validateSecretComplexity(metadata.secret);
			UserNode.shaSum(this.email.value, metadata.secret).then((hash) => {
				this.secret = hash;
			});
		}
	}

	#validateSecretComplexity(secret: string): void {
		if (secret.length < 8) {
			throw ValidationError.from(new InvalidPasswordFormatError());
		}
	}

	override update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
		const superUpdateResult = super.update(metadata);

		if (superUpdateResult.isLeft()) {
			return superUpdateResult;
		}

		try {
			this.#validate();
		} catch (err) {
			return left(err as ValidationError);
		}

		return right(undefined);
	}

	#validate() {
		const errors: AntboxError[] = [];
		if (!this.title || this.title.length < 3) {
			errors.push(new InvalidFullnameFormatError(this.title));
		}

		if (!this.group) {
			errors.push(new UserGroupRequiredError());
		}

		if (errors.length > 0) {
			throw ValidationError.from(...errors);
		}
	}
}
