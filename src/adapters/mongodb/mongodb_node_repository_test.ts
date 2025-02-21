import { MongoClient } from "../../../deps.ts";
import { test, expect } from "bun:test";
import { Node } from "../../domain/nodes/node.ts";
import buildMongodbNodeRepository, {
  MongodbNodeRepository,
  toObjectId,
} from "./mongodb_node_repository.ts";

const url =
  "mongodb+srv://user:passwd@project.y8lbc.gcp.mongodb.net/?retryWrites=true&w=majority";
const dbName = "main";
const collectionName = "nodes";

test("MongodbNodeRepository", async (t) => {
  const { client, collection: col } = await setup();

  const repoOrErr = await buildMongodbNodeRepository(url, dbName);
  if (repoOrErr.isLeft()) {
    fail(repoOrErr.value.message);
  }

  const repo = repoOrErr.value as MongodbNodeRepository;

  await t.step("add", async () => {
    const node: Node = {
      uuid: "Mz5d93zJ",
      title: "Conteúdos de teste",
      #fid: "conteudos_de_teste",
      #mimetype: "application/folder",
      #parent: "--root--",
    } as Node;

    const result = await repo.add(node);

    const doc = await col.findOne({ ...toObjectId("Mz5d93zJ") });

    expect(result.isRight()).toBeTruthy();
    expect(doc).not.toBeNull();
  });

  await client.close();
  await repo.close();
});

async function setup() {
  const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  const collection = db.collection(collectionName);
  await collection.deleteMany({});

  await collection.insertMany(testData);

  return { client, collection };
}

const testData = [
  {
    ...toObjectId("Mopd93zJ"),
    uuid: "Mopd93zJ",
    title: "Conteúdos de Páginas",
    fid: "conteudos_de_paginas",
    mimetype: "application/folder",
    parent: "--root--",
    size: 0,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("wTJOG3oQ"),
    uuid: "wTJOG3oQ",
    title: "Imagens",
    fid: "imagens",
    mimetype: "application/folder",
    parent: "--root--",
    size: 0,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("dsa781Lx"),
    uuid: "dsa781Lx",
    fid: "sobre_nos__titulo_1",
    title: "sobre_nos__titulo_1",
    mimetype: "application/json",
    aspects: ["web-content"],
    parent: "Mopd93zJ",
    size: 41,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("LL04wwrL"),
    uuid: "LL04wwrL",
    fid: "sobre_nos__subtitulo_1",
    title: "sobre_nos__subtitulo_1",
    mimetype: "application/json",
    aspects: ["web-content"],
    parent: "Mopd93zJ",
    size: 145,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("XuGJ35yK"),
    uuid: "XuGJ35yK",
    fid: "sobre_nos__texto_1",
    title: "sobre_nos__texto_1",
    mimetype: "application/json",
    aspects: ["web-content"],
    parent: "Mopd93zJ",
    size: 2658,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2022-02-16T10:28:17.703Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("0BOoqemk"),
    uuid: "0BOoqemk",
    fid: "home_banner__imagem_1.jpg",
    title: "home_banner__imagem_1.jpg",
    mimetype: "image/jpg",
    parent: "wTJOG3oQ",
    size: 583481,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("3JJC86bQ"),
    uuid: "3JJC86bQ",
    fid: "sobre_nos__imagem_1.jpg",
    title: "Sobre nós - Imagem 1",
    mimetype: "image/jpg",
    parent: "wTJOG3oQ",
    size: 605067,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("Pbwk44Yn"),
    uuid: "Pbwk44Yn",
    fid: "sobre_nos__imagem_2.jpg",
    title: "Sobre nós - Imagem 2",
    mimetype: "image/jpg",
    parent: "wTJOG3oQ",
    size: 678272,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("8bw06jvh"),
    uuid: "8bw06jvh",
    fid: "sobre_nos__imagem_3.jpg",
    title: "Sobre nós - Imagem 3",
    mimetype: "image/jpg",
    parent: "wTJOG3oQ",
    size: 748566,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("MCDsb2UC"),
    uuid: "MCDsb2UC",
    fid: "sobre_nos__imagem_4.jpg",
    title: "Sobre nós - Imagem 4",
    mimetype: "image/jpg",
    parent: "wTJOG3oQ",
    size: 748566,
    createTime: "2021-10-17T20:01:00Z",
    modifiedTime: "2021-10-17T20:01:00Z",
    owner: "root@antbox.io",
  },
  {
    ...toObjectId("uqMEuCKI"),
    uuid: "uqMEuCKI",
    fid: "advogados",
    title: "Advogados",
    parent: "--root--",
    mimetype: "application/folder",
    owner: "root@antbox.io",
    size: 0,
    createdTime: "2021-11-24T14:56:50.474Z",
    modifiedTime: "2021-11-24T14:56:50.474Z",
    onCreate: [],
    onUpdate: [],
  },
  {
    ...toObjectId("00rb6j5L"),
    uuid: "00rb6j5L",
    fid: "home__titulo_1",
    title: "home__titulo_1",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 248,
    createdTime: "2021-11-29T11:42:37.008Z",
    modifiedTime: "2022-08-01T09:10:20.037Z",
    properties: {},
    aspects: ["web-content"],
  },
  {
    ...toObjectId("Tkprochv"),
    uuid: "Tkprochv",
    fid: "servicos__titulo_1",
    title: "servicos__titulo_1",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 22,
    createdTime: "2021-11-30T14:48:26.393Z",
    modifiedTime: "2021-11-30T14:48:26.393Z",
    aspects: ["web-content"],
  },
  {
    ...toObjectId("dxJYC0sT"),
    uuid: "dxJYC0sT",
    fid: "servicos__subtitulo_1",
    title: "servicos__subtitulo_1",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 236,
    createdTime: "2021-11-30T14:49:11.754Z",
    modifiedTime: "2021-12-01T23:36:04.480Z",
    aspects: ["web-content"],
  },
  {
    ...toObjectId("pi3HGYoN"),
    uuid: "pi3HGYoN",
    fid: "servicos__texto_1",
    title: "servicos__texto_1",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 1849,
    createdTime: "2021-11-30T14:50:05.995Z",
    modifiedTime: "2022-07-19T09:42:41.246Z",
    aspects: ["web-content"],
  },
  {
    ...toObjectId("7AAjB2X8"),
    uuid: "7AAjB2X8",
    fid: "servicos__imagem_1",
    title: "Serviços - Imagem 1",
    parent: "wTJOG3oQ",
    mimetype: "image/jpeg",
    owner: "root@antbox.io",
    size: 601375,
    createdTime: "2021-11-30T14:55:22.663Z",
    modifiedTime: "2021-11-30T14:55:22.663Z",
  },
  {
    ...toObjectId("PeLBzTPm"),
    uuid: "PeLBzTPm",
    fid: "servicos__imagem_2",
    title: "Serviços - Imagem 2",
    parent: "wTJOG3oQ",
    mimetype: "image/jpeg",
    owner: "root@antbox.io",
    size: 569605,
    createdTime: "2021-11-30T14:56:18.614Z",
    modifiedTime: "2021-11-30T14:56:18.614Z",
  },
  {
    ...toObjectId("vQx4Ry0q"),
    uuid: "vQx4Ry0q",
    fid: "home__texto_1",
    title: "home__texto_1",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 841,
    createdTime: "2021-12-01T11:05:35.587Z",
    modifiedTime: "2022-07-19T07:38:59.321Z",
    aspects: ["web-content"],
  },
  {
    ...toObjectId("Z75ZYON8"),
    uuid: "Z75ZYON8",
    fid: "home__texto_media",
    title: "home__texto_media",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 414,
    createdTime: "2021-12-01T11:08:55.789Z",
    modifiedTime: "2021-12-01T11:11:49.396Z",
    aspects: ["web-content"],
  },
  {
    ...toObjectId("642tVc2i"),
    uuid: "642tVc2i",
    fid: "servicos__titulo_2",
    title: "servicos__titulo_2",
    parent: "Mopd93zJ",
    mimetype: "application/json",
    owner: "root@antbox.io",
    size: 110,
    createdTime: "2021-12-01T11:26:31.522Z",
    modifiedTime: "2021-12-01T14:02:58.780Z",
    aspects: ["web-content"],
  },
];
