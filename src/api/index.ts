import EcmRegistry, { EcmConfig } from "../ecm/ecm_registry.js";
import server from "./server.js";

const configureServer = (ecmConfig: EcmConfig) => EcmRegistry.buildIfNone(ecmConfig);

export { server, configureServer };
