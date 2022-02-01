import { assertStrictEquals, belike } from "../../../dev_deps.ts";
import { success } from "../../helpers/either.ts";
import EcmError from "../ecm_error.ts";
import AuthService, { AuthServiceContext } from "./auth_service.ts";

Deno.test("createUser", async (t) => {
	await t.step("Deve gerar uma senha", () => {
		const passwordGenerator = { generate: belike.fn(() => "xptoso") };

		const svc = new AuthService({
			...makeServiceContext(),
			passwordGenerator,
		});

		svc.createUser("user1@antbox.io", "Antbox User");

		assertStrictEquals(passwordGenerator.generate.called(), true);
	});

	await t.step(
		"Envia a senha pelo mecanismo de notificação por email",
		() => {
			const GENERATED_PASSWORD = "coolpasswd";
			const passwordGenerator = { generate: () => GENERATED_PASSWORD };
			const email = "user@example.com";
			const fullname = "John Doe";

			const emailSender = { send: belike.fn(() => undefined) };

			const svc = new AuthService({
				...makeServiceContext(),
				passwordGenerator,
				emailSender,
			});

			svc.createUser(email, fullname);

			assertStrictEquals(
				emailSender.send.calledWith(
					{ value: email },
					{ value: fullname },
					GENERATED_PASSWORD,
				),
				true,
			);
		},
	);

	await t.step("Grava o user no repositorio", () => {
		const userRepository = {
			addOrReplace: belike.fn(() =>
				Promise.resolve(success<void, EcmError>(undefined))
			),
		};

		const svc = new AuthService({
			...makeServiceContext(),
			userRepository,
		});

		svc.createUser("user1@antbox.io", "Antbox User");

		assertStrictEquals(userRepository.addOrReplace.called(), true);
	});
});

function makeServiceContext(): AuthServiceContext {
	return {
		passwordGenerator: { generate: () => "passwd" + Date.now() },
		emailSender: { send: () => undefined },
		userRepository: {
			addOrReplace: () => Promise.resolve(success(undefined)),
		},
	};
}
