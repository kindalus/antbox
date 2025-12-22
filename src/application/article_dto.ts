import type { ArticleNode, ArticleProperties, LocaleMap } from "domain/articles/article_node.ts";

export interface RawArticleDTO {
	uuid: string;
	title: string;
	description?: string;
	articleTitle: LocaleMap;
	articleFid: LocaleMap;
	articleResume: LocaleMap;
	articleBody: LocaleMap;
	articleAuthor: string;
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
}

export interface LocalizedArticleDTO {
	uuid: string;
	title: string;
	description?: string;
	articleTitle: string;
	articleFid: string;
	articleResume: string;
	articleBody: string;
	articleAuthor: string;
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
}

export function toRawArticleDTO(node: ArticleNode): RawArticleDTO {
	const props = node.articleProperties;
	return {
		uuid: node.uuid,
		title: node.title,
		description: node.description,
		articleTitle: props.articleTitle,
		articleFid: props.articleFid,
		articleResume: props.articleResume,
		articleBody: props.articleBody,
		articleAuthor: props.articleAuthor,
		parent: node.parent,
		createdTime: node.createdTime,
		modifiedTime: node.modifiedTime,
		owner: node.owner,
	};
}

export function toLocalizedArticleDTO(
	node: ArticleNode,
	locale: string,
): LocalizedArticleDTO {
	const props = node.articleProperties;
	return {
		uuid: node.uuid,
		title: node.title,
		description: node.description,
		articleTitle: selectLocalizedString(props.articleTitle, locale),
		articleFid: selectLocalizedString(props.articleFid, locale),
		articleResume: selectLocalizedString(props.articleResume, locale),
		articleBody: selectLocalizedString(props.articleBody, locale),
		articleAuthor: props.articleAuthor,
		parent: node.parent,
		createdTime: node.createdTime,
		modifiedTime: node.modifiedTime,
		owner: node.owner,
	};
}

export function selectLocalizedString(localeMap: LocaleMap, locale: string): string {
	if (localeMap[locale]) {
		return localeMap[locale];
	}

	if (localeMap["pt"]) {
		return localeMap["pt"];
	}

	if (localeMap["en"]) {
		return localeMap["en"];
	}

	const firstKey = Object.keys(localeMap)[0];
	if (firstKey) {
		return localeMap[firstKey];
	}

	return "";
}
