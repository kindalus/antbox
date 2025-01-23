import { Either } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { ActionNode } from "../actions/action_node.ts";
import { ApiKeyNode } from "../api_keys/api_key_node.ts";
import { AspectNode } from "../aspects/aspect_node.ts";
import { GroupNode } from "../auth/group_node.ts";
import { FormSpecificationNode } from "../forms_specifications/form_specification.ts";
import { ExtNode } from "./ext_node.ts";
import { FileNode } from "./file_node.ts";
import { FolderNode } from "./folder_node.ts";
import { MetaNode } from "./meta_node.ts";
import { NodeLike } from "./node_like.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";

export class NodeFactory {
	static from<T extends NodeLike>(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, T> {
		let createFn: (
			metadata: Partial<NodeMetadata>,
		) => Either<ValidationError, NodeLike>;

		switch (metadata.mimetype) {
			case Nodes.ACTION_MIMETYPE:
				createFn = ActionNode.create;
				break;

			case Nodes.API_KEY_MIMETYPE:
				createFn = ApiKeyNode.create;
				break;

			case Nodes.ASPECT_MIMETYPE:
				createFn = AspectNode.create;
				break;

			case Nodes.EXT_MIMETYPE:
				createFn = ExtNode.create;
				break;

			case Nodes.FOLDER_MIMETYPE:
				createFn = FolderNode.create;
				break;

			case Nodes.GROUP_MIMETYPE:
				createFn = GroupNode.create;
				break;

			case Nodes.META_NODE_MIMETYPE:
				createFn = MetaNode.create;
				break;

			case Nodes.SMART_FOLDER_MIMETYPE:
				createFn = SmartFolderNode.create;
				break;
			case Nodes.FORM_SPECIFICATION_MIMETYPE:
				createFn = FormSpecificationNode.create;
				break;
			default:
				createFn = FileNode.create;
		}

		return createFn(metadata) as Either<ValidationError, T>;
	}
}
