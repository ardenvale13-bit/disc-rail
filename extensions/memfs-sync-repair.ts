import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const TARGET_AGENT_ID = process.env.LETTA_AGENT_ID || "agent-036c41a5-b0cd-4e04-92fc-8a6f55e3c0b1";
const MEMORY_DIR = join(homedir(), ".letta", "agents", TARGET_AGENT_ID, "memory");
const STATE_PATH = join(homedir(), ".letta", "extensions", "memfs-sync-repair.state.json");
const MANAGED_PREFIXES = ["system/", "family/", "skills/"];
const MARKER_KEY = "memfs_sync_repair";
const GIT_TIMEOUT_MS = 60_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeNewlines(value) {
  return String(value ?? "").replaceAll("\r\n", "\n");
}

function normalizedBlockShape(value, metadata = {}) {
  return {
    value: normalizeNewlines(value),
    description: metadata.description ?? null,
    limit: Number.isFinite(metadata.limit) ? metadata.limit : 100000,
    read_only: metadata.read_only === true,
  };
}

function blockSignature(value, metadata = {}) {
  return sha256(JSON.stringify(normalizedBlockShape(value, metadata)));
}

function markerSignature(apiEntry) {
  const marker = apiEntry?.metadata?.[MARKER_KEY];
  return marker?.version === 1 && typeof marker.signature === "string" ? marker.signature : null;
}

function parseMemoryFile(filePath) {
  let source = normalizeNewlines(readFileSync(filePath, "utf8"));
  const metadata = {};

  if (source.startsWith("---\n")) {
    const end = source.indexOf("\n---\n", 4);
    if (end < 0) throw new Error(`Invalid frontmatter in ${filePath}`);
    const frontmatter = source.slice(4, end);
    source = source.slice(end + 5);

    for (const rawLine of frontmatter.split("\n")) {
      const colon = rawLine.indexOf(":");
      if (colon < 0) continue;
      const key = rawLine.slice(0, colon).trim();
      let value = rawLine.slice(colon + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        try { value = JSON.parse(value); } catch {}
      }
      if (key === "description") metadata.description = value;
      if (key === "read_only") metadata.read_only = value === "true";
      if (key === "limit" && /^\d+$/.test(value)) metadata.limit = Number(value);
    }
  }

  return { value: source, metadata };
}

function serializeMemoryFile(block) {
  const description = String(block.description || `Memory block ${block.label}`);
  const lines = ["---", `description: ${JSON.stringify(description)}`];
  if (block.read_only === true) lines.push("read_only: true");
  if (Number.isFinite(block.limit) && block.limit !== 100000) lines.push(`limit: ${block.limit}`);
  lines.push("---", "", normalizeNewlines(block.value || ""));
  return lines.join("\n");
}

function labelForPath(filePath) {
  const rel = relative(MEMORY_DIR, filePath).split(sep).join("/");
  if (rel.startsWith("skills/") && rel.endsWith("/SKILL.md")) return rel.slice(0, -9);
  return rel.replace(/\.md$/, "");
}

function pathForLabel(label) {
  if (label.startsWith("skills/")) return join(MEMORY_DIR, label, "SKILL.md");
  return join(MEMORY_DIR, `${label}.md`);
}

function isManagedLabel(label) {
  return typeof label === "string" && MANAGED_PREFIXES.some((prefix) => label.startsWith(prefix));
}

function walkMarkdown(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === ".letta") continue;
    const filePath = join(dir, name);
    const stat = statSync(filePath);
    if (stat.isDirectory()) walkMarkdown(filePath, output);
    else if (name.endsWith(".md")) output.push(filePath);
  }
  return output;
}

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    if (parsed?.version === 1 && parsed?.agentId === TARGET_AGENT_ID && parsed?.labels) return parsed;
  } catch {}
  return { version: 1, agentId: TARGET_AGENT_ID, labels: {}, lastSyncAt: null };
}

function writeState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const temp = `${STATE_PATH}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, STATE_PATH);
}

async function git(args) {
  const { stdout = "" } = await execFileAsync("git", args, {
    cwd: MEMORY_DIR,
    maxBuffer: 10 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
  });
  return stdout.trim();
}

async function gitSucceeds(args) {
  try {
    await git(args);
    return true;
  } catch {
    return false;
  }
}

async function refreshGitFromRemote() {
  const dirty = await git(["status", "--porcelain"]);
  await git(["fetch", "origin", "main:refs/remotes/origin/main"]);

  const local = await git(["rev-parse", "HEAD"]);
  const remote = await git(["rev-parse", "origin/main"]);
  if (local === remote) return;

  if (dirty) {
    throw new Error("MemFS has uncommitted changes while origin/main differs; refusing automatic synchronization.");
  }

  if (await gitSucceeds(["merge-base", "--is-ancestor", local, remote])) {
    await git(["merge", "--ff-only", "origin/main"]);
    return;
  }

  if (await gitSucceeds(["merge-base", "--is-ancestor", remote, local])) {
    throw new Error("Local MemFS is ahead of origin/main; push it before synchronizing attached blocks.");
  }

  throw new Error("Local MemFS and origin/main have diverged; manual conflict resolution is required.");
}

async function assertCleanGitForWrite() {
  if (existsSync(join(MEMORY_DIR, ".git", "index.lock"))) {
    throw new Error("MemFS git index is locked; refusing to write until the interrupted git operation is resolved.");
  }
  const dirty = await git(["status", "--porcelain"]);
  if (dirty) throw new Error("MemFS working tree is dirty; refusing automatic synchronization.");
}

async function getAttachedBlocks(letta) {
  const agent = await letta.client.agents.retrieve(TARGET_AGENT_ID);
  return Array.isArray(agent.blocks) ? agent.blocks.filter((block) => isManagedLabel(block.label)) : [];
}

async function snapshot(letta, { refresh = true } = {}) {
  if (!existsSync(join(MEMORY_DIR, ".git"))) throw new Error(`MemFS git repo missing at ${MEMORY_DIR}`);
  if (refresh) await refreshGitFromRemote();

  const gitEntries = new Map();
  for (const filePath of walkMarkdown(MEMORY_DIR)) {
    const label = labelForPath(filePath);
    if (!isManagedLabel(label)) continue;
    const parsed = parseMemoryFile(filePath);
    gitEntries.set(label, {
      label,
      filePath,
      value: parsed.value,
      metadata: parsed.metadata,
      hash: blockSignature(parsed.value, parsed.metadata),
    });
  }

  const apiEntries = new Map();
  for (const block of await getAttachedBlocks(letta)) {
    const value = normalizeNewlines(block.value || "");
    const blockMetadata = {
      description: block.description ?? null,
      limit: block.limit,
      read_only: block.read_only === true,
    };
    apiEntries.set(block.label, { ...block, value, hash: blockSignature(value, blockMetadata) });
  }

  const labels = [...new Set([...gitEntries.keys(), ...apiEntries.keys()])].sort();
  return { gitEntries, apiEntries, labels };
}

function comparisonRows(snap) {
  return snap.labels.map((label) => {
    const gitEntry = snap.gitEntries.get(label);
    const apiEntry = snap.apiEntries.get(label);
    const baseline = markerSignature(apiEntry);
    return {
      label,
      gitEntry,
      apiEntry,
      gitHash: gitEntry?.hash ?? null,
      apiHash: apiEntry?.hash ?? null,
      equal: Boolean(gitEntry && apiEntry && gitEntry.hash === apiEntry.hash),
      gitChanged: baseline ? (gitEntry?.hash ?? null) !== baseline : null,
      apiChanged: baseline ? (apiEntry?.hash ?? null) !== baseline : null,
      hasBaseline: Boolean(baseline),
    };
  });
}

async function persistEqualMarkers(letta, snap, labels = snap.labels) {
  const marked = [];
  for (const label of labels) {
    const gitEntry = snap.gitEntries.get(label);
    const apiEntry = snap.apiEntries.get(label);
    if (!gitEntry || !apiEntry || gitEntry.hash !== apiEntry.hash || apiEntry.read_only) continue;
    if (markerSignature(apiEntry) === gitEntry.hash) continue;

    await letta.client.blocks.update(apiEntry.id, {
      metadata: {
        ...(apiEntry.metadata || {}),
        [MARKER_KEY]: {
          version: 1,
          signature: gitEntry.hash,
          synced_at: new Date().toISOString(),
        },
      },
    });
    marked.push(label);
  }
  return marked;
}

function saveSnapshotState(snap) {
  const labels = {};
  for (const label of snap.labels) {
    labels[label] = {
      gitHash: snap.gitEntries.get(label)?.hash ?? null,
      apiHash: snap.apiEntries.get(label)?.hash ?? null,
    };
  }
  writeState({ version: 1, agentId: TARGET_AGENT_ID, labels, lastSyncAt: new Date().toISOString() });
}

async function syncGitToApi(letta, requestedLabels = null) {
  const snap = await snapshot(letta);
  await assertCleanGitForWrite();
  const labels = requestedLabels ? [...requestedLabels] : snap.labels;
  const changed = [];
  const skipped = [];

  for (const label of labels) {
    const gitEntry = snap.gitEntries.get(label);
    const apiEntry = snap.apiEntries.get(label);
    if (!gitEntry) {
      skipped.push(`${label} (no git file)`);
      continue;
    }
    if (apiEntry?.read_only) {
      skipped.push(`${label} (read-only API block)`);
      continue;
    }
    if (apiEntry && apiEntry.hash === gitEntry.hash) continue;

    if (apiEntry) {
      const body = {
        value: gitEntry.value,
        metadata: {
          ...(apiEntry.metadata || {}),
          [MARKER_KEY]: {
            version: 1,
            signature: gitEntry.hash,
            synced_at: new Date().toISOString(),
          },
        },
      };
      if (gitEntry.metadata.description) body.description = gitEntry.metadata.description;
      if (Number.isFinite(gitEntry.metadata.limit)) body.limit = gitEntry.metadata.limit;
      await letta.client.blocks.update(apiEntry.id, body);
      changed.push(`${label} (updated)`);
    } else {
      if (gitEntry.metadata.read_only) {
        skipped.push(`${label} (read-only is protected; attach it through Letta first)`);
        continue;
      }
      const body = {
        label,
        value: gitEntry.value,
        description: gitEntry.metadata.description || `Memory block ${label}`,
        metadata: {
          [MARKER_KEY]: {
            version: 1,
            signature: gitEntry.hash,
            synced_at: new Date().toISOString(),
          },
        },
      };
      if (Number.isFinite(gitEntry.metadata.limit)) body.limit = gitEntry.metadata.limit;
      const created = await letta.client.blocks.create(body);
      try {
        await letta.client.agents.blocks.attach(created.id, { agent_id: TARGET_AGENT_ID });
      } catch (error) {
        try { await letta.client.blocks.delete(created.id); } catch {}
        throw error;
      }
      changed.push(`${label} (created and attached)`);
    }
  }

  const finalSnapshot = await snapshot(letta, { refresh: false });
  await persistEqualMarkers(letta, finalSnapshot);
  saveSnapshotState(finalSnapshot);
  return { changed, skipped, snapshot: finalSnapshot };
}

async function syncApiToGit(letta, requestedLabels = null) {
  const snap = await snapshot(letta);
  await assertCleanGitForWrite();
  const labels = requestedLabels ? [...requestedLabels] : snap.labels;
  const changedPaths = [];
  const skipped = [];

  for (const label of labels) {
    const apiEntry = snap.apiEntries.get(label);
    const gitEntry = snap.gitEntries.get(label);
    if (!apiEntry) {
      skipped.push(`${label} (no attached API block)`);
      continue;
    }
    if (gitEntry?.metadata.read_only && gitEntry.hash !== apiEntry.hash) {
      skipped.push(`${label} (read-only git file)`);
      continue;
    }
    if (gitEntry && gitEntry.hash === apiEntry.hash) continue;

    const filePath = pathForLabel(label);
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    writeFileSync(tempPath, serializeMemoryFile(apiEntry));
    renameSync(tempPath, filePath);
    changedPaths.push(relative(MEMORY_DIR, filePath));
  }

  if (changedPaths.length) {
    await git(["add", "--", ...changedPaths]);
    await git(["commit", "-m", "Sync Letta API memory blocks into MemFS"]);
    await git(["push", "origin", "HEAD:main"]);
  }

  const finalSnapshot = await snapshot(letta, { refresh: false });
  await persistEqualMarkers(letta, finalSnapshot);
  saveSnapshotState(finalSnapshot);
  return { changed: changedPaths, skipped, snapshot: finalSnapshot };
}

async function autoSync(letta) {
  const snap = await snapshot(letta);
  const rows = comparisonRows(snap);
  const mismatches = rows.filter((row) => !row.equal);

  if (!mismatches.length) {
    await persistEqualMarkers(letta, snap);
    saveSnapshotState(snap);
    return { action: "baseline", changed: [], conflicts: [], detail: "Git and API memory already match." };
  }

  const gitToApi = [];
  const apiToGit = [];
  const conflicts = [];

  for (const row of mismatches) {
    if (!row.hasBaseline) {
      conflicts.push(`${row.label} (no common baseline)`);
    } else if (row.gitChanged && !row.apiChanged) {
      gitToApi.push(row.label);
    } else if (row.apiChanged && !row.gitChanged) {
      apiToGit.push(row.label);
    } else {
      conflicts.push(`${row.label} (both sides changed)`);
    }
  }

  const changed = [];
  if (gitToApi.length) {
    const result = await syncGitToApi(letta, gitToApi);
    changed.push(...result.changed);
  }
  if (apiToGit.length) {
    const result = await syncApiToGit(letta, apiToGit);
    changed.push(...result.changed.map((path) => `${path} (API -> git)`));
  }

  return { action: "auto", changed, conflicts, detail: conflicts.length ? "Conflicts require an explicit direction." : "Safe one-sided changes synchronized." };
}

async function status(letta) {
  const state = readState();
  const snap = await snapshot(letta);
  const rows = comparisonRows(snap);
  const head = await git(["rev-parse", "--short", "HEAD"]);
  const branch = await git(["status", "--short", "--branch"]);
  return { state, snap, rows, head, branch };
}

function formatStatus(result) {
  const mismatches = result.rows.filter((row) => !row.equal);
  const missingApi = result.rows.filter((row) => row.gitEntry && !row.apiEntry);
  const missingGit = result.rows.filter((row) => !row.gitEntry && row.apiEntry);
  const lines = [
    `MemFS repair status for Lincoln`,
    `Git: ${result.branch.split("\n")[0]} (${result.head})`,
    `Tracked labels: ${result.rows.length}`,
    `Mismatches: ${mismatches.length}`,
    `Baselined labels: ${result.rows.filter((row) => row.hasBaseline).length}`,
  ];
  if (mismatches.length) lines.push(...mismatches.map((row) => `- ${row.label}: git=${row.gitHash?.slice(0, 8) || "missing"}, api=${row.apiHash?.slice(0, 8) || "missing"}`));
  if (missingApi.length) lines.push(`Missing from API: ${missingApi.map((row) => row.label).join(", ")}`);
  if (missingGit.length) lines.push(`Missing from git: ${missingGit.map((row) => row.label).join(", ")}`);
  lines.push(`Last baseline: ${result.state.lastSyncAt || "none"}`);
  return lines.join("\n");
}

async function runMode(letta, mode) {
  if (mode === "status") return formatStatus(await status(letta));
  if (mode === "git-to-api") {
    const result = await syncGitToApi(letta);
    return `Git -> API complete. Updated: ${result.changed.length ? result.changed.join(", ") : "none"}.${result.skipped.length ? ` Skipped: ${result.skipped.join(", ")}.` : ""}`;
  }
  if (mode === "api-to-git") {
    const result = await syncApiToGit(letta);
    return `API -> git complete. Updated: ${result.changed.length ? result.changed.join(", ") : "none"}.${result.skipped.length ? ` Skipped: ${result.skipped.join(", ")}.` : ""}`;
  }
  if (mode === "auto") {
    const result = await autoSync(letta);
    return `${result.detail} Changed: ${result.changed.length ? result.changed.join(", ") : "none"}.${result.conflicts.length ? ` Conflicts: ${result.conflicts.join(", ")}.` : ""}`;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

export default function activate(letta) {
  const disposers = [];
  const timers = new Set();
  let backgroundSync = Promise.resolve();

  const clearTrackedTimer = (timer) => {
    clearInterval(timer);
    clearTimeout(timer);
    timers.delete(timer);
  };

  const queueAutoSync = (reason) => {
    backgroundSync = backgroundSync
      .then(async () => {
        if (!existsSync(join(MEMORY_DIR, ".git"))) return;
        const result = await autoSync(letta);
        if (result.changed.length || result.conflicts.length) {
          console.log(`[memfs-sync-repair] ${reason}: ${result.detail}`, { changed: result.changed, conflicts: result.conflicts });
        }
      })
      .catch((error) => console.warn(`[memfs-sync-repair] ${reason} failed:`, error?.message || error));
  };

  if (letta.capabilities.tools) {
    disposers.push(letta.tools.register({
      name: "memfs_sync_repair",
      description: "Check or repair synchronization between Lincoln's git-backed memory files and attached Letta API memory blocks. Call after memory_apply_patch, when memory visible in Letta differs from MemFS, or when diagnosing continuity drift.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["status", "auto", "git-to-api", "api-to-git"],
            description: "status is read-only; auto syncs only one-sided changes; explicit directions resolve initial drift or conflicts.",
          },
        },
        required: ["mode"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: false,
      async run(ctx) {
        if (ctx.agent?.id && ctx.agent.id !== TARGET_AGENT_ID) return "This repair tool is scoped only to Lincoln.";
        try {
          return await runMode(letta, String(ctx.args.mode || "status"));
        } catch (error) {
          return { status: "error", content: `MemFS repair failed: ${error?.message || error}` };
        }
      },
    }));
  }

  if (letta.capabilities.commands) {
    disposers.push(letta.commands.register({
      id: "memfs-repair",
      description: "Inspect or repair Lincoln's MemFS/API synchronization",
      args: "[status|auto|git-to-api|api-to-git]",
      async run(ctx) {
        if (ctx.agent?.id && ctx.agent.id !== TARGET_AGENT_ID) return { type: "output", output: "This repair command is scoped only to Lincoln." };
        const mode = (ctx.args || "status").trim() || "status";
        try {
          return { type: "output", output: await runMode(letta, mode) };
        } catch (error) {
          return { type: "output", output: `MemFS repair failed: ${error?.message || error}` };
        }
      },
    }));
  }

  if (letta.capabilities.events.lifecycle) {
    disposers.push(letta.events.on("conversation_open", (event) => {
      if (event.agentId === TARGET_AGENT_ID) queueAutoSync("conversation_open");
    }));
  }

  if (letta.capabilities.events.turns) {
    disposers.push(letta.events.on("turn_start", (event) => {
      if (event.agentId === TARGET_AGENT_ID) queueAutoSync("turn_start");
    }));
  }

  if (letta.capabilities.events.tools) {
    disposers.push(letta.events.on("tool_start", async (event) => {
      const canonicalToolName = String(event.toolName || "").split(".").pop();
      if (event.agentId !== TARGET_AGENT_ID || canonicalToolName !== "memory_apply_patch") return;
      let before = "";
      try { before = await git(["rev-parse", "HEAD"]); } catch { return; }
      const poll = setInterval(async () => {
        try {
          const after = await git(["rev-parse", "HEAD"]);
          if (after === before) return;
          clearTrackedTimer(poll);
          queueAutoSync("memory_apply_patch");
        } catch {}
      }, 750);
      timers.add(poll);
      const expiry = setTimeout(() => {
        clearTrackedTimer(poll);
        timers.delete(expiry);
      }, 45_000);
      timers.add(expiry);
    }));
  }

  return () => {
    for (const timer of timers) clearTrackedTimer(timer);
    for (const dispose of disposers.reverse()) dispose();
  };
}
