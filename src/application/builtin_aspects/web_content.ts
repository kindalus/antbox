import { Aspect } from "../../domain/aspects/aspect.ts";

export interface WebContent {
  uuid: string;
  fid: string;
  title: string;
  published: boolean;
  pt: string;
  en?: string;
  es?: string;
  fr?: string;
}

export const WebContentAspect = {
  uuid: "web-content",
  title: "Conteúdo Web",
  builtIn: true,
  description: "Representa um conteúdo Web",
  filters: [["mimetype", "==", "application/json"]],
  properties: [
    {
      name: "published",
      title: "Publicado",
      type: "boolean",
      required: true,
      default: false,
    },
  ],
} as Aspect;
