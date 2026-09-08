export const ARTICLE_BODY_CONTENT_TYPES = ["markdown", "html", "text"] as const;

export type ArticleBodyContentType = typeof ARTICLE_BODY_CONTENT_TYPES[number];

export interface ArticleProperties {
	articleTitle: string;
	articleFid: string;
	articleResume: string;
	articleBody: string;
}

export type ArticlePropertiesMap = Record<string, ArticleProperties>;
