import { join } from "/deps/path";

import Action from "/domain/actions/action.ts";
import ActionRepository from "/domain/actions/action_repository.ts";
import FlatFileRepository from "./flat_file_repository.ts";

export default class FlatFileActionRepository implements ActionRepository {
	readonly repo: FlatFileRepository<Action>;

	constructor(path: string) {
		const buildFilePath = (uuid: string) => join(path, uuid.concat(".js"));

		this.repo = new FlatFileRepository<Action>(path, buildFilePath, toUint8Array);
	}

	get(uuid: string): Promise<Action> {
		return this.repo.get(uuid);
	}

	delete(uuid: string): Promise<void> {
		return this.repo.delete(uuid);
	}

	addOrReplace(action: Action): Promise<void> {
		return this.repo.addOrReplace(action);
	}

	getAll(): Promise<Action[]> {
		return this.repo.getAll();
	}

	getPath(uuid: string): Promise<string> {
		return Promise.resolve(this.repo.buildFilePath(uuid));
	}
}

function toUint8Array(action: Action): Promise<Uint8Array> {
	const text = `

	/**
	 * @param { Actions.RunContext } ctx
	 * @param { Object } params
	 * @param { String[] } uuids
	 */
	${action.run.toString()}

	export default {
		uuid: "${action.uuid}",
		title: "${action.title}",
		description: "${action.description}",		
		builtIn: ${action.builtIn},
		multiple: ${action.multiple},
		aspectConstraints: ${JSON.stringify(action.aspectConstraints)},
		mimetypeConstraints: ${JSON.stringify(action.mimetypeConstraints)},
		params: [],
		run
	};
`;

	return Promise.resolve(new TextEncoder().encode(text));
}
