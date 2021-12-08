import { join } from "../../../deps.ts";
import fileExistsSync from "../../../helpers/file_exists_sync.ts";
import { jsonToUint8Array } from "../../../helpers/json_to_uint_8_array.ts";
import { Node } from "../../node.ts";
import InMemoryNodeRepository from "../in_memory/in_memory_node_repository.ts";

export default class FlatFileNodeRepository extends InMemoryNodeRepository {
  private lastBackupTime = 0;
  /**
   * @param path Raíz do repositorio de ficheiros
   */
  constructor(readonly path: string) {
    super();

    if (!fileExistsSync(this.dbFilePath)) {
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

  private writeDb(): Promise<void> {
    if (!fileExistsSync(this.path)) {
      Deno.mkdirSync(this.path, { recursive: true });
    }

    if (this.isTimeToBackup()) {
      this.backupDb();
    }

    return jsonToUint8Array(this.db).then((data: Uint8Array) =>
      Deno.writeFileSync(this.dbFilePath, data)
    );
  }

  private isTimeToBackup() {
    return this.moreThan6HoursSinceLastBackup();
  }

  private moreThan6HoursSinceLastBackup() {
    return Date.now() - this.lastBackupTime > 1000 * 60 * 60 * 6;
  }

  private backupDb() {
    if (fileExistsSync(this.dbFilePath)) {
      Deno.copyFileSync(
        this.dbFilePath,
        this.dbFilePath.concat("_", Date.now().toString()),
      );
      this.lastBackupTime = Date.now();
    }
  }

  private readDb(): Record<string, Partial<Node>> {
    const decoder = new TextDecoder("utf-8");
    const data = Deno.readFileSync(this.dbFilePath);

    return JSON.parse(decoder.decode(data));
  }

  private get dbFilePath(): string {
    return join(this.path, "db.json");
  }
}
