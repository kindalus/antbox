import { join } from "/deps/path";
import { Node } from "/domain/nodes/node.ts";
import { fileExistsSync } from "/shared/file_exists_sync.ts";

import { InMemoryNodeRepository } from "/adapters/inmem/inmem_node_repository.ts";

export class FlatFileNodeRepository extends InMemoryNodeRepository {
  private lastBackupTime = 0;
  /**
   * @param path Raíz do repositorio de ficheiros
   */
  constructor(readonly path: string) {
    super();

    Promise.resolve(fileExistsSync(this.dbFilePath))
      .then((pathExists) => {
        if (!pathExists) {
          this.lastBackupTime = Date.now();
          return this.writeDb();
        }
        this.backupDb();
      })
      .then(() => {
        const storedDb = this.readDb();

        for (const [key, node] of Object.entries(storedDb)) {
          this.db[key] = node;
        }
      });
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

    return toUint8Array(this.db).then((data: Uint8Array) =>
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
    if (!fileExistsSync(this.dbBackupFolderPath)) {
      Deno.mkdirSync(this.dbBackupFolderPath, { recursive: true });
    }

    if (fileExistsSync(this.dbFilePath)) {
      Deno.copyFileSync(
        this.dbFilePath,
        this.dbBackupFolderPath.concat(
          "db.json_",
          new Date(Date.now()).toISOString()
        )
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

  private get dbBackupFolderPath(): string {
    return join(this.path, "backup");
  }
}

function toUint8Array(data: unknown): Promise<Uint8Array> {
  const blob = new Blob([JSON.stringify(data)]);

  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}
