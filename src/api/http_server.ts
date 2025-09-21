export interface HttpServerOpts {
  port?: number;
}

export type startHttpServer = (opts: HttpServerOpts) => Promise<unknown>;
