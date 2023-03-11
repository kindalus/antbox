import { AuthService } from "../auth_service.ts";
import { Aspect } from "/domain/aspects/aspect.ts";

export const UserAspect = {
  uuid: "user",
  title: "Utilizador",
  builtIn: true,
  description: "Representa um utilizador",
  filters: [
    ["mimetype", "==", "application/vnd.antbox.metanode"],
    ["parent", "==", [AuthService.USERS_FOLDER_UUID]],
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
      validationFilters: [["aspects", "==", ["group"]]],
    },
    {
      name: "groups",
      title: "Grupos Complementares",
      type: "UUID[]",
      required: false,
      validationFilters: [["aspects", "contains", ["group"]]],
    },
  ],
} as Aspect;
