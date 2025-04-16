import { beforeAll, describe, test } from "bdd";
import { expect } from "expect";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { SmartFolderNodeNotFoundError } from "domain/nodes/smart_folder_node_not_found_error.ts";
import type { NodeFilters1D, NodeFilters2D } from "domain/nodes/node_filter.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { AspectProperties } from "domain/aspects/aspect_node.ts";
import { AspectableNode } from "domain/node_like.ts";

const nodeService = (opts: Partial<NodeServiceContext> = {}) => {
  const service = new NodeService({
    repository: opts.repository ?? new InMemoryNodeRepository(),
    storage: opts.storage ?? new InMemoryStorageProvider(),
    bus: opts.bus ?? new InMemoryEventBus(),
  });

  return service;
};

const authCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "",
  principal: {
    email: Users.ROOT_USER_EMAIL,
    groups: [Groups.ADMINS_GROUP_UUID],
  },
};

const anonymousCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "",
  principal: {
    email: Users.ANONYMOUS_USER_EMAIL,
    groups: [Groups.ANONYMOUS_GROUP_UUID],
  },
};

const financeCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "",
  principal: {
    email: "finance@domain.com",
    groups: ["finance"],
  },
};

const service = nodeService();

beforeAll(async () => {
  await loadData(service);
});

describe("NodeService.find", () => {
  test("should find all jpg files", async () => {
    const filters: NodeFilters1D = [["mimetype", "==", "image/jpeg"]];
    const result = await service.find(authCtx, filters);

    expect(result.isRight(), errToMsg(result.value)).toBeTruthy();
    expect(result.right.nodes.length).toBe(2);
    expect(result.right.nodes.map((n) => n.title)).toEqual([
      "Background Zoom-1.jpg",
      "Background Zoom-2.jpg",
    ]);
  });

  test("should find nodes with OPE aspect", async () => {
    const filters: NodeFilters1D = [["aspects", "contains", "ope"]];
    const result = await service.find(authCtx, filters);

    expect(result.isRight(), errToMsg(result.value)).toBeTruthy();
    expect(result.right.nodes.length).toBe(5);
    expect(
      result.right.nodes.every((n) =>
        (n as AspectableNode).aspects?.includes("ope")
      ),
    )
      .toBeTruthy();
  });

  test("should find posicao-financeira aspect OR contabilidade folder nodes", async () => {
    const filters: NodeFilters2D = [
      [["aspects", "contains", "posicao-financeira"]],
      [["parent", "==", "contabilidade-uuid"]],
    ];

    const result = await service.find(authCtx, filters);

    expect(result.isRight(), errToMsg(result.value)).toBeTruthy();
    expect(result.right.nodes.length).toBe(8);
    expect(
      result.right.nodes.some((n) =>
        (n as AspectableNode).aspects?.includes("posicao-financeira")
      ),
    ).toBeTruthy();
    expect(result.right.nodes.some((n) => n.parent === "contabilidade-uuid"))
      .toBeTruthy();
  });

  test("should not return files without read permission", async () => {
    const filters: NodeFilters1D = [["parent", "==", Folders.ROOT_FOLDER_UUID]];
    const result = await service.find(financeCtx, filters);

    expect(result.isRight(), errToMsg(result.value)).toBeTruthy();
    expect(result.right.nodes.length).toBe(6);
  });
});

describe("NodeService.list", () => {
  test("should list all nodes in the root folder", async () => {
    const listOrErr = await service.list(authCtx, Folders.ROOT_FOLDER_UUID);

    expect(listOrErr.isRight(), errToMsg(listOrErr.value)).toBeTruthy();
    expect(listOrErr.right.length).toBeGreaterThan(0);
  });

  test("should list nodes in 'Data Warehouse' folder", async () => {
    const listOrErr = await service.list(authCtx, "data-warehouse-uuid");

    expect(listOrErr.isRight(), errToMsg(listOrErr.value)).toBeTruthy();
    expect(listOrErr.right.length).toBe(5);
    expect(listOrErr.right.map((n) => n.title)).toEqual([
      "vetify_sales_dw-20240329.sql",
      "vetify_sales_dw-20240507.sql",
      "vetify_sales_dw-202409013.sql",
      "vetify_sales_dw-20241222.sql",
      "vetify_sales_dw-20250106.sql",
    ]);
  });

  test("should not list nodes in 'Data Warehouse' folder for anonymous user", async () => {
    const listOrErr = await service.list(anonymousCtx, "data-warehouse-uuid");

    expect(listOrErr.isLeft()).toBeTruthy();
    expect(listOrErr.value).toBeInstanceOf(ForbiddenError);
  });

  test("should list public nodes in 'Marca' folder for anonymous user", async () => {
    const listOrErr = await service.list(anonymousCtx, "marca-uuid");

    expect(listOrErr.isRight(), errToMsg(listOrErr.value)).toBeTruthy();
    expect(listOrErr.right.length).toBe(6);
  });

  test("should include system root folder when listing root folder", async () => {
    const listOrErr = await service.list(authCtx, Folders.ROOT_FOLDER_UUID);

    expect(listOrErr.isRight(), errToMsg(listOrErr.value)).toBeTruthy();
    expect(listOrErr.right.some((n) => n.uuid === Folders.SYSTEM_FOLDER_UUID))
      .toBeTruthy();
  });

  test("should list all system folders when listing system root folder", async () => {
    const listOrErr = await service.list(authCtx, Folders.SYSTEM_FOLDER_UUID);

    expect(listOrErr.isRight(), errToMsg(listOrErr.value)).toBeTruthy();
    expect(listOrErr.right.map((n) => n.uuid).sort()).toEqual(
      Folders.SYSTEM_FOLDERS_UUID.filter((uuid) =>
        uuid !== Folders.SYSTEM_FOLDER_UUID
      ).sort(),
    );
  });

  test("should not show nodes that the user cannot read", async () => {
    const listOrErr = await service.list(anonymousCtx, "vetify-logotipo-uuid");
    expect(listOrErr.isRight(), errToMsg(listOrErr.value)).toBeTruthy();
    expect(listOrErr.right.length).toBe(1);
  });
});

describe("NodeService.evaluate", () => {
  test("should return filtered nodes", async () => {
    const evaluationOrErr = await service.evaluate(
      authCtx,
      "posicao-financeira-2024-uuid",
    );

    expect(evaluationOrErr.isRight(), errToMsg(evaluationOrErr.value))
      .toBeTruthy();
    expect(evaluationOrErr.right.length).toBe(2);
    expect(evaluationOrErr.right.map((n) => n.title)).toEqual([
      "Posição Financeira - 2024-09-29.pdf",
      "Posição Financeira - 2024-12-08.pdf",
    ]);
  });

  test("should return error if node is not a smartfolder node", async () => {
    const evaluationOrErr = await service.evaluate(
      authCtx,
      "data-warehouse-uuid",
    );

    expect(evaluationOrErr.isLeft()).toBeTruthy();
    expect(evaluationOrErr.value).toBeInstanceOf(SmartFolderNodeNotFoundError);
  });
});

function errToMsg(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  return JSON.stringify(err, null, 2);
}

async function loadData(service: NodeService): Promise<void> {
  /*
The folder 'Contabilidade' is secret and only the 'accounting' group has 'Read' access to it.
Folder 'Marca' is public and everyone has 'Read' access to it, but only the 'admin' group
has 'Write' access.
Folder 'Posições Financeiras' is only accessible by the 'finance' group.
There's an Aspect named 'OPE' that is contained in all OPE files. It contais date, amount and
company fields.
There's an Aspect named 'Posição Financeira' that is contained in all Posição Financeira files.
It contais date and amount fields.
In the ROOT Folders theres one aditional SmartFolder names 'Posição Financeira 2024' that contains
all 'Posição Financeira' files from 2024.

├── Contabilidade [accounting][RWE,,]
│   ├── Balancete Vetify - Nov-2023.pdf
│   └── RELATÓRIO E CONTAS VETIFY,LDA 2022 (1).pdf
├── Data Warehouse
│   ├── vetify_sales_dw-20240329.sql
│   ├── vetify_sales_dw-20240507.sql
│   ├── vetify_sales_dw-202409013.sql
│   ├── vetify_sales_dw-20241222.sql
│   └── vetify_sales_dw-20250106.sql
├── Importação
│   ├── Alvará Comercial.pdf
│   ├── CCT-2024-10-09.pdf
│   ├── CRC.pdf
│   ├── Certidao138740CN2024.pdf
│   ├── Licença Higio - 2024.pdf
│   ├── NIF.pdf
│   ├── OPEs
│   │   ├── 2022-09-07 - OPE NOVAVET.pdf
│   │   ├── 2022-12-06 - OPE WEPHARM.pdf
│   │   ├── 2023-01-12 - OPE GEOFRETE.pdf
│   │   ├── 2023-03-01- OPE ROYAL CANIN.pdf
│   │   └── 2023-03-31 - OPE NOVAVET.pdf
│   ├── Pauta Aduaneira - 2019.pdf
│   ├── Pauta Aduaneira.pdf
│   ├── REI.pdf
│   └── Termo de Compromisso Operação Cambial de Mercadoria.pdf
├── Marca
│   ├── Background Zoom-1.jpg
│   ├── Background Zoom-1.xcf
│   ├── Background Zoom-2.jpg
│   ├── Background Zoom-2.xcf
│   ├── Carimbo - Vetify.png
│   ├── Carimbo - Vetify.svg
│   └── Vetify_Logotipo
│       └── PNG
│           ├── Icone
│           │   ├── vetify_icone_cor.png
│           │   └── vetify_icone_negativo.png
│           └── Logo
│               ├── vetify_logo_cor.png
│               └── vetify_logo_negativo.png
└── Posição Financeira [finance][RWE,,]
    ├── Posição Financeira - 2023-03-21.pdf
    ├── Posição Financeira - 2023-12-28.pdf
    ├── Posição Financeira - 2024-09-29.pdf
    ├── Posição Financeira - 2024-12-08.pdf
    ├── Posição Financeira - 2025-01-05.pdf
    └── Posição Financeira - 2025-02-01.pdf

  */

  // Create OPE aspect
  const opeAspect = await service.create(authCtx, {
    uuid: "ope",
    title: "OPE",
    mimetype: Nodes.ASPECT_MIMETYPE,
    properties: [
      { name: "date", title: "Date", type: "date", required: true },
      { name: "amount", title: "Amount", type: "number", required: true },
      { name: "company", title: "Company", type: "string", required: true },
    ] as AspectProperties,
  });

  // Create Posição Financeira aspect
  await service.create(authCtx, {
    uuid: "posicao-financeira",
    title: "Posição Financeira",
    mimetype: Nodes.ASPECT_MIMETYPE,
    properties: [
      { name: "date", title: "Date", type: "date", required: true },
      { name: "amount", title: "Amount", type: "number", required: true },
    ] as AspectProperties,
  });

  await service.create(authCtx, {
    uuid: "contabilidade-uuid",
    title: "Contabilidade",
    mimetype: Nodes.FOLDER_MIMETYPE,
    group: "accounting",
    permissions: {
      group: ["Read"],
      authenticated: [],
      anonymous: [],
      advanced: {},
    },
  });

  await service.create(authCtx, {
    title: "Balancete Vetify - Nov-2023.pdf",
    mimetype: "application/pdf",
    parent: "contabilidade-uuid",
  });

  await service.create(authCtx, {
    title: "RELATÓRIO E CONTAS VETIFY,LDA 2022 (1).pdf",
    mimetype: "application/pdf",
    parent: "contabilidade-uuid",
  });

  await service.create(authCtx, {
    uuid: "data-warehouse-uuid",
    title: "Data Warehouse",
    mimetype: Nodes.FOLDER_MIMETYPE,
  });

  await service.create(authCtx, {
    title: "vetify_sales_dw-20240329.sql",
    mimetype: "text/sql",
    parent: "data-warehouse-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_sales_dw-20240507.sql",
    mimetype: "text/sql",
    parent: "data-warehouse-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_sales_dw-202409013.sql",
    mimetype: "text/sql",
    parent: "data-warehouse-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_sales_dw-20241222.sql",
    mimetype: "text/sql",
    parent: "data-warehouse-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_sales_dw-20250106.sql",
    mimetype: "text/sql",
    parent: "data-warehouse-uuid",
  });

  await service.create(authCtx, {
    uuid: "importacao-uuid",
    title: "Importação",
    mimetype: Nodes.FOLDER_MIMETYPE,
  });

  await service.create(authCtx, {
    title: "Alvará Comercial.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "CCT-2024-10-09.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "CRC.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "Certidao138740CN2024.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "Licença Higio - 2024.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "NIF.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  const opeFolder = await service.create(authCtx, {
    uuid: "ope-uuid",
    title: "OPEs",
    mimetype: Nodes.FOLDER_MIMETYPE,
  });

  await service.create(authCtx, {
    title: "2022-09-07 - OPE NOVAVET.pdf",
    mimetype: "application/pdf",
    parent: opeFolder.right.uuid,
    aspects: ["ope"],
    properties: {
      "ope:date": "2022-09-07",
      "ope:amount": 1500,
      "ope:company": "NOVAVET",
    },
  });

  await service.create(authCtx, {
    title: "2022-12-06 - OPE WEPHARM.pdf",
    mimetype: "application/pdf",
    parent: opeFolder.right.uuid,
    aspects: ["ope"],
    properties: {
      "ope:date": "2022-12-06",
      "ope:amount": 2300,
      "ope:company": "WEPHARM",
      "ope:xpto": "xpto",
      "other:xxx": "xxx",
    },
  });

  await service.create(authCtx, {
    title: "2023-01-12 - OPE GEOFRETE.pdf",
    mimetype: "application/pdf",
    parent: opeFolder.right.uuid,
    aspects: ["ope"],
    properties: {
      "ope:date": "2023-01-12",
      "ope:amount": 3000,
      "ope:company": "GEOFRETE",
    },
  });

  await service.create(authCtx, {
    title: "2023-03-01- OPE ROYAL CANIN.pdf",
    mimetype: "application/pdf",
    parent: opeFolder.right.uuid,
    aspects: ["ope"],
    properties: {
      "ope:date": "2023-03-01",
      "ope:amount": 4500,
      "ope:company": "ROYAL CANIN",
    },
  });

  await service.create(authCtx, {
    title: "2023-03-31 - OPE NOVAVET.pdf",
    mimetype: "application/pdf",
    parent: opeFolder.right.uuid,
    aspects: ["ope"],
    properties: {
      "ope:date": "2023-03-31",
      "ope:amount": 5000,
      "ope:company": "NOVAVET",
    },
  });

  await service.create(authCtx, {
    title: "Pauta Aduaneira - 2019.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "Pauta Aduaneira.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  await service.create(authCtx, {
    title: "REI.pdf",
    mimetype: "application/pdf",
    parent: "importacao-uuid",
  });

  const marcaFolder = await service.create(authCtx, {
    uuid: "marca-uuid",
    title: "Marca",
    mimetype: Nodes.FOLDER_MIMETYPE,
    permissions: {
      group: [],
      authenticated: [],
      anonymous: ["Read"],
      advanced: { admin: ["Write"] },
    },
  });

  await service.create(authCtx, {
    title: "Background Zoom-1.jpg",
    mimetype: "image/jpeg",
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    title: "Background Zoom-1.xcf",
    mimetype: "image/x-xcf",
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    title: "Background Zoom-2.jpg",
    mimetype: "image/jpeg",
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    title: "Background Zoom-2.xcf",
    mimetype: "image/x-xcf",
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    title: "Carimbo - Vetify.png",
    mimetype: "image/png",
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    title: "Carimbo - Vetify.svg",
    mimetype: "image/svg+xml",
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    uuid: "vetify-logotipo-uuid",
    title: "Vetify_Logotipo",
    mimetype: Nodes.FOLDER_MIMETYPE,
    parent: marcaFolder.right.uuid,
  });

  await service.create(authCtx, {
    uuid: "png-uuid",
    title: "PNG",
    mimetype: Nodes.FOLDER_MIMETYPE,
    parent: "vetify-logotipo-uuid",
    permissions: {
      group: ["Read"],
      authenticated: ["Read"],
      anonymous: [],
      advanced: {},
    },
  });

  await service.create(authCtx, {
    title: "vetify_icone_cor.png",
    mimetype: "image/png",
    parent: "png-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_icone_negativo.png",
    mimetype: "image/png",
    parent: "png-uuid",
  });

  await service.create(authCtx, {
    uuid: "logo-uuid",
    title: "Logo",
    mimetype: Nodes.FOLDER_MIMETYPE,
    parent: "vetify-logotipo-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_logo_cor.png",
    mimetype: "image/png",
    parent: "logo-uuid",
  });

  await service.create(authCtx, {
    title: "vetify_logo_negativo.png",
    mimetype: "image/png",
    parent: "logo-uuid",
  });

  await service.create(authCtx, {
    uuid: "posicao-financeira-uuid",
    title: "Posições Financeiras",
    mimetype: Nodes.FOLDER_MIMETYPE,
    group: "finance",
    permissions: {
      group: ["Read"],
      authenticated: [],
      anonymous: [],
      advanced: {},
    },
  });

  (
    await service.create(authCtx, {
      title: "Posição Financeira - 2023-03-21.pdf",
      mimetype: "application/pdf",
      parent: "posicao-financeira-uuid",
      aspects: ["posicao-financeira"],
      properties: {
        "posicao-financeira:date": "2023-03-21",
        "posicao-financeira:amount": 1000,
      },
    })
  ).right;

  await service.create(authCtx, {
    title: "Posição Financeira - 2023-12-28.pdf",
    mimetype: "application/pdf",
    parent: "posicao-financeira-uuid",
    aspects: ["posicao-financeira"],
    properties: {
      "posicao-financeira:date": "2023-12-28",
      "posicao-financeira:amount": 2000,
    },
  });

  await service.create(authCtx, {
    title: "Posição Financeira - 2024-09-29.pdf",
    mimetype: "application/pdf",
    parent: "posicao-financeira-uuid",
    aspects: ["posicao-financeira"],
    properties: {
      "posicao-financeira:date": "2024-09-29",
      "posicao-financeira:amount": 3000,
    },
  });

  await service.create(authCtx, {
    title: "Posição Financeira - 2024-12-08.pdf",
    mimetype: "application/pdf",
    parent: "posicao-financeira-uuid",
    aspects: ["posicao-financeira"],
    properties: {
      "posicao-financeira:date": "2024-12-08",
      "posicao-financeira:amount": 4000,
    },
  });

  await service.create(authCtx, {
    title: "Posição Financeira - 2025-01-05.pdf",
    mimetype: "application/pdf",
    parent: "posicao-financeira-uuid",
    aspects: ["posicao-financeira"],
    properties: {
      "posicao-financeira:date": "2025-01-05",
      "posicao-financeira:amount": 5000,
    },
  });

  await service.create(authCtx, {
    title: "Posição Financeira - 2025-02-01.pdf",
    mimetype: "application/pdf",
    parent: "posicao-financeira-uuid",
    aspects: ["posicao-financeira"],
    properties: {
      "posicao-financeira:date": "2025-02-01",
      "posicao-financeira:amount": 6000,
    },
  });

  // Create smart folder
  await service.create(authCtx, {
    uuid: "posicao-financeira-2024-uuid",
    title: "Posição Financeira 2024",
    mimetype: Nodes.SMART_FOLDER_MIMETYPE,
    filters: [
      ["aspects", "contains", "posicao-financeira"],
      ["properties.posicao-financeira:date", ">=", "2024-01-01"],
      ["properties.posicao-financeira:date", "<", "2025-01-01"],
    ],
  });
}
