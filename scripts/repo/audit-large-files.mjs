import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const warningThresholdBytes = 50 * 1024 * 1024;
const blockingThresholdBytes = 100 * 1024 * 1024;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function collectTrackedFiles() {
  const output = runGit(["ls-files", "-z"]);

  return output
    .split("\0")
    .filter(Boolean)
    .map((relativePath) => {
      const absolutePath = path.join(repoRoot, relativePath);
      const stats = statSync(absolutePath);

      return {
        path: relativePath,
        size: stats.size,
      };
    })
    .sort((left, right) => right.size - left.size);
}

function collectHistoryBlobs() {
  const objectList = runGit(["rev-list", "--objects", "--all"]);
  const batchOutput = execFileSync(
    "git",
    ["cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: objectList,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  return batchOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [type, sha, sizeText, ...rest] = line.split(" ");

      return {
        type,
        sha,
        size: Number(sizeText),
        path: rest.join(" "),
      };
    })
    .filter((entry) => entry.type === "blob")
    .sort((left, right) => right.size - left.size);
}

function printSection(title, entries) {
  console.log(title);

  if (entries.length === 0) {
    console.log("  none");
    return;
  }

  for (const entry of entries) {
    console.log(`  ${formatMiB(entry.size)}  ${entry.path}`);
  }
}

function main() {
  const trackedFiles = collectTrackedFiles();
  const historyBlobs = collectHistoryBlobs();

  const trackedWarnings = trackedFiles.filter(
    (entry) => entry.size >= warningThresholdBytes,
  );
  const blockingHistoryBlobs = historyBlobs.filter(
    (entry) => entry.size >= blockingThresholdBytes,
  );

  printSection("Tracked files at or above 50 MiB:", trackedWarnings);
  printSection("History blobs at or above 100 MiB:", blockingHistoryBlobs);

  if (trackedWarnings.length > 0 || blockingHistoryBlobs.length > 0) {
    process.exitCode = 1;
  }
}

main();
