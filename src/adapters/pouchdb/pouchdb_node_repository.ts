import { PouchDB, PouchDbFind } from "../../../deps_not_arm8_portable.ts";
import { Node } from "../../domain/nodes/node.ts";
import { NodeFactory } from "../../domain/nodes/node_factory.ts";
import { FilterOperator, NodeFilter } from "../../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult, NodeRepository } from "../../domain/nodes/node_repository.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";

export default function buildPouchdbNodeRepository(
	dbpath: string,
): Promise<Either<AntboxError, NodeRepository>> {
	return Promise.resolve(right(new PouchdbNodeRepository(dbpath)));
}

export class PouchdbNodeRepository implements NodeRepository {
	private readonly db: PouchDB;

	constructor(dbpath: string) {
		PouchDB.plugin(PouchDbFind);

		this.db = new PouchDB("nodes", {
			adapter: "leveldb",
			systemPath: dbpath,
			prefix: dbpath + "/",
		});

		const path = dbpath + "/nodes";
		if (!this.#directoryExists(path)) {
			Deno.mkdirSync(path, { recursive: true });
		}

		this.db.createIndex({
			index: { fields: ["title", "fid", "parent", "aspects"] },
		}).catch(console.error);
	}

	#directoryExists(path: string): boolean {
		try {
			const stats = Deno.statSync(path);
			// stats.isDirectory will be true if path is a directory.
			return stats.isDirectory;
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) {
				// path does not exist
				return false;
			}
			// unexpected error, rethrow it
			throw error;
		}
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const doc = await this.db.get(uuid);

		if (!doc) {
			return left(new NodeNotFoundError(uuid));
		}

		this.db.remove(doc);

		return right(undefined);
	}

	update(node: Node): Promise<Either<NodeNotFoundError, void>> {
		return this.readFromDb(node.uuid).then((doc) => {
			if (doc.isLeft()) {
				return left(doc.value);
			}

			const updatedDoc = NodeFactory.composeNode(doc.value, node);

			this.db.put(updatedDoc);

			return right(undefined);
		});
	}

	add(node: Node): Promise<Either<AntboxError, void>> {
		return this.db
			.put({ _id: node.uuid, ...node } as unknown as Node)
			.then(() => right(undefined));
	}

	getByFid(fid: string): Promise<Either<NodeNotFoundError, Node>> {
		return this.db
			.find({ selector: { fid } })
			.then((r: MangoResult) => r.docs)
			.then((docs: MangoDocument[]) => docs.map(docToNode))
			.then((nodes: Node[]) => {
				if (nodes.length === 0) {
					return left(new NodeNotFoundError(Node.fidToUuid(fid)));
				}

				return right(nodes[0]);
			});
	}

	getById(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
		return this.readFromDb(uuid).then((doc) => {
			if (doc.isLeft()) {
				return left(doc.value);
			}

			return right(docToNode(doc.value));
		});
	}

	private async readFromDb(
		_id: string,
	): Promise<Either<NodeNotFoundError, PouchDB.Core.ExistingDocument<Node>>> {
		try {
			return right(await this.db.get(_id));
		} catch (err) {
			if (err.status === 404) {
				return left(new NodeNotFoundError(_id));
			}

			throw err;
		}
	}

	async filter(
		filters: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<NodeFilterResult> {
		const selector = filters
			.map(filterToMango)
			.reduce((acc, filter) => ({ ...acc, ...filter }), {});

		const result = await this.db.find({
			selector,
		});

		const nodes = result.docs.map(docToNode);
		// const pageCount = Math.ceil(nodes.length / pageSize);
		const pageCount = 1;

		return { nodes, pageCount, pageSize, pageToken };
	}
}

function filterToMango(filter: NodeFilter): MangoFilter {
	const [field, operator, value] = filter;

	if (operator === "contains") {
		return { [field]: { $all: [value] } };
	}

	if (operator === "match" && typeof (value) === "string") {
		return { [field]: { $regex: new RegExp(value, "i") } };
	}

	const o = operators[operator] as string;
	return { [field]: { [o]: value } };
}

function docToNode(doc: MangoDocument): Node {
	const { _id, _rev, ...node } = doc;
	return NodeFactory.composeNode(node);
}

const operators: Partial<Record<FilterOperator, string>> = {
	"==": "$eq",
	"!=": "$ne",
	">": "$gt",
	">=": "$gte",
	"<": "$lt",
	"<=": "$lte",
	in: "$in",
	"not-in": "$nin",
	"contains-all": "$all",

	match: "$regex",
};

type MangoFilter = { [key: string]: { [key: string]: unknown } };

type MangoDocument = Node & { _id: string; _rev: string };

interface MangoResult {
	docs: MangoDocument[];
}
