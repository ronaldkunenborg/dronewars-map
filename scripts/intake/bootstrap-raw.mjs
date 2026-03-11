import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { rawSourceManifest } from "./source-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const rawRoot = path.join(repoRoot, "data", "raw");
const cacheRoot = path.join(repoRoot, "data", "cache", "public-sources", "raw-intake");

const cacheTtlMs = 365 * 24 * 60 * 60 * 1000;
const cacheSchemaVersion = 1;

const theaterBbox = {
  west: 22.0,
  south: 44.0,
  east: 40.5,
  north: 52.5,
};

const sources = {
  adm0Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM0/",
  adm1Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM1/",
  osmExtract: "https://download.geofabrik.de/europe/ukraine-latest.osm.pbf",
  worldcoverBase: "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map",
};

const refreshTargets = new Set(
  process.argv
    .flatMap((argument) => {
      if (argument === "--refresh") {
        return ["all"];
      }

      if (argument.startsWith("--refresh=")) {
        return argument
          .slice("--refresh=".length)
          .split(",")
          .map((segment) => segment.trim())
          .filter(Boolean);
      }

      return [];
    }),
);

const skipFlags = new Set(process.argv.filter((argument) => argument.startsWith("--skip-")));

const gdalTools = {
  warp: "gdalwarp",
};

const gdalCommandNames = new Set(Object.values(gdalTools));
const osgeoBinDir = process.env.OSGEO4W_BIN ?? "C:\\OSGeo4W\\bin";
const osgeoRootDir = path.dirname(osgeoBinDir);

function resolveCommand(command) {
  if (process.platform !== "win32" || !gdalCommandNames.has(command)) {
    return command;
  }

  const explicitName = command.toLowerCase().endsWith(".exe") ? command : `${command}.exe`;
  const candidates = [
    path.join(osgeoBinDir, explicitName),
    path.join(osgeoRootDir, "apps", "gdal-dev", "bin", explicitName),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ?? command;
}

function shouldRefresh(cacheKey) {
  if (refreshTargets.has("all")) {
    return true;
  }

  const segments = cacheKey.split("/");
  return segments.some((segment) => refreshTargets.has(segment)) || refreshTargets.has(cacheKey);
}

function cacheJsonPath(cacheKey) {
  return path.join(cacheRoot, `${cacheKey}.json`);
}

function cacheBinaryPath(relativePath) {
  return path.join(cacheRoot, relativePath);
}

function sourceEntry(sourceId) {
  const entry = rawSourceManifest.find((item) => item.id === sourceId);

  if (!entry) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  return entry;
}

function rawPathFor(sourceId, extension) {
  const entry = sourceEntry(sourceId);
  return path.join(rawRoot, entry.category, `${entry.targetName}${extension}`);
}

async function writeCachedJson(cacheKey, data) {
  const targetPath = cacheJsonPath(cacheKey);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    JSON.stringify(
      {
        version: cacheSchemaVersion,
        cachedAt: new Date().toISOString(),
        data,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function readCachedJson(cacheKey) {
  if (shouldRefresh(cacheKey)) {
    return null;
  }

  try {
    const contents = await readFile(cacheJsonPath(cacheKey), "utf8");
    const parsed = JSON.parse(contents);

    if (!parsed || parsed.version !== cacheSchemaVersion || typeof parsed.cachedAt !== "string") {
      return null;
    }

    const ageMs = Date.now() - Date.parse(parsed.cachedAt);

    if (!Number.isFinite(ageMs) || ageMs > cacheTtlMs) {
      return null;
    }

    return parsed.data ?? null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readCachedBinary(cacheKey, relativePath) {
  if (shouldRefresh(cacheKey)) {
    return null;
  }

  const metadata = await readCachedJson(cacheKey);

  if (!metadata) {
    return null;
  }

  const binaryPath = cacheBinaryPath(relativePath);
  return existsSync(binaryPath) ? binaryPath : null;
}

async function writeCachedBinary(cacheKey, relativePath, metadata) {
  const binaryPath = cacheBinaryPath(relativePath);
  await mkdir(path.dirname(binaryPath), { recursive: true });
  await writeCachedJson(cacheKey, {
    ...(metadata ?? {}),
    relativePath,
  });
}

async function fetchJsonWithCache(cacheKey, url) {
  const cached = await readCachedJson(cacheKey);

  if (cached) {
    console.log(`cache hit  ${cacheKey}`);
    return cached;
  }

  console.log(`cache miss ${cacheKey}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  await writeCachedJson(cacheKey, {
    sourceUrl: url,
    payload: data,
  });
  return {
    sourceUrl: url,
    payload: data,
  };
}

async function downloadBinaryToFile(url, targetPath) {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const nodeReadable = Readable.fromWeb(response.body);
  const { createWriteStream } = await import("node:fs");
  await pipeline(nodeReadable, createWriteStream(targetPath));
}

function runCommand(command, args) {
  const resolvedCommand = resolveCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function commandExists(command) {
  if (process.platform === "win32" && gdalCommandNames.has(command)) {
    const explicitName = command.toLowerCase().endsWith(".exe") ? command : `${command}.exe`;
    const candidate = path.join(osgeoBinDir, explicitName);

    if (existsSync(candidate)) {
      return true;
    }
  }

  const locator = process.platform === "win32" ? "where" : "which";

  return new Promise((resolve) => {
    const child = spawn(locator, [command], {
      stdio: "ignore",
      shell: false,
    });

    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function worldCoverLatToken(latitude) {
  const rounded = Math.floor(latitude / 3) * 3;
  const prefix = rounded >= 0 ? "N" : "S";
  return `${prefix}${String(Math.abs(rounded)).padStart(2, "0")}`;
}

function worldCoverLonToken(longitude) {
  const rounded = Math.floor(longitude / 3) * 3;
  const prefix = rounded >= 0 ? "E" : "W";
  return `${prefix}${String(Math.abs(rounded)).padStart(3, "0")}`;
}

function buildWorldCoverTileUrls() {
  const latitudes = [];
  const longitudes = [];

  for (let latitude = Math.floor(theaterBbox.south / 3) * 3; latitude < theaterBbox.north; latitude += 3) {
    latitudes.push(latitude);
  }

  for (let longitude = Math.floor(theaterBbox.west / 3) * 3; longitude < theaterBbox.east; longitude += 3) {
    longitudes.push(longitude);
  }

  return latitudes.flatMap((latitude) =>
    longitudes.map((longitude) => {
      const tileName = `ESA_WorldCover_10m_2021_v200_${worldCoverLatToken(latitude)}${worldCoverLonToken(longitude)}_Map.tif`;
      return `${sources.worldcoverBase}/${tileName}`;
    }),
  );
}

async function filterReachableUrls(urls) {
  const reachable = [];

  for (const url of urls) {
    try {
      const headResponse = await fetch(url, { method: "HEAD" });

      if (headResponse.ok) {
        reachable.push(url);
        continue;
      }
    } catch {
      // Fall through to GET probe.
    }

    try {
      const getResponse = await fetch(url, {
        method: "GET",
        headers: {
          Range: "bytes=0-0",
        },
      });

      if (getResponse.ok) {
        if (getResponse.body) {
          await getResponse.body.cancel();
        }
        reachable.push(url);
      }
    } catch {
      // Ignore and continue.
    }
  }

  return reachable;
}

async function ensureBoundarySources() {
  const adm0Metadata = await fetchJsonWithCache("geoboundaries/adm0-metadata", sources.adm0Api);
  const adm1Metadata = await fetchJsonWithCache("geoboundaries/adm1-metadata", sources.adm1Api);
  const adm0Url =
    adm0Metadata.payload?.simplifiedGeometryGeoJSON ?? adm0Metadata.payload?.gjDownloadURL;
  const adm1Url =
    adm1Metadata.payload?.simplifiedGeometryGeoJSON ?? adm1Metadata.payload?.gjDownloadURL;

  if (!adm0Url || !adm1Url) {
    throw new Error("GeoBoundaries metadata did not include geometry download URLs.");
  }

  const adm0Geometry = await fetchJsonWithCache("geoboundaries/adm0-geometry", adm0Url);
  const adm1Geometry = await fetchJsonWithCache("geoboundaries/adm1-geometry", adm1Url);

  const theaterPath = rawPathFor("theater-boundary", ".geojson");
  const oblastPath = rawPathFor("oblast-boundaries", ".geojson");
  await mkdir(path.dirname(theaterPath), { recursive: true });
  await mkdir(path.dirname(oblastPath), { recursive: true });
  await writeFile(theaterPath, JSON.stringify(adm0Geometry.payload, null, 2), "utf8");
  await writeFile(oblastPath, JSON.stringify(adm1Geometry.payload, null, 2), "utf8");
  console.log(`prepared   theater-boundary -> ${theaterPath}`);
  console.log(`prepared   oblast-boundaries -> ${oblastPath}`);
}

async function ensureOsmExtract() {
  const cacheKey = "osm/geofabrik/ukraine-latest";
  const relativePath = "osm/ukraine-latest.osm.pbf";
  const cachedBinary = await readCachedBinary(cacheKey, relativePath);
  const cachedPath = cacheBinaryPath(relativePath);

  if (!cachedBinary) {
    console.log(`cache miss ${cacheKey}`);
    await downloadBinaryToFile(sources.osmExtract, cachedPath);
    await writeCachedBinary(cacheKey, relativePath, {
      sourceUrl: sources.osmExtract,
    });
  } else {
    console.log(`cache hit  ${cacheKey}`);
  }

  const targetPath = rawPathFor("osm-extract", ".pbf");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(cachedPath, targetPath);
  console.log(`prepared   osm-extract -> ${targetPath}`);
}

async function ensureElevationSource() {
  const scriptPath = path.join(repoRoot, "scripts", "layers", "fetch-public-layers.mjs");

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, "--elevation-only", "--skip-hillshade"], {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Elevation acquisition exited with code ${code}`));
    });

    child.on("error", reject);
  });

  const targetPath = rawPathFor("elevation", ".tif");

  if (!existsSync(targetPath)) {
    throw new Error(`Expected elevation source missing after acquisition: ${targetPath}`);
  }

  console.log(`prepared   elevation -> ${targetPath}`);
}

async function ensureLandcoverSource() {
  const gdalwarpAvailable = await commandExists(gdalTools.warp);

  if (!gdalwarpAvailable) {
    throw new Error("`gdalwarp` is required to prepare the landcover raster.");
  }

  const cacheKey = "landcover/worldcover/theater-extent";
  const relativePath = "landcover/worldcover-ukraine-theater-extent.tif";
  const cachedBinary = await readCachedBinary(cacheKey, relativePath);
  const cachedPath = cacheBinaryPath(relativePath);

  if (!cachedBinary) {
    console.log(`cache miss ${cacheKey}`);
    await mkdir(path.dirname(cachedPath), { recursive: true });
    const tileUrls = await filterReachableUrls(buildWorldCoverTileUrls());

    if (tileUrls.length === 0) {
      throw new Error("No reachable ESA WorldCover tiles for theater extent.");
    }

    await runCommand(gdalTools.warp, [
      "-t_srs",
      "EPSG:4326",
      "-r",
      "near",
      "-dstnodata",
      "0",
      "-te",
      String(theaterBbox.west),
      String(theaterBbox.south),
      String(theaterBbox.east),
      String(theaterBbox.north),
      ...tileUrls,
      cachedPath,
      "-multi",
    ]);

    await writeCachedBinary(cacheKey, relativePath, {
      sourceUrl: sources.worldcoverBase,
      tileCount: tileUrls.length,
      tiles: tileUrls,
    });
  } else {
    console.log(`cache hit  ${cacheKey}`);
  }

  const targetPath = rawPathFor("landcover", ".tif");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(cachedPath, targetPath);
  console.log(`prepared   landcover -> ${targetPath}`);
}

async function writeBootstrapReport(results) {
  const reportPath = path.join(rawRoot, "intake-bootstrap.report.json");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        theaterBbox,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`wrote      intake report -> ${reportPath}`);
}

async function main() {
  await mkdir(rawRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });

  const results = [];

  if (!skipFlags.has("--skip-boundaries")) {
    await ensureBoundarySources();
    results.push({ id: "theater-boundary", status: "prepared" });
    results.push({ id: "oblast-boundaries", status: "prepared" });
  } else {
    results.push({ id: "theater-boundary", status: "skipped" });
    results.push({ id: "oblast-boundaries", status: "skipped" });
  }

  if (!skipFlags.has("--skip-osm")) {
    await ensureOsmExtract();
    results.push({ id: "osm-extract", status: "prepared" });
  } else {
    results.push({ id: "osm-extract", status: "skipped" });
  }

  if (!skipFlags.has("--skip-elevation")) {
    await ensureElevationSource();
    results.push({ id: "elevation", status: "prepared" });
  } else {
    results.push({ id: "elevation", status: "skipped" });
  }

  if (!skipFlags.has("--skip-landcover")) {
    await ensureLandcoverSource();
    results.push({ id: "landcover", status: "prepared" });
  } else {
    results.push({ id: "landcover", status: "skipped" });
  }

  await writeBootstrapReport(results);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
