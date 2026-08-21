import { describe, it } from "bdd";
import { expect } from "expect";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { LoadedSkill } from "./skills_loader.ts";
import { SessionWorkspaceStore } from "./session_workspace.ts";
import { join } from "node:path";

const agent: AgentData = {
	uuid: "test-agent",
	name: "Test agent",
	exposedToUsers: true,
	model: ["google/gemini-flash-latest", "medium"],
	tools: ["find_nodes"],
	skills: ["test-skill"],
	systemPrompt: "Test prompt",
	createdTime: "2026-01-01T00:00:00.000Z",
	modifiedTime: "2026-01-01T00:00:00.000Z",
};

async function createSkill(root: string): Promise<LoadedSkill> {
	const skillDir = join(root, "test-skill");
	await Deno.mkdir(join(skillDir, "references"), { recursive: true });
	const skillFile = join(skillDir, "SKILL.md");
	await Deno.writeTextFile(
		skillFile,
		"---\nname: test-skill\ndescription: Test skill\n---\nInstructions",
	);
	await Deno.writeTextFile(join(skillDir, "references", "note.md"), "Reference");
	return {
		frontmatter: { name: "test-skill", description: "Test skill" },
		skillDir,
		skillFile,
	};
}

describe("SessionWorkspaceStore", () => {
	it("persists an isolated session snapshot and reopens it for its owner", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-session-workspace-test-" });
		try {
			const skill = await createSkill(join(root, "source"));
			const store = new SessionWorkspaceStore(join(root, "sessions"), () => 1000);
			const workspace = await store.create({
				tenant: "tenant-a",
				userEmail: "user@example.com",
				agentData: agent,
				toolNames: ["load_skill", "find_nodes"],
				featureVersions: [{ uuid: "feature-a", modifiedTime: "v1" }],
				skills: [skill],
			});

			const reopened = await store.open(workspace.manifest.sessionId, {
				tenant: "tenant-a",
				userEmail: "user@example.com",
				agentUuid: agent.uuid,
			});
			expect(reopened.manifest.agentData).toEqual(agent);
			expect(reopened.manifest.expiresAt).toBe(1000 + 24 * 60 * 60 * 1000);
			expect(
				await Deno.readTextFile(
					join(reopened.dir, "resources", "skills", "test-skill", "references", "note.md"),
				),
			).toBe("Reference");
			await expect(store.open(workspace.manifest.sessionId, {
				tenant: "tenant-b",
				userEmail: "user@example.com",
				agentUuid: agent.uuid,
			})).rejects.toThrow("Session not found");
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});

	it("expires exactly 24 hours after creation and removes the workspace", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-session-expiry-test-" });
		let now = 0;
		try {
			const store = new SessionWorkspaceStore(join(root, "sessions"), () => now);
			const workspace = await store.create({
				tenant: "tenant-a",
				userEmail: "user@example.com",
				agentData: agent,
				toolNames: [],
				featureVersions: [],
				skills: [],
			});
			now = 24 * 60 * 60 * 1000;
			await expect(store.open(workspace.manifest.sessionId, {
				tenant: "tenant-a",
				userEmail: "user@example.com",
				agentUuid: agent.uuid,
			})).rejects.toThrow("Session expired");
			await expect(Deno.stat(workspace.dir)).rejects.toThrow();
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});

	it("rejects invalid IDs and skill symlinks", async () => {
		const root = await Deno.makeTempDir({ prefix: "antbox-session-security-test-" });
		try {
			const store = new SessionWorkspaceStore(join(root, "sessions"));
			await expect(store.open("../escape", {
				tenant: "tenant-a",
				userEmail: "user@example.com",
				agentUuid: agent.uuid,
			})).rejects.toThrow("Invalid session ID");

			const skill = await createSkill(join(root, "source"));
			await Deno.symlink(join(skill.skillDir, "SKILL.md"), join(skill.skillDir, "link.md"));
			await expect(store.create({
				tenant: "tenant-a",
				userEmail: "user@example.com",
				agentData: agent,
				toolNames: [],
				featureVersions: [],
				skills: [skill],
			})).rejects.toThrow("do not allow symlinks");
		} finally {
			await Deno.remove(root, { recursive: true });
		}
	});
});
