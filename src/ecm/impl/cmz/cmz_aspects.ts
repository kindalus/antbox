import {
	collection,
	CollectionReference,
	DocumentReference,
	Firestore,
	getFirestore,
	getDoc,
	getDocs,
	doc,
	deleteDoc,
	setDoc,
} from "firebase/firestore";
import { AspectProperty, Aspect } from "../../aspect";
import { AspectService } from "../../aspect_service";
import { RequestContext } from "../../request_context";

export default class CmzAspectService implements AspectService {
	private afs: Firestore;

	constructor() {
		this.afs = getFirestore();
	}

	async list(): Promise<Aspect[]> {
		const snapshot = await getDocs(this.colRef);

		return snapshot.docs.map((doc) => doc.data()) as unknown as Aspect[];
	}

	async get(request: RequestContext, uuid: string): Promise<Aspect> {
		return getDoc(this.getDocRef(uuid)).then((data) => data.data() as Aspect);
	}

	create(request: RequestContext, aspect: Aspect): Promise<void> {
		return this.saveAspect(aspect.uuid, aspect);
	}

	update(request: RequestContext, uuid: string, aspect: Aspect): Promise<void> {
		return this.saveAspect(uuid, { ...aspect, uuid });
	}

	delete(request: RequestContext, uuid: string): Promise<void> {
		return deleteDoc(this.getDocRef(uuid));
	}

	private saveAspect(uuid: string, aspect: Aspect): Promise<void> {
		const cleanAspect: Aspect = { ...this.cleanAspect(aspect), builtIn: false };
		this.validateAspect(cleanAspect);

		return setDoc(this.getDocRef(uuid), cleanAspect, { merge: false }).then(
			() => undefined,
		);
	}

	/**
	 * Verifica se o aspecto é válido.
	 * Se não for lança uma excepção
	 */
	private validateAspect(aspect: Aspect): void {
		if (typeof aspect.uuid !== "string")
			throw new Error("Invalid field format [uuid]: " + aspect.uuid);

		if (typeof aspect.title !== "string")
			throw new Error("Invalid field format [title]: " + aspect.uuid);

		if (aspect.description && typeof aspect.description !== "string")
			throw new Error("Invalid field format [description] " + aspect.description);

		if (aspect.mimetypeConstraints) {
			if (!Array.isArray(aspect.mimetypeConstraints))
				throw new Error(
					"Invalid field format [mimetypeConstraints]: " +
						aspect.mimetypeConstraints,
				);

			if (aspect.mimetypeConstraints.some((el) => typeof el !== "string"))
				throw new Error(
					"Invalid field format [mimetypeConstraints]: " +
						aspect.mimetypeConstraints,
				);
		}

		if (aspect.properties) {
			if (!Array.isArray(aspect.properties))
				throw new Error(
					"Invalid field format [properties]: " + aspect.properties,
				);

			for (const property of aspect.properties) this.validateProperty(property);

			if (aspect.mimetypeConstraints.some((el) => typeof el !== "string"))
				throw new Error(
					"Invalid field format [mimetypeConstraints]: " +
						aspect.mimetypeConstraints,
				);
		}
	}

	private validateProperty(property: AspectProperty): void {
		if (
			typeof property.name !== "string" ||
			!property.name.match(/[a-zA-Z_][_a-zA-Z0-9_]{1,}/)
		)
			throw new Error("Invalid property format: name => " + property.name);

		if (typeof property.title !== "string")
			throw new Error("Invalid property format: title");

		if (typeof property.title !== "string")
			throw new Error("Invalid property format: title");

		if (typeof property.required !== "boolean")
			throw new Error("Invalid property format: required");

		if (
			![
				"String",
				"Number",
				"DateTime",
				"Boolean",
				"UUID",
				"String[]",
				"Number[]",
				"UUID[]",
				"Object",
			].includes(property.type)
		)
			throw new Error("Invalid property format: type => " + property.type);

		if (property.validationList) {
			const err = new Error("Invalid property format: validationList");
			if (!Array.isArray(property.validationList)) throw err;

			if (
				!["String", "DateTime", "UUID", "String[]", "UUID[]"].includes(
					property.type,
				)
			)
				throw err;

			if (["DateTime", "DateTime[]"].includes(property.type)) {
				const datetimeList =
					property.type === "DateTime" ? [property.type] : property.type;

				try {
					for (const datetime of datetimeList) Date.parse(datetime);
				} catch (_) {
					throw err;
				}
			}
		}

		if (property.validationRegex) {
			const err = new Error("Invalid property format: validationRegex");

			try {
				new RegExp(property.validationRegex);
			} catch (_) {
				throw err;
			}

			if (!["String", "UUID[]"].includes(property.type)) throw err;
		}
	}

	/**
	 * Limpa o aspecto de forma a ter apenas o que é suporto para persistir
	 * @param aspect
	 */
	private cleanAspect(aspect: Aspect): Aspect {
		const removeUnusedfields = this.removeUnusedfields;

		const cleaned = this.removeUnusedfields({
			uuid: aspect.uuid,
			title: aspect.title,
			description: aspect.description,
			builtIn: aspect.builtIn,
			mimetypeConstraints: aspect.mimetypeConstraints,
			properties: aspect.properties?.map((p) =>
				this.cleanProperty(removeUnusedfields, p),
			),
		});

		return cleaned;
	}

	private cleanProperty(
		removeUnusedfields: (a: AspectProperty) => AspectProperty,
		property: AspectProperty,
	): AspectProperty {
		const cleaned = removeUnusedfields({
			name: property.name,
			title: property.title,
			type: property.type,
			validationRegex: property.validationRegex,
			validationList: property.validationList,
			required: property.required,
		});

		return cleaned;
	}

	private removeUnusedfields<T>(obj: T): T {
		const cleaned = JSON.parse(JSON.stringify(obj));

		for (const key of Object.keys(cleaned)) {
			if (!cleaned[key] && cleaned[key] !== false) delete cleaned[key];
		}

		return cleaned as T;
	}

	private getDocRef(uuid: string): DocumentReference {
		return doc(this.afs, ASPECTS_COLLECTION + "/" + uuid);
	}

	private get colRef(): CollectionReference {
		return collection(this.afs, ASPECTS_COLLECTION);
	}
}

const ASPECTS_COLLECTION = "cmzAspects";
