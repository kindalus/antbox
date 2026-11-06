import { describe, it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertNoLegacySqliteLayout, databaseModules } from "./database_configuration.ts";

describe("databaseModules", () => {
	it("maps every database kind to its three repositories with the same parameters", () => {
		const cases: [Parameters<typeof databaseModules>[0], string, string[]][] = [
			[["postgres", "postgres://h/db"], "postgres", ["postgres://h/db"]],
			[["postgres"], "postgres", []],
			[["sqlite", "/data"], "sqlite", ["/data"]],
			[["sqlite"], "sqlite", []],
			[["mongodb", "mongodb://h:27017", "antbox"], "mongodb", ["mongodb://h:27017", "antbox"]],
			[["inmem"], "inmem", []],
		];
		for (const [database, kind, params] of cases) {
			expect(databaseModules(database)).toEqual({
				repository: [`${kind}/${kind}_node_repository.ts`, ...params],
				configurationRepository: [`${kind}/${kind}_configuration_repository.ts`, ...params],
				eventStoreRepository: [`${kind}/${kind}_event_store_repository.ts`, ...params],
			});
		}
	});
});

describe("assertNoLegacySqliteLayout", () => {
	async function withFolder(
		files: string[],
		run: (folder: string, snapshot: () => Promise<string[]>) => Promise<void>,
	) {
		const folder = await fs.mkdtemp(join(tmpdir(), "antbox-legacy-layout-"));
		try {
			for (const file of files) {
				await fs.mkdir(join(folder, file, ".."), { recursive: true });
				await fs.writeFile(join(folder, file), "x");
			}
			await run(
				folder,
				async () => (await fs.readdir(folder, { recursive: true })).sort(),
			);
		} finally {
			await fs.rm(folder, { recursive: true });
		}
	}

	it("refuses the legacy layout, lists the moves and leaves the files alone", async () => {
		await withFolder(
			["repository/nodes.db", "config/config.db", "events/events.db"],
			async (folder, snapshot) => {
				const before = await snapshot();
				let message = "";
				try {
					assertNoLegacySqliteLayout("acme", ["sqlite", folder]);
				} catch (error) {
					message = (error as Error).message;
				}
				expect(message).toContain("Tenant acme: SQLite databases found in the legacy layout");
				expect(message).toContain(
					`  mv ${folder}/repository/nodes.db* ${folder}/\n` +
						`  mv ${folder}/config/config.db* ${folder}/\n` +
						`  mv ${folder}/events/events.db* ${folder}/\n` +
						"(the * also moves the -wal and -shm files)",
				);
				expect(await snapshot()).toEqual(before);
			},
		);
	});

	it("lists only the files that still need moving", async () => {
		await withFolder(
			["repository/nodes.db", "nodes.db", "events/events.db"],
			async (folder) => {
				expect(() => assertNoLegacySqliteLayout("acme", ["sqlite", folder])).toThrow(
					`mv ${folder}/events/events.db* ${folder}/`,
				);
				expect(() => assertNoLegacySqliteLayout("acme", ["sqlite", folder])).not.toThrow(
					"nodes.db*",
				);
			},
		);
	});

	it("passes when the new files exist, the folder is fresh, or the database is not sqlite", async () => {
		await withFolder(
			["repository/nodes.db", "nodes.db", "config/config.db", "config.db"],
			(folder) => {
				assertNoLegacySqliteLayout("acme", ["sqlite", folder]);
				return Promise.resolve();
			},
		);
		await withFolder([], (folder) => {
			assertNoLegacySqliteLayout("acme", ["sqlite", folder]);
			assertNoLegacySqliteLayout("acme", ["sqlite", join(folder, "missing")]);
			assertNoLegacySqliteLayout("acme", ["sqlite"]);
			assertNoLegacySqliteLayout("acme", ["inmem"]);
			return Promise.resolve();
		});
	});
});
