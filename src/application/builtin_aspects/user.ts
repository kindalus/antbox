import { Aspect } from "../../domain/aspects/aspect.ts";
import { Node } from "../../domain/nodes/node.ts";

export const UserAspect = {
  uuid: "user",
  title: "Utilizador",
  builtIn: true,
  description: "Representa um utilizador",
  filters: [
    ["mimetype", "==", "application/vnd.antbox.metanode"],
    ["parent", "==", [Node.USERS_FOLDER_UUID]],
  ],
  properties: [
    {
      name: "email",
      title: "email",
      type: "String",
      required: true,
    },
    {
      name: "group",
      title: "Grupo Principal",
      type: "UUID",
      required: true,
      validationFilters: [["aspects", "contains", "group"]],
    },
    {
      name: "groups",
      title: "Grupos Complementares",
      type: "UUID[]",
      required: false,
      validationFilters: [["aspects", "contains", "group"]],
    },
  ],
} as Aspect;
