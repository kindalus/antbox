import { NodeFactory } from "/domain/nodes/node_factory.ts";
import DB, {
  PouchDB,
} from "https://deno.land/x/pouchdb_deno@2.1.3-PouchDB+7.3.0/modules/pouchdb/mod.ts";

import { Node } from "/domain/nodes/node.ts";
import { NodeFilter } from "/domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { EcmError } from "/shared/ecm_error.ts";
import { Either, left, right } from "/shared/either.ts";
import {
  NodeFilterResult,
  NodeRepository,
} from "/domain/nodes/node_repository.ts";

export class PouchdbNodeRepository implements NodeRepository {
  private readonly db: PouchDB.Database<Node>;

  constructor(dbpath: string) {
    this.db = new DB("nodes", {
      adapter: "indexeddb",
      systemPath: dbpath,
      prefix: dbpath + "/",
    });
    this.db.createIndex({
      index: { fields: ["title", "fid", "parent", "aspects"] },
    });
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

  add(node: Node): Promise<Either<EcmError, void>> {
    return this.db
      .put({ _id: node.uuid, ...node } as unknown as Node)
      .then(() => right(undefined));
  }

  getByFid(fid: string): Promise<Either<NodeNotFoundError, Node>> {
    return this.db
      .find({ selector: { fid } })
      .then((r) => r.docs)
      .then((docs) => docs.map(docToNode))
      .then((nodes) => {
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
    _id: string
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
    constraints: NodeFilter[],
    pageSize: number,
    pageToken: number
  ): Promise<NodeFilterResult> {
    const filters = constraints
      .map(filterToMango)
      .reduce((acc, filter) => ({ ...acc, ...filter }), {});

    const result = await this.db.find({
      selector: filters,
    });

    const nodes = result.docs.map(docToNode);
    // const pageCount = Math.ceil(nodes.length / pageSize);
    const pageCount = 1;

    return { nodes, pageCount, pageSize, pageToken };
  }
}

function filterToMango(filter: NodeFilter): MangoFilter {
  const [field, operator, value] = filter;
  const o = operators[operator];

  return { [field]: { [o]: value } };
}

function docToNode(doc: PouchDB.Core.ExistingDocument<Node>): Node {
  const { _id, _rev, ...node } = doc;
  return NodeFactory.composeNode(node);
}

const operators: Record<string, string> = {
  "==": "$eq",
  "!=": "$ne",
  ">": "$gt",
  ">=": "$gte",
  "<": "$lt",
  "<=": "$lte",
  in: "$in",
  "not-in": "$nin",
  "array-contains": "$all",
  match: "$regex",
};

type MangoFilter = { [key: string]: { [key: string]: unknown } };
