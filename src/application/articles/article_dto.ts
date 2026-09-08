import type { ArticleNode } from "domain/articles/article_node.ts";
import type {
	ArticleBodyContentType,
	ArticleProperties,
	ArticlePropertiesMap,
} from "domain/articles/article_properties.ts";
import type { NodeProperties } from "domain/nodes/node_properties.ts";

export interface RawArticleDTO {
	uuid: string;
	title: string;
	description?: string;
	articleProperties: ArticlePropertiesMap;
	articleAuthor: string;
	articleBodyContentType: ArticleBodyContentType;
	aspects: string[];
	properties: NodeProperties;
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
	articleBodyContentType: ArticleBodyContentType;
	aspects: string[];
	properties: NodeProperties;
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
}

export function toRawArticleDTO(node: ArticleNode): RawArticleDTO {
	return {
		uuid: node.uuid,
		title: node.title,
		description: node.description,
		articleProperties: node.articleProperties,
		articleAuthor: node.articleAuthor,
		articleBodyContentType: node.articleBodyContentType,
		aspects: node.aspects,
		properties: node.properties,
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
	const localizedProps = node.articleProperties;
	const props = selectLocalizedProperties(localizedProps, locale);

	return {
		uuid: node.uuid,
		title: node.title,
		description: node.description,
		articleTitle: props.articleTitle,
		articleFid: props.articleFid,
		articleResume: props.articleResume,
		articleBody: props.articleBody,
		articleAuthor: node.articleAuthor,
		articleBodyContentType: node.articleBodyContentType,
		aspects: node.aspects,
		properties: node.properties,
		parent: node.parent,
		createdTime: node.createdTime,
		modifiedTime: node.modifiedTime,
		owner: node.owner,
	};
}

export function selectLocalizedProperties(
	localeMap: ArticlePropertiesMap,
	locale: string,
): ArticleProperties {
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

	return {
		articleTitle: "",
		articleFid: "",
		articleResume: "",
		articleBody: "",
	};
}
