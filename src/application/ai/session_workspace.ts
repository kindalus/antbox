import type { AgentData } from "domain/configuration/agent_data.ts";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { basename, join } from "node:path";
import type { LoadedSkill, SkillFrontmatter } from "./skills_loader.ts";
import { z } from "zod";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SKILL_FILES = 512;
const MAX_SKILL_BYTES = 20 * 1024 * 1024;
const SESSION_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FeatureVersionSchema = z.object({
	uuid: z.string().min(1),
	modifiedTime: z.string().min(1),
});

const SkillFrontmatterSchema = z.object({
	name: z.string().min(1).max(64).regex(SKILL_NAME_PATTERN),
	description: z.string().min(1),
	license: z.string().optional(),
	compatibility: z.string().optional(),
	metadata: z.record(z.string(), z.string()).optional(),
	allowedTools: z.array(z.string()).optional(),
});

const SessionManifestSchema = z.object({
	version: z.literal(1),
	sessionId: z.string().regex(SESSION_ID_PATTERN),
	tenant: z.string().min(1),
	userEmail: z.string().min(1),
	agentUuid: z.string().min(1),
	createdAt: z.number().int().nonnegative(),
	expiresAt: z.number().int().positive(),
	agentData: AgentDataSchema,
	toolNames: z.array(z.string()),
	featureVersions: z.array(FeatureVersionSchema),
	skills: z.array(SkillFrontmatterSchema),
});

export interface FeatureVersion {
	readonly uuid: string;
	readonly modifiedTime: string;
}

export interface SessionManifest {
	readonly version: 1;
	readonly sessionId: string;
	readonly tenant: string;
	readonly userEmail: string;
	readonly agentUuid: string;
	readonly createdAt: number;
	readonly expiresAt: number;
	readonly agentData: AgentData;
	readonly toolNames: readonly string[];
	readonly featureVersions: readonly FeatureVersion[];
	readonly skills: readonly SkillFrontmatter[];
}

export interface CreateSessionWorkspaceInput {
	readonly tenant: string;
	readonly userEmail: string;
	readonly agentData: AgentData;
	readonly toolNames: readonly string[];
	readonly featureVersions: readonly FeatureVersion[];
	readonly skills: readonly LoadedSkill[];
}

export interface SessionWorkspace {
	readonly dir: string;
	readonly manifest: SessionManifest;
	readonly skills: readonly LoadedSkill[];
}

export class SessionWorkspaceStore {
	constructor(
		readonly root: string,
		readonly now: () => number = Date.now,
	) {}

	async create(input: CreateSessionWorkspaceInput): Promise<SessionWorkspace> {
		const sessionId = crypto.randomUUID();
		const createdAt = this.now();
		const manifest: SessionManifest = {
			version: 1,
			sessionId,
			tenant: input.tenant,
			userEmail: input.userEmail,
			agentUuid: input.agentData.uuid,
			createdAt,
			expiresAt: createdAt + SESSION_TTL_MS,
			agentData: structuredClone(input.agentData),
			toolNames: [...input.toolNames],
			featureVersions: structuredClone(input.featureVersions),
			skills: input.skills.map((skill) => structuredClone(skill.frontmatter)),
		};
		const tempDir = join(this.root, `.${sessionId}.tmp`);
		const dir = this.sessionDir(sessionId);
		await Deno.mkdir(this.root, { recursive: true, mode: 0o700 });
		await Deno.mkdir(tempDir, { recursive: false, mode: 0o700 });
		try {
			const skills = await snapshotSkills(input.skills, join(tempDir, "resources", "skills"));
			await Deno.writeTextFile(
				join(tempDir, "manifest.json"),
				JSON.stringify(manifest, null, 2),
				{ mode: 0o600 },
			);
			await Deno.rename(tempDir, dir);
			return {
				dir,
				manifest,
				skills: relocateSkills(skills, tempDir, dir),
			};
		} catch (error) {
			await removeIfExists(tempDir);
			throw error;
		}
	}

	async open(
		sessionId: string,
		identity: { tenant: string; userEmail: string; agentUuid: string },
	): Promise<SessionWorkspace> {
		const dir = this.sessionDir(sessionId);
		const manifest = await readManifest(dir);
		if (
			manifest.tenant !== identity.tenant ||
			manifest.userEmail !== identity.userEmail ||
			manifest.agentUuid !== identity.agentUuid
		) {
			throw new Error("Session not found");
		}
		if (this.now() >= manifest.expiresAt) {
			await removeIfExists(dir);
			throw new Error("Session expired");
		}
		return {
			dir,
			manifest,
			skills: manifest.skills.map((frontmatter) => snapshotSkill(dir, frontmatter)),
		};
	}

	async delete(
		sessionId: string,
		identity: { tenant: string; userEmail: string; agentUuid: string },
	): Promise<void> {
		try {
			await this.open(sessionId, identity);
		} catch (error) {
			if ((error as Error).message === "Session expired") return;
			throw error;
		}
		await removeIfExists(this.sessionDir(sessionId));
	}

	async sweepExpired(): Promise<void> {
		try {
			for await (const entry of Deno.readDir(this.root)) {
				if (!entry.isDirectory || !SESSION_ID_PATTERN.test(entry.name)) continue;
				const dir = join(this.root, entry.name);
				try {
					const manifest = await readManifest(dir);
					if (this.now() >= manifest.expiresAt) await removeIfExists(dir);
				} catch {
					// Invalid session directories are not deleted automatically.
				}
			}
		} catch (error) {
			if (!(error instanceof Deno.errors.NotFound)) throw error;
		}
	}

	async rollback(sessionId: string): Promise<void> {
		await removeIfExists(this.sessionDir(sessionId));
	}

	findSessionFile(workspace: SessionWorkspace): string {
		for (const entry of Deno.readDirSync(workspace.dir)) {
			if (entry.isFile && entry.name.endsWith(".jsonl")) return join(workspace.dir, entry.name);
		}
		throw new Error("Session data is missing");
	}

	private sessionDir(sessionId: string): string {
		if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Invalid session ID");
		return join(this.root, sessionId);
	}
}

async function readManifest(dir: string): Promise<SessionManifest> {
	try {
		const raw = JSON.parse(await Deno.readTextFile(join(dir, "manifest.json")));
		return SessionManifestSchema.parse(raw) as SessionManifest;
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) throw new Error("Session not found");
		throw new Error(`Invalid session: ${error}`);
	}
}

async function snapshotSkills(
	skills: readonly LoadedSkill[],
	root: string,
): Promise<LoadedSkill[]> {
	const snapshots: LoadedSkill[] = [];
	for (const skill of skills) {
		const target = join(root, skill.frontmatter.name);
		await Deno.mkdir(target, { recursive: true, mode: 0o700 });
		if (basename(skill.skillDir) === skill.frontmatter.name) {
			await copyTree(skill.skillDir, target, { files: 0, bytes: 0 });
		} else {
			const targetFile = join(target, "SKILL.md");
			await Deno.copyFile(skill.skillFile, targetFile);
			await setMode(targetFile, 0o600);
		}
		snapshots.push({
			frontmatter: structuredClone(skill.frontmatter),
			skillDir: target,
			skillFile: join(target, "SKILL.md"),
		});
	}
	return snapshots;
}

async function copyTree(
	source: string,
	target: string,
	budget: { files: number; bytes: number },
): Promise<void> {
	for await (const entry of Deno.readDir(source)) {
		if (entry.isSymlink) throw new Error(`Skill snapshots do not allow symlinks: ${entry.name}`);
		const from = join(source, entry.name);
		const to = join(target, entry.name);
		if (entry.isDirectory) {
			await Deno.mkdir(to, { recursive: false, mode: 0o700 });
			await copyTree(from, to, budget);
			continue;
		}
		if (!entry.isFile) throw new Error(`Unsupported skill entry: ${entry.name}`);
		const size = (await Deno.stat(from)).size;
		budget.files++;
		budget.bytes += size;
		if (budget.files > MAX_SKILL_FILES || budget.bytes > MAX_SKILL_BYTES) {
			throw new Error("Skill snapshot exceeds the allowed size");
		}
		await Deno.copyFile(from, to);
		await setMode(to, 0o600);
	}
}

function relocateSkills(
	skills: readonly LoadedSkill[],
	fromRoot: string,
	toRoot: string,
): LoadedSkill[] {
	return skills.map((skill) => ({
		...skill,
		skillDir: skill.skillDir.replace(fromRoot, toRoot),
		skillFile: skill.skillFile.replace(fromRoot, toRoot),
	}));
}

function snapshotSkill(sessionDir: string, frontmatter: SkillFrontmatter): LoadedSkill {
	const skillDir = join(sessionDir, "resources", "skills", frontmatter.name);
	return {
		frontmatter: structuredClone(frontmatter),
		skillDir,
		skillFile: join(skillDir, "SKILL.md"),
	};
}

async function setMode(path: string, mode: number): Promise<void> {
	try {
		await Deno.chmod(path, mode);
	} catch (error) {
		if (!(error instanceof Deno.errors.NotSupported)) throw error;
	}
}

async function removeIfExists(path: string): Promise<void> {
	try {
		await Deno.remove(path, { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
}
