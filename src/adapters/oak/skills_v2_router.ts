import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceSkillHandler,
	deleteSkillHandler,
	exportSkillHandler,
	getSkillHandler,
	listSkillMetadataHandler,
	listSkillResourcesHandler,
	listSkillsHandler,
	loadSkillHandler,
} from "api/agents_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the skills router for the Oak HTTP adapter.
 *
 * Agent Skills are modular capabilities that extend AI Agent's functionality.
 * Each Skill packages instructions, metadata, and optional resources that
 * AI Agent uses automatically when relevant.
 *
 * The skill uuid is the same as the skill name (kebab-case).
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = skillsRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/skills" });

	// CRUD operations
	router.post("/-/upload", adapt(createOrReplaceSkillHandler(tenants)));
	router.get("/", adapt(listSkillsHandler(tenants)));
	router.get("/:uuid", adapt(getSkillHandler(tenants)));
	router.delete("/:uuid", adapt(deleteSkillHandler(tenants)));
	router.get("/:uuid/-/export", adapt(exportSkillHandler(tenants)));

	// Metadata operations (Level 1)
	router.get("/-/metadata", adapt(listSkillMetadataHandler(tenants)));

	// Skill loading operations (Level 2 + Level 3)
	// Note: uuid is the skill name in kebab-case
	router.get("/:uuid/-/load", adapt(loadSkillHandler(tenants)));
	router.get("/:uuid/-/resources", adapt(listSkillResourcesHandler(tenants)));

	return router;
}
