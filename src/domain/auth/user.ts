import { Group } from "./group.ts";

export class User {
  static ROOT_USER: User = Object.assign(new User(), {
    uuid: "--root--",
    email: "root@antbox.io",
    fullname: "root",
    group: "--admins--",
    groups: ["--admins--"],
  });

  static ANONYMOUS_USER: User = Object.assign(new User(), {
    uuid: "--anonymous--",
    email: "anonymous@antbox.io",
  });

  static isAdmin(user: User): boolean {
    return user.groups.includes(Group.ADMIN_GROUP.uuid);
  }

  static isAnonymous(user: User): boolean {
    return user.uuid === User.ANONYMOUS_USER.uuid;
  }

  uuid: string = null as unknown as string;
  email: string = null as unknown as string;
  fullname: string = null as unknown as string;
  group: string = null as unknown as string;
  groups: string[] = [];

  isAdmin(): boolean {
    return User.isAdmin(this);
  }

  isAnonymous(): boolean {
    return User.isAnonymous(this);
  }
}
