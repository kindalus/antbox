/**
 * Example Feature Template
 *
 * This is a template for creating a new feature in Antbox.
 * Features can be exposed as actions, extensions, or AI tools.
 */

export default async function (context, params) {
	const { nodeService } = context;

	// Your feature logic here
	console.log("Feature executed with params:", params);

	// Example: Find nodes by filter
	const nodes = await nodeService.find(
		context.auth,
		[["mimetype", "==", "application/pdf"]],
		10,
	);

	return {
		success: true,
		message: "Feature executed successfully",
		nodesFound: nodes.length,
	};
}
