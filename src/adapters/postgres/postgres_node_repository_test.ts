import { expect } from "expect";
import { stub } from "mock";
import { providerFrom } from "adapters/module_configuration_parser.ts";
import { left, right } from "shared/either.ts";
import buildPostgresNodeRepository, {
	PostgresError,
	PostgresNodeRepository,
} from "./postgres_node_repository.ts";

Deno.test("PostgreSQL nodes can be loaded through the configured adapter factory", async () => {
	const initialize = stub(
		PostgresNodeRepository.prototype,
		"initialize",
		() => Promise.resolve(right(undefined)),
	);
	try {
		const repository = await providerFrom<PostgresNodeRepository>([
			"postgres/postgres_node_repository.ts",
			"postgres://localhost/adapter_factory_test",
		]);
		expect(repository).toBeInstanceOf(PostgresNodeRepository);
		expect(initialize.calls).toHaveLength(1);
		await repository!.close();
	} finally {
		initialize.restore();
	}
});

Deno.test("PostgreSQL factory closes connections when initialization fails", async () => {
	const error = new PostgresError("initialization failed");
	const initialize = stub(
		PostgresNodeRepository.prototype,
		"initialize",
		() => Promise.resolve(left(error)),
	);
	const close = stub(PostgresNodeRepository.prototype, "close", () => Promise.resolve());
	try {
		const result = await buildPostgresNodeRepository("postgres://localhost/adapter_factory_test");
		expect(result.isLeft()).toBe(true);
		expect(result.value).toBe(error);
		expect(close.calls).toHaveLength(1);
	} finally {
		initialize.restore();
		close.restore();
	}
});
