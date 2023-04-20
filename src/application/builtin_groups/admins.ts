import { Group } from "../../domain/auth/group.ts";

export const Admins: Group = Object.assign(new Group(), {
  uuid: Group.ADMINS_GROUP_UUID,
  fid: Group.ADMINS_GROUP_UUID,
  title: "Admins",
  description: "Admins",
  builtIn: true,
});
