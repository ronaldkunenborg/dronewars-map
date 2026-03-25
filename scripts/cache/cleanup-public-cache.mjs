import { rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cacheRoot = path.join(repoRoot, "data", "cache", "public-sources");

const knownGroups = [
  "geoboundaries",
  "natural-earth",
  "overpass",
  "elevation",
  "osm",
  "raw-intake",
];

const profiles = {
  light: ["geoboundaries", "natural-earth", "overpass"],
  standard: ["geoboundaries", "natural-earth", "overpass", "elevation"],
  full: [...knownGroups],
};

function parseArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function parseCsvArg(name) {
  const raw = parseArg(name);
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

async function directorySizeBytes(directoryPath) {
  let total = 0;
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySizeBytes(absolutePath);
      continue;
    }
    if (entry.isFile()) {
      const fileStats = await stat(absolutePath);
      total += fileStats.size;
    }
  }
  return total;
}

async function main() {
  const profile = parseArg("profile") ?? "standard";
  if (!Object.hasOwn(profiles, profile)) {
    throw new Error(
      `Unknown profile '${profile}'. Use one of: ${Object.keys(profiles).join(", ")}`,
    );
  }

  const includeGroups = parseCsvArg("include");
  const excludeGroups = new Set(parseCsvArg("exclude"));
  const apply = hasFlag("apply");

  const requestedGroups = includeGroups.length > 0 ? includeGroups : profiles[profile];
  const uniqueGroups = [...new Set(requestedGroups)].filter((group) => !excludeGroups.has(group));

  const invalidGroups = uniqueGroups.filter((group) => !knownGroups.includes(group));
  if (invalidGroups.length > 0) {
    throw new Error(
      `Unknown cache group(s): ${invalidGroups.join(", ")}. Known groups: ${knownGroups.join(", ")}`,
    );
  }

  const existingGroups = [];
  const missingGroups = [];
  for (const group of uniqueGroups) {
    const groupPath = path.join(cacheRoot, group);
    try {
      const groupStats = await stat(groupPath);
      if (!groupStats.isDirectory()) {
        missingGroups.push(group);
        continue;
      }
      const sizeBytes = await directorySizeBytes(groupPath);
      existingGroups.push({ group, groupPath, sizeBytes });
    } catch {
      missingGroups.push(group);
    }
  }

  const reclaimableBytes = existingGroups.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  console.log(`Cache root: ${cacheRoot}`);
  console.log(`Mode: ${apply ? "apply (delete)" : "dry-run (no changes)"}`);
  console.log(`Profile: ${profile}`);
  console.log("");

  if (existingGroups.length === 0) {
    console.log("No matching cache folders found.");
  } else {
    console.log("Target cache folders:");
    for (const entry of existingGroups.sort((a, b) => b.sizeBytes - a.sizeBytes)) {
      console.log(`- ${entry.group}: ${formatBytes(entry.sizeBytes)}`);
    }
    console.log(`Reclaimable total: ${formatBytes(reclaimableBytes)}`);
  }

  if (missingGroups.length > 0) {
    console.log("");
    console.log(`Missing/absent groups (skipped): ${missingGroups.join(", ")}`);
  }

  if (!apply) {
    console.log("");
    console.log("No files were deleted. Re-run with --apply to remove these folders.");
    return;
  }

  for (const entry of existingGroups) {
    await rm(entry.groupPath, { recursive: true, force: true });
  }

  console.log("");
  console.log(`Deleted ${existingGroups.length} cache folder(s), reclaimed ${formatBytes(reclaimableBytes)}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Cache cleanup failed: ${message}`);
  process.exitCode = 1;
});
