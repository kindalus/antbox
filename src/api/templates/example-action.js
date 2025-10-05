/**
 * Example Action Template (JavaScript)
 *
 * This template shows how to create an action using plain JavaScript.
 */

export default async function (context, params) {
	const { nodeService } = context;

	// Process nodes passed to the action
	const results = [];

	for (const nodeUuid of params.uuids || []) {
		const nodeOrErr = await nodeService.get(context.auth, nodeUuid);

		if (nodeOrErr.isRight()) {
			results.push({
				uuid: nodeUuid,
				processed: true,
				title: nodeOrErr.value.title,
			});
		}
	}

	return {
		action: "example-action",
		processed: results.length,
		results: results,
	};
}
