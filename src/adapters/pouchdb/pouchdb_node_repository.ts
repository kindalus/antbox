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
	if (dbpath.startsWith("http")) {
		return Promise.resolve(right(new PouchdbNodeRepository(new PouchDB(dbpath))));
	}

	const path = dbpath + "/nodes";
	if (!directoryExists(path)) {
		Deno.mkdirSync(path, { recursive: true });
	}

	const db = new PouchDB("nodes", {
		adapter: "leveldb",
		systemPath: dbpath,
		prefix: dbpath + "/",
	});

	return Promise.resolve(right(new PouchdbNodeRepository(db)));
}

function directoryExists(path: string): boolean {
	try {
		return Deno.statSync(path).isDirectory;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) {
			return false;
		}

		throw error;
	}
}

class PouchdbNodeRepository implements NodeRepository {
	constructor(private readonly db: PouchDB) {
		PouchDB.plugin(PouchDbFind);

		this.db.createIndex({
			index: { fields: ["title", "fid", "parent", "aspects"] },
		}).catch(console.error);
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

			const updatedDoc = NodeFactory.compose(doc.value, node);

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
		const selectors = filters
			.map(filterToMango);

		const selector = composeMangoQuery(selectors);

		const result = await this.db.find({
			selector,
			limit: pageSize * pageToken,
		});

		const nodes = result.docs.map(docToNode);
		const pageCount = Math.ceil(nodes.length / pageSize);

		return {
			nodes: nodes.slice(pageSize * (pageToken - 1), pageSize * pageToken),
			pageCount,
			pageSize,
			pageToken,
		};
	}
}

function composeMangoQuery(filters: MangoFilter[]): Record<string, unknown> {
	if (filters.length === 0) {
		return {};
	}

	if (filters.length === 1) {
		return filters[0];
	}

	return {
		$and: filters,
	};
}

function filterToMango(filter: NodeFilter): MangoFilter {
	const [field, operator, value] = filter;

	if (operator === "contains") {
		return { [field]: { $all: [value] } };
	}

	if (operator === "match" && typeof value === "string") {
		return { [field]: { $regex: new RegExp(value, "i") } };
	}

	const o = operators[operator] as string;
	return { [field]: { [o]: value } };
}

function docToNode(doc: MangoDocument): Node {
	const { _id, _rev, ...node } = doc;
	return NodeFactory.compose(node);
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
};

type MangoFilter = { [key: string]: { [key: string]: unknown } };

type MangoDocument = Node & { _id: string; _rev: string };

interface MangoResult {
	docs: MangoDocument[];
}
