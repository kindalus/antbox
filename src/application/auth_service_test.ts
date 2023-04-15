import belike, { BelikerFn } from "/test/belike.ts";

import { assertNotEquals, assertStrictEquals } from "/deps/asserts";

import { AuthService } from "./auth_service.ts";
import { DefaultUuidGenerator } from "/strategies/default_uuid_generator.ts";

import { DomainEvents } from "./domain_events.ts";
import { UserCreatedEvent } from "/domain/auth/user_created_event.ts";
import { GroupCreatedEvent } from "/domain/auth/group_created_event.ts";

import { right } from "/shared/either.ts";
import { User } from "../domain/auth/user.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";
import { InMemoryNodeRepository } from "../adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "../adapters/inmem/inmem_storage_provider.ts";
import { DefaultFidGenerator } from "../adapters/strategies/default_fid_generator.ts";
import { Node } from "../domain/nodes/node.ts";
import { InvalidGroupNameFormatError } from "../domain/auth/invalid_group_name_format_error.ts";

Deno.test("createUser", async (t) => {
  await t.step("Grava o user no repositorio", async () => {
    const nodeService = makeServiceContext();
    nodeService.createMetanode = belike.fn(() =>
      Promise.resolve(right({} as Node))
    );

    const createMetanodeMock =
      nodeService.createMetanode as unknown as BelikerFn;

    const svc = new AuthService(nodeService);

    await svc.createUser(User.create("user1@antbox.io", "Antbox User"));

    assertStrictEquals(createMetanodeMock.called(), true);
  });

  await t.step("Deve lançar o evento UserCreatedEvent", async () => {
    const eventHandler = {
      handle: belike.fn(() => undefined),
    };

    DomainEvents.clearHandlers();
    DomainEvents.subscribe(UserCreatedEvent.EVENT_ID, eventHandler);

    const svc = new AuthService(makeServiceContext());

    const result = await svc.createUser(
      User.create("user@domain.com", "Some User")
    );

    assertStrictEquals(result.isRight(), true);
    assertStrictEquals(eventHandler.handle.calledTimes(1), true);
  });

  await t.step(
    "Erro @InvalidEmailFormat se o formato do email for inválido",
    async () => {
      const svc = new AuthService(makeServiceContext());
      const result = await svc.createUser(
        User.create("bademailformat", "Some User")
      );

      assertNotEquals(result.value, undefined);
    }
  );

  await t.step(
    "Erro @InvalidFullnameFormat se o formato do nome for inválido",
    async () => {
      const svc = new AuthService(makeServiceContext());
      const result = await svc.createUser(User.create("user@user.com", ""));

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
    const ctx = makeServiceContext();
    ctx.createMetanode = belike.fn(() => Promise.resolve(right({} as Node)));
    const createMetanodeMock = ctx.createMetanode as unknown as BelikerFn;

    const svc = new AuthService(ctx);

    await svc.createGroup({ title: "Group1" });

    assertStrictEquals(createMetanodeMock.called(), true);
  });

  await t.step(
    "Erro @InvalidGroupNameFormat se o formato do nome for inválido",
    async () => {
      const svc = new AuthService(makeServiceContext());
      const result = await svc.createGroup({ title: "" });

      assertStrictEquals(result.isLeft(), true);
      assertStrictEquals(
        (result.value as InvalidGroupNameFormatError).errorCode,
        InvalidGroupNameFormatError.ERROR_CODE
      );
    }
  );

  await t.step("Deve lançar o evento GroupCreatedEvent", async () => {
    const eventHandler = {
      handle: belike.fn(() => undefined),
    };

    DomainEvents.clearHandlers();
    DomainEvents.subscribe(GroupCreatedEvent.EVENT_ID, eventHandler);

    const svc = new AuthService(makeServiceContext());

    const result = await svc.createGroup({ title: "Group1" });

    assertStrictEquals(result.isRight(), true);
    assertStrictEquals(eventHandler.handle.calledTimes(1), true);
  });
});

function makeServiceContext(): NodeService {
  const ctx: NodeServiceContext = {
    fidGenerator: new DefaultFidGenerator(),
    repository: new InMemoryNodeRepository(),
    storage: new InMemoryStorageProvider(),
    uuidGenerator: new DefaultUuidGenerator(),
  };

  const srv = new NodeService(ctx);

  return srv;
}
