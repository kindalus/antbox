import { NodeFilter, Node } from "../../node";
import NodeRepository from "../../node_repository";
import { NodeFilterResult } from "../../node_service";

import {
	Firestore,
	getFirestore,
	collection,
	query,
	where,
	getDocs,
	getDoc,
	Query,
	doc,
	CollectionReference,
	DocumentReference,
	deleteDoc,
	setDoc,
} from "firebase/firestore";

export default class CmzNodeRepository implements NodeRepository {
	static NODES_COLLECTION = "cmzNodes";

	private afs: Firestore;

	constructor() {
		this.afs = getFirestore();
	}

	delete(uuid: string): Promise<void> {
		return deleteDoc(this.getDocRef(uuid));
	}

	update(node: Node): Promise<void> {
		return setDoc(this.getDocRef(node.uuid), node, { merge: false });
	}

	add(node: Node): Promise<void> {
		return setDoc(this.getDocRef(node.uuid), node);
	}

	getByFid(fid: string): Promise<Node> {
		const q = query(
			collection(this.afs, CmzNodeRepository.NODES_COLLECTION),
			where("fid", "==", fid),
		);

		return getDocs(q).then((value) => {
			if (!value.size) throw `Invalid fid: ${fid.substring(4)}`;
			return value.docs?.[0].data() as Node;
		});
	}

	getById(uuid: string): Promise<Node> {
		return getDoc(this.getDocRef(uuid)).then((data) => data.data() as Node);
	}

	async filter(
		constraints: NodeFilter[],

		pageSize: number,
		pageToken: number,
	): Promise<NodeFilterResult> {
		const firstIndex = (pageToken - 1) * pageSize;
		const lastIndex = firstIndex + pageSize;

		const reduceFn = (q: Query, constraint: NodeFilter): Query => {
			if (!q) {
				return query(
					collection(this.afs, CmzNodeRepository.NODES_COLLECTION),
					where(...constraint),
				);
			}
			return query(q, where(...constraint));
		};

		const NULL_QUERY = null as unknown as Query;

		const q = constraints.reduce(reduceFn, NULL_QUERY);

		const docs = (await getDocs(q)).docs
			.map((doc) => doc.data())
			.slice(firstIndex, lastIndex);

		const pageCount = Math.abs(docs.length / pageSize) + 1;

		return Promise.resolve({ nodes: docs as Node[], pageCount, pageSize, pageToken });
	}

	private getDocRef(uuid: string): DocumentReference {
		return doc(this.colRef, uuid);
	}

	private get colRef(): CollectionReference {
		return collection(this.afs, CmzNodeRepository.NODES_COLLECTION);
	}
}
