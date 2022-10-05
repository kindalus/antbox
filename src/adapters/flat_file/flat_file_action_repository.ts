import { join } from "/deps/path";

import { Action } from "/domain/actions/action.ts";
import { ActionRepository } from "/domain/actions/action_repository.ts";
import { FlatFileRepository } from "./flat_file_repository.ts";

export class FlatFileActionRepository implements ActionRepository {
  readonly repo: FlatFileRepository<Action>;

  constructor(path: string) {
    const buildFilePath = (uuid: string) => join(path, uuid.concat(".js"));

    this.repo = new FlatFileRepository<Action>(
      path,
      buildFilePath,
      toUint8Array
    );
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
	export ${action.run.toString()}

	export const spec = {
		${action.spec.title ? 'title: "action.spec.description",' : ""}
		${action.spec.description ? 'description: "action.spec.description",' : ""}
		builtIn: ${action.spec.builtIn},
		multiple: ${action.spec.multiple},
		aspectConstraints: ${JSON.stringify(action.spec.aspectConstraints ?? [])},
		mimetypeConstraints: ${JSON.stringify(action.spec.mimetypeConstraints ?? [])},
		params: [],
	};
`;

  return Promise.resolve(new TextEncoder().encode(text));
}
