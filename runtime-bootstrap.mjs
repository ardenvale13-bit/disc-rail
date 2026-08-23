import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const EXTENSION_SUFFIXES = [".js", ".mjs", ".cjs", ".ts"];

export function checkExecutable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5_000 });
  return {
    available: result.status === 0 && !result.error,
    output: String(result.stdout || result.stderr || result.error?.message || "").trim(),
  };
}

export function verifyRuntimeDependencies() {
  const git = checkExecutable("git");
  if (!git.available) {
    throw new Error(
      "git is required for Letta MemFS but is not installed. " +
      "Ensure nixpacks.toml installs the git apt package before starting this service.",
    );
  }

  const curl = checkExecutable("curl");
  if (!curl.available) {
    console.warn("[lincoln] curl is unavailable; MemFS diagnostics will be limited.");
  }

  console.log(`[lincoln] Runtime dependency check: ${git.output}`);
  if (curl.available) console.log(`[lincoln] Runtime dependency check: ${curl.output.split("\n")[0]}`);
}

export function installBundledExtensions({
  projectDir = process.cwd(),
  lettaDir = join(homedir(), ".letta"),
} = {}) {
  const sourceDir = join(projectDir, "extensions");
  const targetDir = join(lettaDir, "extensions");

  if (!existsSync(sourceDir)) {
    console.log("[lincoln] No bundled extensions directory; skipping extension bootstrap.");
    return [];
  }

  mkdirSync(targetDir, { recursive: true });
  const installed = [];

  for (const name of readdirSync(sourceDir).sort()) {
    if (!EXTENSION_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;

    const source = join(sourceDir, name);
    const target = join(targetDir, basename(name));
    const sourceContent = readFileSync(source);
    const targetContent = existsSync(target) ? readFileSync(target) : null;

    if (!targetContent || !sourceContent.equals(targetContent)) {
      copyFileSync(source, target);
      console.log(`[lincoln] Installed trusted extension: ${name}`);
    } else {
      console.log(`[lincoln] Trusted extension already current: ${name}`);
    }

    installed.push(target);
  }

  return installed;
}

export function prepareRuntime(options = {}) {
  verifyRuntimeDependencies();
  return installBundledExtensions(options);
}
