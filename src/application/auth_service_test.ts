import { assertNotEquals, assertStrictEquals, belike } from "../../dev_deps.ts";
import { success } from "../shared/either.ts";
import EcmError from "../shared/ecm_error.ts";
import AuthService, { AuthServiceContext } from "./auth_service.ts";

import InvalidEmailFormatError from "../domain/auth/invalid_email_format_error.ts";
import InvalidFullnameFormatError from "../domain/auth/invalid_fullname_format_error.ts";

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

	await t.step(
		"Erro @InvalidEmailFormat se o formato do email for inválido",
		() => {
			const svc = new AuthService({ ...makeServiceContext() });
			const result = svc.createUser("bademailformat", "Some User");

			assertNotEquals(result.error, undefined);
			assertStrictEquals(
				result.error?.errorCode,
				InvalidEmailFormatError.ERROR_CODE,
			);
		},
	);

	await t.step(
		"Erro @InvalidFullnameFormat se o formato do nome for inválido",
		() => {
			const svc = new AuthService({ ...makeServiceContext() });
			const result = svc.createUser("user@user.com", "");

			assertNotEquals(result.error, undefined);
			assertStrictEquals(
				result.error?.errorCode,
				InvalidFullnameFormatError.ERROR_CODE,
			);
		},
	);
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
