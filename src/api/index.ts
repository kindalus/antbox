import EcmRegistry, { EcmConfig } from "../ecm/ecm_registry";
import server from "./server";

const configureServer = (ecmConfig: EcmConfig) => EcmRegistry.buildIfNone(ecmConfig);

export { server, configureServer };
