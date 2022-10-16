import { NodeFilter } from "/domain/nodes/node_filter.ts";
import { AspectService } from "/application/aspect_service.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { NodeService } from "../../application/node_service.ts";

/**
 * Regras das actions:
 * - para poder executar runOnCreate ou runOnUpdate
 * --- especificar aspect ou mimetype constraints
 * --- não pode especificar parametros
 *
 * - para ser executar como trigger das folders
 * --- tem que especificar o mimetype 'application/folder'
 * --- a folder tem que conter um dos aspectos especificados na mimetype constraints
 *
 * - para poder executar na interface gráfica, recomenda-se:
 * --- não pode especificar parametros
 * --- deve ter runManually = true
 * --- o nó deve especificar um mimetype e um dos aspectos
 *     especificados na mimetype e aspect constraints
 *
 * - se não for especificado, pode correr manualmente
 */
export interface Action {
  uuid: string;
  title: string;
  description: string;
  builtIn: boolean;
  multiple: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  params: string[];

  filters: NodeFilter[];

  run: (
    ctx: RunContext,
    uuids: string[],
    params?: Record<string, string>
  ) => Promise<void | Error>;
}

export interface RunContext {
  readonly principal: UserPrincipal;
  readonly nodeService: NodeService;
  readonly aspectService: AspectService;
}
