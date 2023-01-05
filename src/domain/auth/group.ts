export class Group {
  static ADMIN_GROUP: Group = Object.assign({
    uuid: "--admins--",
    title: "Admins",
    description: "Admins",
  });

  uuid: string = null as unknown as string;
  title: string = null as unknown as string;
  description: string = null as unknown as string;
}
