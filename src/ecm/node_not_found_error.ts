import EngineError from "./engine_error.js";

export default class NodeNotFoundError extends EngineError {
	static ERROR_CODE = "NodeNotFoundError";
	constructor(uuid: string) {
		super(NodeNotFoundError.ERROR_CODE, `Could not find node with uuid: ${uuid}`);
	}
}
