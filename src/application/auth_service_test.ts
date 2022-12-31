import belike from "/test/belike.ts";

import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStrictEquals,
} from "/deps/asserts";

import { AntboxError } from "/shared/antbox_error.ts";
import { AuthService, AuthServiceContext } from "./auth_service.ts";
import { DefaultUuidGenerator } from "/strategies/default_uuid_generator.ts";

import { DomainEvents } from "./domain_events.ts";
import { UserCreatedEvent } from "/domain/auth/user_created_event.ts";
import { GroupCreatedEvent } from "/domain/auth/group_created_event.ts";

import { InMemoryUserRepository } from "/adapters/inmem/inmem_user_repository.ts";
import { Either, right } from "/shared/either.ts";

Deno.test("createUser", async (t) => {
  await t.step("Deve gerar uma senha", async () => {
    const passwordGenerator = { generate: belike.fn(() => "xptoso") };
    const svc = new AuthService({ ...makeServiceContext(), passwordGenerator });

    await svc.createUser("user1@antbox.io", "Antbox User");

    assertStrictEquals(passwordGenerator.generate.called(), true);
  });

  await t.step("Grava o user no repositorio", async () => {
    const ctx = makeServiceContext();
    const addOrReplaceMock = belike.fn(
      (): Promise<Either<AntboxError, undefined>> =>
        Promise.resolve(right(undefined))
    );
    ctx.userRepository.addOrReplace = addOrReplaceMock;

    const svc = new AuthService(ctx);

    await svc.createUser("user1@antbox.io", "Antbox User");

    assertStrictEquals(addOrReplaceMock.called(), true);
  });

  await t.step(
    "Envia a senha pelo mecanismo de notificação por email",
    async () => {
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

      await svc.createUser(email, fullname);

      assertStrictEquals(
        emailSender.send.calledWith(
          { value: email },
          { value: fullname },
          GENERATED_PASSWORD
        ),
        true
      );
    }
  );

  await t.step("Deve lançar o evento UserCreatedEvent", async () => {
    const eventHandler = {
      handle: belike.fn(() => undefined),
    };

    DomainEvents.clearHandlers();
    DomainEvents.subscribe(UserCreatedEvent.EVENT_ID, eventHandler);

    const svc = new AuthService(makeServiceContext());

    const result = await svc.createUser("user@domain.com", "Some User");

    assertStrictEquals(result.value, undefined);
    assertStrictEquals(eventHandler.handle.calledTimes(1), true);
  });

  await t.step(
    "Erro @InvalidEmailFormat se o formato do email for inválido",
    async () => {
      const svc = new AuthService({ ...makeServiceContext() });
      const result = await svc.createUser("bademailformat", "Some User");

      assertNotEquals(result.value, undefined);
      // assertStrictEquals(
      //   result.value.errorCode,
      //   InvalidEmailFormatError.ERROR_CODE
      // );
    }
  );

  await t.step(
    "Erro @InvalidFullnameFormat se o formato do nome for inválido",
    async () => {
      const svc = new AuthService({ ...makeServiceContext() });
      const result = await svc.createUser("user@user.com", "");

      assertNotEquals(result.value, undefined);
      // assertStrictEquals(
      //   result.value.errorCode,
      //   InvalidFullnameFormatError.ERROR_CODE
      // );
    }
  );
});

Deno.test("createGroup", async (t) => {
  await t.step("Grava o grupo no repositorio", async () => {
    const groupRepository = {
      addOrReplace: belike.fn(
        (): Promise<Either<AntboxError, undefined>> =>
          Promise.resolve(right(undefined))
      ),
    };

    const svc = new AuthService({ ...makeServiceContext(), groupRepository });

    await svc.createGroup("Group1");

    assertStrictEquals(groupRepository.addOrReplace.called(), true);
  });

  await t.step(
    "Erro @InvalidGroupNameFormat se o formato do nome for inválido",
    async () => {
      const svc = new AuthService({ ...makeServiceContext() });
      const result = await svc.createGroup("");

      assertExists(result.value);
      // assertStrictEquals(
      //   result.value.errorCode,
      //   InvalidGroupNameFormatError.ERROR_CODE
      // );
    }
  );

  await t.step("Deve lançar o evento GroupCreatedEvent", async () => {
    const eventHandler = {
      handle: belike.fn(() => undefined),
    };

    DomainEvents.clearHandlers();
    DomainEvents.subscribe(GroupCreatedEvent.EVENT_ID, eventHandler);

    const svc = new AuthService(makeServiceContext());

    const result = await svc.createGroup("Group1");

    assertStrictEquals(result.value, undefined);
    assertStrictEquals(eventHandler.handle.calledTimes(1), true);
  });
});

function makeServiceContext(): AuthServiceContext {
  return {
    passwordGenerator: { generate: () => "passwd" + Date.now() },
    emailSender: { send: () => undefined },
    userRepository: new InMemoryUserRepository(),

    groupRepository: {
      addOrReplace: () => Promise.resolve(right(undefined)),
    },

    uuidGenerator: new DefaultUuidGenerator(),
  };
}

Deno.test("authenticate", async (t) => {
  await t.step(
    "Se repository vazio autentica o user com o Role Admin",
    async () => {
      const svc = new AuthService({ ...makeServiceContext() });

      const username = "user@domain";
      const result = await svc.authenticate(username, "passwd");

      assertStrictEquals(result.value, undefined);
      assertEquals(result.value, { username, roles: ["Admin"] });
    }
  );
});
