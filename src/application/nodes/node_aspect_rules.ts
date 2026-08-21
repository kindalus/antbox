import { Aspects } from "domain/aspects/aspects.ts";
import type { AspectData, AspectProperty } from "domain/configuration/aspect_data.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { AspectableNode, NodeLike } from "domain/node_like.ts";
import type { NodeFilter, NodeFilters2D } from "domain/nodes/node_filter.ts";
import { isNodeFilters2D } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeProperties } from "domain/nodes/node_properties.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import { left, right } from "shared/either.ts";
import { Logger } from "shared/logger.ts";
import { type Specification, specificationFn } from "shared/specification.ts";
import { ValidationError } from "shared/validation_error.ts";

type GetNode = (uuid: string) => Promise<Either<NodeNotFoundError, NodeLike>>;

export class NodeAspectRules {
	constructor(
		private readonly configRepo: ConfigurationRepository,
		private readonly getNode: GetNode,
	) {}

	async validateAndUpdate(node: NodeLike): Promise<Either<ValidationError, void>> {
		if (!Nodes.hasAspects(node)) {
			return right(undefined);
		}

		const aspectsOrErr = await this.#getAspects(node);
		if (aspectsOrErr.isLeft()) {
			return left(aspectsOrErr.value);
		}

		const aspects = aspectsOrErr.value;
		if (!aspects.length) {
			node.update({ aspects: [], properties: {} });
			return right(undefined);
		}

		const currentProperties = node.metadata.properties as NodeProperties;
		const acceptedProperties = {} as NodeProperties;
		const validators = aspects.map(Aspects.specificationFrom);

		for (const aspect of aspects) {
			for (const property of aspect.properties) {
				this.#addProperty(
					acceptedProperties,
					currentProperties,
					property,
					`${aspect.uuid}:${property.name}`,
				);
			}

			const uuidProperties = aspect.properties.filter((property) =>
				property.type === "uuid" || property.arrayType === "uuid"
			);
			const uuidValidators = uuidProperties.map((property) => {
				const value = (acceptedProperties[`${aspect.uuid}:${property.name}`] ??
					property.defaultValue) as string | string[] | undefined;
				return this.#validateUUIDProperty(property, value);
			});
			validators.push(...(await Promise.all(uuidValidators)));
		}

		node.update({ properties: acceptedProperties });
		const errors = validators
			.map((validator) => validator.isSatisfiedBy(node))
			.filter((result) => result.isLeft())
			.flatMap((result) => result.value.errors);

		return errors.length ? left(ValidationError.from(...errors)) : right(undefined);
	}

	async filterReadonly(
		node: NodeLike,
		metadata: Partial<NodeMetadata>,
	): Promise<Partial<NodeMetadata>> {
		if (!metadata.properties || !Nodes.hasAspects(node)) {
			return metadata;
		}

		const aspectsOrErr = await this.#getAspects(node);
		if (aspectsOrErr.isLeft()) {
			return metadata;
		}

		const readonlyProperties = new Set(
			aspectsOrErr.value.flatMap((aspect) =>
				this.#propertiesWithQualifiedNames(aspect)
					.filter((property) => property.readonly)
					.map((property) => property.name)
			),
		);
		const currentProperties = (node as AspectableNode).properties || {};
		const safeProperties = Object.fromEntries(
			Object.entries(metadata.properties).map(([key, value]) => [
				key,
				readonlyProperties.has(key) ? currentProperties[key] : value,
			]),
		);

		return { ...metadata, properties: safeProperties };
	}

	async searchableValues(node: NodeLike): Promise<string[]> {
		if (!Nodes.hasAspects(node)) {
			return [];
		}

		const aspectsOrErr = await this.#getAspects(node);
		if (aspectsOrErr.isLeft()) {
			return [];
		}

		return aspectsOrErr.value
			.flatMap((aspect) => this.#propertiesWithQualifiedNames(aspect))
			.filter((property) => property.searchable)
			.map((property) => node.properties[property.name] as string);
	}

	async #getAspects(node: AspectableNode): Promise<Either<ValidationError, AspectData[]>> {
		if (!node.aspects?.length) {
			return right([]);
		}

		const results = await Promise.all(
			node.aspects.map((uuid) => this.configRepo.get("aspects", uuid)),
		);
		const missing = results
			.map((result, index) => result.isLeft() ? node.aspects![index] : undefined)
			.filter((uuid): uuid is string => uuid !== undefined);

		if (missing.length) {
			return left(new ValidationError(`Aspect(s) not found: ${missing.join(", ")}`, []));
		}

		return right(results.map((result) => result.right));
	}

	async #validateUUIDProperty(
		property: AspectProperty,
		values: string | string[] | undefined,
	): Promise<Specification<NodeLike>> {
		if (property.type !== "uuid" && property.arrayType !== "uuid") {
			Logger.warn(
				`Property ${property.name} is not of type 'uuid' or 'array of uuid'. Skipping UUID validation.`,
			);
			return specificationFn(() => right(true));
		}

		if (!values?.length) {
			return specificationFn(() => right(true));
		}

		const nodesOrErrs = await Promise.all(
			(Array.isArray(values) ? values : [values]).map((uuid) => this.getNode(uuid)),
		);
		const missing = nodesOrErrs.filter((result) => result.isLeft());
		if (missing.length) {
			const errors = missing.map((result) => result.value as AntboxError);
			return specificationFn(() => left(ValidationError.from(...errors)));
		}

		if (property.validationFilters?.length) {
			let filters: NodeFilters2D = isNodeFilters2D(property.validationFilters)
				? property.validationFilters
				: [property.validationFilters];
			// Dynamic @ filters require repository resolution and cannot be checked directly.
			filters = filters.map((group) =>
				group.filter((filter: NodeFilter) => !filter[0].startsWith("@"))
			) as NodeFilters2D;

			const specification = NodesFilters.nodeSpecificationFrom(filters);
			const errors = nodesOrErrs
				.map((result) => specification.isSatisfiedBy(result.right))
				.filter((result) => result.isLeft())
				.flatMap((result) => (result.value as ValidationError).errors);
			if (errors.length) {
				return specificationFn(() => left(ValidationError.from(...errors)));
			}
		}

		return specificationFn(() => right(true));
	}

	#addProperty(
		accepted: NodeProperties,
		current: NodeProperties,
		property: AspectProperty,
		key: string,
	): void {
		const value = current[key] ?? property.defaultValue;
		if (value !== undefined) {
			accepted[key] = value;
		}
	}

	#propertiesWithQualifiedNames(aspect: AspectData): AspectProperty[] {
		return aspect.properties.map((property) => ({
			...property,
			name: `${aspect.uuid}:${property.name}`,
		}));
	}
}
