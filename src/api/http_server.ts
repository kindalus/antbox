const SYMMETRIC_KEY = "ui2tPcQZvN+IxXsEW6KQOOFROS6zXB1pZdotBR3Ot8o=";
const ROOT_PASSWD = "demo";
const PORT = 7180;

export interface HttpServerOpts {
  port?: number;
}

export type startHttpServer = (opts: HttpServerOpts) => Promise<unknown>;
