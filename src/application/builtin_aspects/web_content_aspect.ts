import { type AspectDTO } from "domain/aspects/aspect.ts";

export const WebContentAspect = {
  uuid: "web-content",
  title: "Conteúdo Web",
  builtIn: true,
  description: "Representa um conteúdo Web",
  filters: [["mimetype", "==", "text/html"]],
  properties: [
    {
      name: "published",
      title: "Publicado",
      type: "boolean",
      required: true,
      default: true,
    },
  ],
} as AspectDTO;
