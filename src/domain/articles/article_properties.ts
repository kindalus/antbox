export interface ArticleProperties {
	articleTitle: string;
	articleFid: string;
	articleResume: string;
	articleBody: string;
}

export type ArticlePropertiesMap = Record<string, ArticleProperties>;
