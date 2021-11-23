import * as fs from "fs";
import * as path from "path";

import Node from "../../node";
import InMemoryNodeRepository from "../in_memory/in_memory_node_repository";

export default class FlatFileNodeRepository extends InMemoryNodeRepository {
	private lastBackupTime: number = 0;
	/**
	 *
	 * @param path Raíz do repositorio de ficheiros
	 */
	constructor(readonly path: string) {
		super();

		if (!fs.existsSync(this.dbFilePath)) {
			this.lastBackupTime = Date.now();
			this.writeDb();
		} else {
			this.backupDb();
		}

		const storedDb = this.readDb();

		for (const [key, node] of Object.entries(storedDb)) {
			this.db[key] = node;
		}
	}

	add(node: Node): Promise<void> {
		return super.add(node).then(() => this.writeDb());
	}

	update(node: Node): Promise<void> {
		return super.update(node).then(() => this.writeDb());
	}

	delete(uuid: string): Promise<void> {
		return super.delete(uuid).then(() => this.writeDb());
	}

	private writeDb() {
		if (!fs.existsSync(this.path)) {
			fs.mkdirSync(this.path, { recursive: true });
		}

		if (this.isTimeToBackup()) {
			this.backupDb();
		}

		fs.writeFileSync(this.dbFilePath, JSON.stringify(this.db), { encoding: "utf-8" });
	}

	private isTimeToBackup() {
		return this.moreThan6HoursSinceLastBackup();
	}

	private moreThan6HoursSinceLastBackup() {
		return Date.now() - this.lastBackupTime > 1000 * 60 * 60 * 6;
	}

	private backupDb() {
		if (fs.existsSync(this.dbFilePath)) {
			fs.copyFileSync(this.dbFilePath, this.dbFilePath.concat("_", Date.now().toString()));
			this.lastBackupTime = Date.now();
		}
	}

	private readDb(): Record<string, Partial<Node>> {
		const data = fs.readFileSync(this.dbFilePath, { encoding: "utf-8" });

		return JSON.parse(data);
	}

	private get dbFilePath(): string {
		return path.join(this.path, "db.json");
	}
}
