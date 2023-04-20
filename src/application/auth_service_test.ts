import {
  assertFalse,
  assertStrictEquals,
  assertEquals,
  spy,
  assertSpyCalls,
} from "../../dev_deps.ts";
import { InMemoryNodeRepository } from "../adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "../adapters/strategies/default_fid_generator.ts";
import { DefaultUuidGenerator } from "../adapters/strategies/default_uuid_generator.ts";
import { GroupCreatedEvent } from "../domain/auth/group_created_event.ts";
import { InvalidFullnameFormatError } from "../domain/auth/invalid_fullname_format_error.ts";
import { InvalidGroupNameFormatError } from "../domain/auth/invalid_group_name_format_error.ts";
import { User } from "../domain/auth/user.ts";
import { UserCreatedEvent } from "../domain/auth/user_created_event.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { ValidationError } from "../shared/validation_error.ts";
import { AuthService } from "./auth_service.ts";
import { DomainEvents } from "./domain_events.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";

function eventHandler() {
  return { handle: () => undefined };
}

Deno.test("createUser", async (t) => {
  await t.step("Grava o user no repositorio", async () => {
    const nodeService = makeNodeService();

    const createMetanodeSpy = spy(nodeService, "createMetanode");

    const svc = new AuthService(nodeService);

    await svc.createUser(User.create("user1@antbox.io", "Antbox User"));
    assertSpyCalls(createMetanodeSpy, 1);
  });

  await t.step("Deve lançar o evento UserCreatedEvent", async () => {
    const handler = eventHandler();
    const eventHandlerSpy = spy(handler, "handle");

    DomainEvents.clearHandlers();
    DomainEvents.subscribe(UserCreatedEvent.EVENT_ID, handler);

    const svc = new AuthService(makeNodeService());

    const result = await svc.createUser(
      User.create("user@domain.com", "Some User")
    );

    assertFalse(result.isLeft());
    assertSpyCalls(eventHandlerSpy, 1);
  });

  await t.step(
    "Erro @InvalidEmailFormat se o formato do email for inválido",
    async () => {
      const svc = new AuthService(makeNodeService());
      const result = await svc.createUser(
        User.create("bademailformat", "Some User")
      );

      assertStrictEquals(result.isLeft(), true);
      assertStrictEquals(
        (result.value as AntboxError).errorCode,
        ValidationError.ERROR_CODE
      );
    }
  );

  await t.step(
    "Erro @InvalidFullnameFormat se o formato do nome for inválido",
    async () => {
      const svc = new AuthService(makeNodeService());
      const result = await svc.createUser(User.create("user@user.com", ""));

      assertFalse(result.isRight(), undefined);
      assertEquals(
        (result.value as AntboxError).errorCode,
        ValidationError.ERROR_CODE
      );
      assertEquals(
        (result.value as ValidationError).has(
          InvalidFullnameFormatError.ERROR_CODE
        ),
        true
      );
    }
  );
});

Deno.test("createGroup", async (t) => {
  await t.step("Grava o grupo no repositorio", async () => {
    const nodeService = makeNodeService();
    const createMetanodeSpy = spy(nodeService, "createMetanode");

    const svc = new AuthService(nodeService);

    await svc.createGroup({ title: "Group1" });

    assertSpyCalls(createMetanodeSpy, 1);
  });

  await t.step(
    "Erro @InvalidGroupNameFormat se o formato do nome for inválido",
    async () => {
      const svc = new AuthService(makeNodeService());
      const result = await svc.createGroup({ title: "" });

      assertStrictEquals(result.isLeft(), true);
      assertEquals(
        (result.value as AntboxError).errorCode,
        ValidationError.ERROR_CODE
      );
      assertEquals(
        (result.value as ValidationError).has(
          InvalidGroupNameFormatError.ERROR_CODE
        ),
        true
      );
    }
  );

  await t.step("Deve lançar o evento GroupCreatedEvent", async () => {
    const handler = eventHandler();

    DomainEvents.clearHandlers();
    DomainEvents.subscribe(GroupCreatedEvent.EVENT_ID, handler);

    const eventHandlerSpy = spy(handler, "handle");

    const svc = new AuthService(makeNodeService());

    const result = await svc.createGroup({ title: "Group1" });

    assertFalse(result.isLeft());
    assertSpyCalls(eventHandlerSpy, 1);
  });
});

Deno.test("getUser", async (t) => {
  await t.step("Retorna o utilizador se ele existir", async () => {
    const nodeService = makeNodeService();
    const svc = new AuthService(nodeService);

    const user = {
      email: "user@domain.com",
      fullname: "Some User",
    } as User;

    await svc.createUser(user);

    const userOrErr = await svc.getUserByEmail(user.email);

    assertFalse(userOrErr.isLeft());
    assertStrictEquals((userOrErr.value as User).email, user.email);
  });

  await t.step(
    "Retorna o error @UserNotFound se o utilizador não existir",
    async () => {
      const nodeService = makeNodeService();
      const svc = new AuthService(nodeService);

      const userOrErr = await svc.getUserByEmail("bad_email@bad_domain.com");

      assertStrictEquals(userOrErr.isLeft(), true);
      assertStrictEquals(
        (userOrErr.value as AntboxError).errorCode,
        UserNotFoundError.ERROR_CODE
      );
    }
  );
});

function makeNodeService(): NodeService {
  const ctx: NodeServiceContext = {
    fidGenerator: new DefaultFidGenerator(),
    repository: new InMemoryNodeRepository(),
    storage: new InMemoryStorageProvider(),
    uuidGenerator: new DefaultUuidGenerator(),
  };

  const srv = new NodeService(ctx);

  return srv;
}
