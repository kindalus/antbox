/**
 * Factura Date Prefix Action
 *
 * This action automatically adds the submission date in yyyy-mm-dd format
 * to the beginning of PDF document titles that match "factura".
 *
 * Features:
 * - Runs manually and automatically on node creation
 * - Only processes application/pdf files with "factura" in the title
 * - Restricted to "accounts" group members
 * - Adds date prefix only if not already present
 */

export default {
  uuid: "factura-date-prefix-action",
  name: "factura-date-prefix",
  description:
    "Automatically adds submission date (yyyy-mm-dd) to the beginning of PDF document titles containing 'factura'. Runs manually and on document creation.",

  exposeAction: true,
  runOnCreates: true,
  runOnUpdates: false,
  runManually: true,
  filters: [
    ["mimetype", "==", "application/pdf"],
    ["title", "contains", "factura"],
  ],

  exposeExtension: false,
  exposeAITool: false,

  groupsAllowed: ["accounts"],

  parameters: [
    {
      name: "uuids",
      type: "array",
      arrayType: "string",
      required: true,
      description: "Array of node UUIDs to process",
    },
  ],

  returnType: "object",
  returnDescription:
    "Processing results including successful updates, skipped items, and any errors encountered",

  /**
   * Main execution function for the factura date prefix action
   * @param {Object} ctx - The run context containing authentication and services
   * @param {Object} args - Arguments including node UUIDs
   */
  async run(ctx, args) {
    const { nodeService, authenticationContext } = ctx;
    const { uuids } = args;

    /**
     * Generate current date in yyyy-mm-dd format
     * @returns {string} Date string in ISO format (yyyy-mm-dd)
     */
    function getCurrentDate() {
      return new Date().toISOString().split("T")[0];
    }

    /**
     * Check if title already has a date prefix
     * @param {string} title - The node title to check
     * @returns {boolean} True if title starts with yyyy-mm-dd pattern
     */
    function hasDatePrefix(title) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}\s/;
      return dateRegex.test(title);
    }

    /**
     * Check if node matches our criteria (PDF + contains "factura")
     * @param {Object} node - The node to validate
     * @returns {boolean} True if node should be processed
     */
    function shouldProcessNode(node) {
      return (
        node.mimetype === "application/pdf" &&
        node.title.toLowerCase().includes("factura")
      );
    }

    const currentDate = getCurrentDate();

    // Process each node UUID provided
    for (const nodeUuid of uuids || []) {
      // Fetch the node
      const nodeOrErr = await nodeService.get(authenticationContext, nodeUuid);

      if (nodeOrErr.isLeft()) {
        continue; // Skip nodes we can't access
      }

      const node = nodeOrErr.value;

      // Check if node meets our criteria and doesn't already have date prefix
      if (!shouldProcessNode(node) || hasDatePrefix(node.title)) {
        continue; // Skip nodes that don't match criteria or already have prefix
      }

      // Add date prefix to title and update the node
      const newTitle = `${currentDate} ${node.title}`;
      await nodeService.update(authenticationContext, nodeUuid, {
        title: newTitle,
      });
    }
  },
};
