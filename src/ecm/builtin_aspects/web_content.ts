export interface WebContent {
  pt: string;
  en?: string;
  es?: string;
  fr?: string;
}

export default {
  uuid: "web-content",
  title: "Conteúdo Web",
  builtIn: true,
  description: "Representa um conteúdo Web",
  mimetypeConstraints: ["application/json"],
  properties: [],
};
