export class Group {
  static ADMIN_GROUP: Group = Object.assign({
    uuid: "--admins--",
    title: "Admins",
    description: "Admins",
  });

  constructor() {
    this.uuid = null as unknown as string;
    this.title = null as unknown as string;
    this.description = null as unknown as string;
  }

  uuid: string;
  title: string;
  description: string;
}
