import { access, copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import polygonClipping from "polygon-clipping";
import {
  buildSettlementVoronoiLayer,
  settlementVoronoiCatalogEntry,
} from "./settlement-voronoi.mjs";

/*
 * Public fallback layer builder and cache utility.
 *
 * What this script does:
 * - Downloads a minimal public-source layer set for the map when the full local GIS pipeline is unavailable.
 * - Caches upstream JSON responses under `data/cache/public-sources` so reruns reuse them for up to one year.
 * - Builds processed layer outputs under `data/processed/layers` and rewrites `data/processed/layers.json`.
 *
 * Main remote inputs:
 * - GeoBoundaries metadata and geometry for Ukraine ADM0 and ADM1 boundaries.
 * - Natural Earth GeoJSON for rivers, lakes, seas, roads, and railways.
 * - Natural Earth GeoJSON for rivers, lakes, seas, roads, railways, and urban areas.
 * - Overpass API results for settlements and tiled polygon pulls for forests and wetlands.
 *
 * Main outputs:
 * - `data/processed/layers/theater-boundary.geojson`
 * - `data/processed/layers/oblast-boundaries.geojson`
 * - `data/processed/layers/rivers.geojson`
 * - `data/processed/layers/water-bodies.geojson`
 * - `data/processed/layers/water-bodies-osm-prototype.geojson`
 * - `data/processed/layers/seas.geojson`
 * - `data/processed/layers/wetlands.geojson`
 * - `data/processed/layers/forests.geojson`
 * - `data/processed/layers/roads.geojson`
 * - `data/processed/layers/railways.geojson`
 * - `data/processed/layers/major-city-urban-areas.geojson`
 * - `data/processed/layers/settlements.geojson`
 * - `data/processed/terrain/elevation-clipped.tif` (when GDAL tools are available)
 * - `data/processed/terrain/hillshade-clipped.tif` (when GDAL tools are available)
 * - `data/processed/terrain/hillshade-clipped.png` (when GDAL tools are available)
 * - `data/raw/terrain/ukraine-elevation.tif` (when GDAL tools are available)
 * - `data/processed/layers.json`
 *
 * Default invocation:
 * - `node scripts/layers/fetch-public-layers.mjs`
 *   Builds all public fallback layers, using cache entries when available and valid.
 *
 * Cache control:
 * - `--refresh`
 *   Ignores all cache entries for this run and rewrites them from remote sources.
 * - `--refresh=<target[,target...]>`
 *   Refreshes only selected cache groups or keys.
 *   Examples:
 *   - `--refresh=natural-earth`
 *   - `--refresh=geoboundaries,overpass/settlements`
 *   - `--refresh=forests`
 *
 * Inspection and smoke tests:
 * - `--cache-report`
 *   Prints every known cache key with status, schema version, cached date, and remaining TTL.
 * - `--elevation-only`
 *   Runs only cached elevation+hillshade acquisition (FABDEM 30m preferred, Copernicus GLO-30 fallback).
 * - `--skip-hillshade`
 *   Only valid with `--elevation-only`; stages elevation but skips hillshade generation.
 * - `--skip-elevation`
 *   Skips elevation/hillshade processing during the full public layer build (useful for quick vector-only refreshes).
 * - `--workers=<n>`
 *   Bounded concurrency for expensive independent stages (tile fetching and local PBF extraction); defaults to a safe value based on available CPU.
 * - `--smoke-test=static`
 *   Fetches only the static GeoBoundaries and Natural Earth sources, mainly to validate cache behavior quickly.
 * - `--smoke-test=settlements`
 *   Fetches only the Overpass settlements payload, mainly to validate cached POST requests and Overpass fallback.
 * - `--smoke-test=wetlands`
 *   Fetches only the tiled Overpass wetland payloads, mainly to populate or validate that cache slice.
 * - `--smoke-test=forests`
 *   Fetches only the tiled Overpass forest payloads, mainly to populate or validate that cache slice.
 * - `--smoke-test=water-bodies`
 *   Fetches only tiled Overpass water-body polygons used for OSM prototype comparison.
 *
 * Cache invalidation rules:
 * - Entries expire after `cacheTtlMs`.
 * - Entries are also ignored when `cacheSchemaVersion` changes.
 * - Cache entries are wrapped as `{ version, cachedAt, data }`.
 *
 * Internal structure:
 * - Path and cache constants define repository locations and source endpoints.
 * - Cache helpers decide whether to use, read, write, or report cached payloads.
 * - Geometry helpers filter and simplify source data into map-ready GeoJSON.
 * - `main()` dispatches into report mode, smoke-test mode, or the full layer build.
 */

// Resolve repository-relative paths once so the script can be run from any cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cacheRoot = path.join(repoRoot, "data", "cache", "public-sources");
const rawRoot = path.join(repoRoot, "data", "raw");
const processedRoot = path.join(repoRoot, "data", "processed");
const layersRoot = path.join(processedRoot, "layers");
// Cached source responses stay reusable for up to one year unless explicitly refreshed.
const cacheTtlMs = 365 * 24 * 60 * 60 * 1000;
// Bump this when the cache file wrapper or payload assumptions change to invalidate old entries.
const cacheSchemaVersion = 1;

// The public fallback build is clipped to a fixed Ukraine theater envelope.
const theaterBbox = {
  west: 22.0,
  south: 44.0,
  east: 40.5,
  north: 52.5,
};

// Stable remote sources used to assemble a visible fallback map without local GIS inputs.
const sources = {
  adm0Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM0/",
  adm1Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM1/",
  adm2Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM2/",
  adm2LocalGeoJson: path.join(cacheRoot, "gadm41_UKR_ADM2.geojson"),
  overpassApi: "https://overpass-api.de/api/interpreter",
  terrainOverpassApi: "https://overpass.kumi.systems/api/interpreter",
  overpassFallbackApi: "https://lz4.overpass-api.de/api/interpreter",
  rivers:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
  lakes:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
  seas:
    "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_10m_geography_marine_polys.geojson",
  roads:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson",
  railways:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson",
  countries:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
  countryBoundaryLines:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_boundary_lines_land.geojson",
  urbanAreas:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas_landscan.geojson",
  fabdemTileIndex:
    "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/FABDEM_v1-2_tiles.geojson",
  fabdemBase:
    "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn",
  copernicusBase: "https://copernicus-dem-30m.s3.amazonaws.com",
};

const gdalTools = {
  warp: "gdalwarp",
  dem: "gdaldem",
  translate: "gdal_translate",
  tiles: "gdal2tiles.exe",
  ogr2ogr: "ogr2ogr",
  locationInfo: "gdallocationinfo",
};
const hillshadeTileSize = 1024;
const hillshadeTileZoomRange = "4-10";

const gdalCommandNames = new Set(Object.values(gdalTools));
const osgeoBinDir = process.env.OSGEO4W_BIN ?? "C:\\OSGeo4W\\bin";
const osgeoRootDir = path.dirname(osgeoBinDir);
const gdalDataCandidates = [
  path.join(osgeoRootDir, "apps", "gdal", "share", "gdal"),
  path.join(osgeoRootDir, "share", "gdal"),
];
const projLibCandidates = [
  path.join(osgeoRootDir, "share", "proj"),
  path.join(osgeoRootDir, "apps", "proj", "share", "proj"),
  path.join(osgeoRootDir, "apps", "proj", "projlib"),
];

function pickExistingPath(candidates) {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function commandEnv(command) {
  const baseEnv = { ...process.env };
  if (process.platform !== "win32" || !gdalCommandNames.has(command)) {
    return baseEnv;
  }

  const gdalData = baseEnv.GDAL_DATA ?? pickExistingPath(gdalDataCandidates);
  const projLib = baseEnv.PROJ_LIB ?? pickExistingPath(projLibCandidates);
  const pathSeparator = process.platform === "win32" ? ";" : ":";

  return {
    ...baseEnv,
    PATH: `${osgeoBinDir}${pathSeparator}${baseEnv.PATH ?? ""}`,
    GDAL_DATA: gdalData ?? baseEnv.GDAL_DATA,
    PROJ_LIB: projLib ?? baseEnv.PROJ_LIB,
  };
}

function resolveCommand(command) {
  if (process.platform !== "win32" || !gdalCommandNames.has(command)) {
    return command;
  }

  const explicitName = command.toLowerCase().endsWith(".py") || command.toLowerCase().endsWith(".exe")
    ? command
    : `${command}.exe`;
  const candidates = [
    path.join(osgeoBinDir, explicitName),
    path.join(osgeoRootDir, "apps", "Python312", "Scripts", explicitName),
    path.join(osgeoRootDir, "apps", "gdal-dev", "Scripts", explicitName),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ?? command;
}

// Fallback populations for the 50 largest Ukrainian urban areas, used only when OSM settlement records omit population.
// Source trail for refreshing this table:
// 1. Start with the GeoNames "largest cities in Ukraine" listing:
//    https://www.geonames.org/UA/largest-cities-in-ukraine.html
// 2. If a city is still missing or the naming differs, check the GeoNames export datasets next:
//    https://download.geonames.org/export/dump/
// 3. These values only need to be refreshed into the local fallback table occasionally; normal public layer
//    builds should keep reading the checked-in fallback values instead of repopulating them on every run.
const topUkraineCityPopulationFallbacks = [
  { population: 2614581, aliases: ["kyiv", "київ", "kiev"] },
  { population: 1308892, aliases: ["kharkiv", "харків", "kharkov"] },
  { population: 899157, aliases: ["odesa", "одеса", "odessa"] },
  { population: 792115, aliases: ["dnipro", "дніпро", "dnepr", "dnipropetrovsk"] },
  { population: 705832, aliases: ["donetsk", "донецьк", "донецк"] },
  { population: 627280, aliases: ["lviv", "львів", "lvov"] },
  { population: 566844, aliases: ["zaporizhzhia", "запоріжжя", "zaporozhye", "zaporizhzhya"] },
  { population: 477940, aliases: ["kryvyi rih", "кривий ріг", "krivoy rog", "kryvyy rih"] },
  { population: 419484, aliases: ["mykolaiv", "миколаїв", "nikolaev", "mykolayiv"] },
  { population: 375504, aliases: ["mariupol", "маріуполь", "mariupol’"] },
  { population: 363466, aliases: ["vinnytsia", "вінниця", "vinnitsa"] },
  { population: 354296, aliases: ["luhansk", "луганськ", "lugansk"] },
  { population: 294735, aliases: ["simferopol", "сімферополь", "сімферопіль", "simferopol’"] },
  { population: 257682, aliases: ["kherson", "херсон"] },
  { population: 248683, aliases: ["cherkasy", "черкаси", "cherкассы"] },
  { population: 244882, aliases: ["chernihiv", "чернігів", "chernigov"] },
  { population: 242753, aliases: ["poltava", "полтава"] },
  { population: 242022, aliases: ["khmelnytskyi", "хмельницький", "khmelnitskyi", "khmelnitskiy"] },
  { population: 234228, aliases: ["ivano-frankivsk", "івано-франківськ", "ivano frankivsk"] },
  { population: 234032, aliases: ["chernivtsi", "чернівці", "chernovtsy"] },
  { population: 226028, aliases: ["sevastopol", "севастополь", "sebastopol"] },
  { population: 225363, aliases: ["zhytomyr", "житомир", "zhitomir"] },
  { population: 222927, aliases: ["rivne", "рівне", "rovno"] },
  { population: 209014, aliases: ["lutsk", "луцьк"] },
  { population: 200894, aliases: ["kropyvnytskyi", "кропивницький", "kirovohrad", "kirovograd"] },
  { population: 200425, aliases: ["makiivka", "макіївка", "makeyevka"] },
  { population: 193565, aliases: ["ternopil", "тернопіль", "ternopol"] },
  { population: 192645, aliases: ["kamianske", "кам’янське", "камянське", "dniprodzerzhynsk"] },
  { population: 191217, aliases: ["bila tserkva", "біла церква", "belaya tserkov"] },
  { population: 189130, aliases: ["sumy", "суми"] },
  { population: 157847, aliases: ["alchevsk", "алчевськ", "alchevs’k"] },
  { population: 151814, aliases: ["horlivka", "горлівка", "gorlovka"] },
  { population: 130974, aliases: ["kremenchuk", "кременчук"] },
  { population: 126945, aliases: ["uzhhorod", "ужгород", "uzhgorod"] },
  { population: 122344, aliases: ["brovary", "бровари"] },
  { population: 104383, aliases: ["nikopol", "нікополь"] },
  { population: 102818, aliases: ["kramatorsk", "краматорськ"] },
  { population: 94511, aliases: ["pishchane", "піщане"] },
  { population: 94476, aliases: ["sloviansk", "слов’янськ", "slavyansk"] },
  { population: 92933, aliases: ["yevpatoriya", "євпаторія", "yevpatoriya", "evpatoriya"] },
  { population: 90861, aliases: ["kamianets-podilskyi", "кам’янець-подільський", "kamianets podilskyi", "kamenets-podolskiy"] },
  { population: 88468, aliases: ["sievierodonetsk", "сєвєродонецьк", "severodonetsk"] },
  { population: 87071, aliases: ["drohobych", "дрогобич", "drogobych"] },
  { population: 85914, aliases: ["oleksandriia", "олександрія", "alexandriya"] },
  { population: 84764, aliases: ["khartsyzk", "харцизьк", "khartsyzsk"] },
  { population: 82456, aliases: ["pavlohrad", "павлоград", "pavlograd"] },
  { population: 79826, aliases: ["kerch", "керч", "kerch’"] },
  { population: 78952, aliases: ["brianka", "брянка", "bryanka"] },
  { population: 76412, aliases: ["uman", "умань"] },
  { population: 75307, aliases: ["stryi", "стрий", "stryj"] },
  { population: 183105, aliases: ["oradea"] },
  { population: 144307, aliases: ["bacau", "bacău", "бакеу"] },
  { population: 125000, aliases: ["balti", "bălți", "бельці"] },
  { population: 123738, aliases: ["baia mare"] },
  { population: 102411, aliases: ["satu mare"] },
  { population: 92392, aliases: ["suceava"] },
  { population: 78776, aliases: ["bistrita", "bistrița"] },
  { population: 73914, aliases: ["tulcea"] },
  { population: 56373, aliases: ["zalau", "zalău"] },
  { population: 56006, aliases: ["sepsiszentgyorgy", "sepsiszentgyörgy", "sfantu gheorghe", "sfântu gheorghe"] },
  { population: 55455, aliases: ["ribnita", "rîbnița", "рибницька міська рада"] },
  { population: 50713, aliases: ["roman"] },
  { population: 47144, aliases: ["turda"] },
  { population: 45891, aliases: ["slobozia"] },
  { population: 39761, aliases: ["medias", "mediaș"] },
  { population: 39719, aliases: ["adjud"] },
  { population: 39284, aliases: ["medgidia"] },
  { population: 37631, aliases: ["miercurea ciuc"] },
  { population: 34871, aliases: ["tecuci"] },
  { population: 34668, aliases: ["onesti", "onești"] },
  { population: 34492, aliases: ["cahul"] },
  { population: 22911, aliases: ["comrat"] },
  { population: 34257, aliases: ["odorheiu secuiesc"] },
  { population: 33107, aliases: ["dej"] },
  { population: 23741, aliases: ["dorohoi"] },
  { population: 32847, aliases: ["pascani", "pașcani"] },
  { population: 30800, aliases: ["sacele", "săcele"] },
  { population: 28688, aliases: ["reghin"] },
  { population: 28593, aliases: ["campina", "câmpina"] },
  { population: 26847, aliases: ["husi", "huși"] },
  { population: 25723, aliases: ["falticeni", "fălticeni"] },
  { population: 24822, aliases: ["oltenita", "oltenița"] },
  { population: 23254, aliases: ["dubasari", "dubăsari", "дубосарська міська рада"] },
  { population: 22781, aliases: ["aiud"] },
  { population: 22122, aliases: ["campia turzii", "câmpia turzii"] },
  { population: 22075, aliases: ["tarnaveni", "târnăveni"] },
  { population: 21678, aliases: ["moinesti", "moinești"] },
  { population: 20830, aliases: ["blaj"] },
  { population: 20482, aliases: ["gherla"] },
  { population: 18700, aliases: ["straseni", "strășeni"] },
  { population: 18000, aliases: ["targu secuiesc", "târgu secuiesc"] },
  { population: 17666, aliases: ["gheorgheni"] },
  { population: 16600, aliases: ["ceadir lunga", "ceadîr lunga"] },
  { population: 15871, aliases: ["marghita"] },
  { population: 15859, aliases: ["urziceni"] },
  { population: 15100, aliases: ["hincesti", "hîncești"] },
  { population: 15078, aliases: ["edinet", "edineț"] },
  { population: 13300, aliases: ["toplita", "toplița"] },
  { population: 9942, aliases: ["beius", "beiuș"] },
];

const topUkraineCityPopulationFallbackLookup = new Map(
  topUkraineCityPopulationFallbacks.flatMap((entry) =>
    entry.aliases.map((alias) => [alias, entry.population]),
  ),
);

// Optional CLI refresh targets let callers invalidate part of the cache or all of it.
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
          .map((value) => value.trim())
          .filter(Boolean);
      }

      return [];
    }),
);

// Smoke tests limit execution to a small subset of fetches so cache behavior can be verified quickly.
const smokeTestMode =
  process.argv.find((argument) => argument.startsWith("--smoke-test="))
    ?.slice("--smoke-test=".length) ?? null;
const cacheReportMode = process.argv.includes("--cache-report");
const elevationOnlyMode = process.argv.includes("--elevation-only");
const skipHillshadeMode = process.argv.includes("--skip-hillshade");
const skipElevationMode = process.argv.includes("--skip-elevation");
const requestedWorkerCount = process.argv
  .find((argument) => argument.startsWith("--workers="))
  ?.slice("--workers=".length);

function detectCpuParallelism() {
  if (typeof os.availableParallelism === "function") {
    const detected = os.availableParallelism();
    return Number.isFinite(detected) && detected > 0 ? detected : 1;
  }

  const cpuCount = os.cpus()?.length ?? 1;
  return Number.isFinite(cpuCount) && cpuCount > 0 ? cpuCount : 1;
}

function resolveWorkerConcurrency(requested) {
  const cpuParallelism = detectCpuParallelism();
  const safeDefault = Math.max(1, Math.min(8, cpuParallelism - 1));

  if (requested === undefined) {
    return safeDefault;
  }

  const parsed = Number.parseInt(requested, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    console.warn(`Ignoring invalid --workers value "${requested}". Using ${safeDefault}.`);
    return safeDefault;
  }

  return Math.max(1, Math.min(parsed, cpuParallelism));
}

const workerConcurrency = resolveWorkerConcurrency(requestedWorkerCount);
const tileFetchConcurrency = Math.max(1, Math.min(workerConcurrency, 4));

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

// Shared empty fallback for layers that may intentionally produce no features.
function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

// Decide whether a cache entry should be bypassed for the current run.
function shouldRefresh(cacheKey) {
  if (refreshTargets.has("all")) {
    return true;
  }

  const segments = cacheKey.split("/");
  return segments.some((segment) => refreshTargets.has(segment)) || refreshTargets.has(cacheKey);
}

// Map logical cache keys to on-disk JSON files inside the public cache tree.
function cachePathForKey(cacheKey) {
  return path.join(cacheRoot, `${cacheKey}.json`);
}

function cachePathForBinary(relativePath) {
  return path.join(cacheRoot, relativePath);
}

// Define the full set of cache keys this script may populate for reporting and refresh targeting.
function getKnownCacheKeys() {
  const tiledLayerKeys = ["forests", "wetlands", "water-bodies"].flatMap((layerId) =>
    buildBboxGrid(theaterBbox, 3, 3).map((_, tileIndex) => `overpass/${layerId}/tile-${tileIndex}`),
  );

  return [
    "geoboundaries/adm0-metadata",
    "geoboundaries/adm1-metadata",
    "geoboundaries/adm2-metadata",
    "geoboundaries/adm0-geometry",
    "geoboundaries/adm1-geometry",
    "geoboundaries/adm2-geometry",
    "natural-earth/rivers",
    "natural-earth/lakes",
    "natural-earth/seas",
    "natural-earth/roads",
    "natural-earth/railways",
    "natural-earth/countries",
    "natural-earth/country-boundary-lines",
    "natural-earth/urban-areas",
    "overpass/settlements",
    "osm/rivers/pbf-lines",
    "osm/water-bodies/pbf-extract",
    "elevation/fabdem/index",
    "elevation/fabdem/theater-extent",
    "elevation/copernicus/theater-extent",
    "elevation/selected-source",
    ...tiledLayerKeys,
  ];
}

// Format a millisecond duration into a compact day/hour string for cache reports.
function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "n/a";
  }

  if (ms <= 0) {
    return "expired";
  }

  const totalHours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${hours}h`;
}

function formatElapsedMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "n/a";
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

// Inspect a cache file without applying read-time cache-hit logging side effects.
async function describeCacheEntry(cacheKey) {
  try {
    const contents = await readFile(cachePathForKey(cacheKey), "utf8");
    const parsed = JSON.parse(contents);
    const cachedAt = typeof parsed?.cachedAt === "string" ? Date.parse(parsed.cachedAt) : Number.NaN;
    const ageMs = Number.isFinite(cachedAt) ? Date.now() - cachedAt : Number.NaN;
    const ttlRemainingMs = Number.isFinite(ageMs) ? cacheTtlMs - ageMs : Number.NaN;
    const schemaMatches = parsed?.version === cacheSchemaVersion;
    const expired = !Number.isFinite(cachedAt) || ttlRemainingMs <= 0;

    return {
      cacheKey,
      exists: true,
      version: parsed?.version ?? "n/a",
      cachedAt: typeof parsed?.cachedAt === "string" ? parsed.cachedAt : "n/a",
      ttlRemaining: formatDuration(ttlRemainingMs),
      status: schemaMatches ? (expired ? "expired" : "ready") : "schema-mismatch",
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        cacheKey,
        exists: false,
        version: "n/a",
        cachedAt: "n/a",
        ttlRemaining: "n/a",
        status: "missing",
      };
    }

    throw error;
  }
}

function runCommand(command, args) {
  const resolvedCommand = resolveCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      stdio: "inherit",
      shell: false,
      env: commandEnv(command),
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

function runCommandCapture(command, args) {
  const resolvedCommand = resolveCommand(command);

  return new Promise((resolve, reject) => {
    const child = spawn(resolvedCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: commandEnv(command),
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });

    child.on("error", reject);
  });
}

function runCommandWithExitCode(command, args) {
  const resolvedCommand = resolveCommand(command);

  return new Promise((resolve) => {
    const child = spawn(resolvedCommand, args, {
      stdio: "ignore",
      shell: false,
      env: commandEnv(command),
    });

    child.on("exit", (code) => {
      resolve(code === 0);
    });

    child.on("error", () => resolve(false));
  });
}

async function hasWorkingProjRuntime() {
  const projInfoPath = process.platform === "win32"
    ? path.join(osgeoBinDir, "projinfo.exe")
    : "projinfo";
  const command = existsSync(projInfoPath) ? projInfoPath : "projinfo";

  return runCommandWithExitCode(command, ["EPSG:3857"]);
}

async function commandExists(command) {
  if (process.platform === "win32" && gdalCommandNames.has(command)) {
    const explicitName = command.toLowerCase().endsWith(".py") || command.toLowerCase().endsWith(".exe")
      ? command
      : `${command}.exe`;
    const candidates = [
      path.join(osgeoBinDir, explicitName),
      path.join(osgeoRootDir, "apps", "Python312", "Scripts", explicitName),
      path.join(osgeoRootDir, "apps", "gdal-dev", "Scripts", explicitName),
    ];

    if (candidates.some((candidate) => existsSync(candidate))) {
      return true;
    }
  }

  const locatorCommand = process.platform === "win32" ? "where" : "which";

  return new Promise((resolve) => {
    const child = spawn(locatorCommand, [command], {
      stdio: "ignore",
      shell: false,
    });

    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

// Read a cached response wrapper, enforcing schema compatibility and TTL.
async function readCachedJson(cacheKey) {
  try {
    const contents = await readFile(cachePathForKey(cacheKey), "utf8");
    const parsed = JSON.parse(contents);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== cacheSchemaVersion ||
      typeof parsed.cachedAt !== "string" ||
      !("data" in parsed)
    ) {
      console.log(`cache skip ${cacheKey} (schema mismatch)`);
      return null;
    }

    const cachedAt = Date.parse(parsed.cachedAt);

    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > cacheTtlMs) {
      console.log(`cache skip ${cacheKey} (expired)`);
      return null;
    }

    console.log(`cache hit  ${cacheKey}`);
    return parsed.data;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

// Persist a response using a small wrapper so TTL and schema checks can be enforced later.
async function writeCachedJson(cacheKey, data) {
  const cachePath = cachePathForKey(cacheKey);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({
    version: cacheSchemaVersion,
    cachedAt: new Date().toISOString(),
    data,
  }, null, 2), "utf8");
}

async function readCachedBinary(cacheKey) {
  const metadata = await readCachedJson(cacheKey);

  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const relativePath = metadata.relativePath;

  if (typeof relativePath !== "string" || !relativePath) {
    console.log(`cache skip ${cacheKey} (missing binary path)`);
    return null;
  }

  const absolutePath = cachePathForBinary(relativePath);

  try {
    await access(absolutePath);
    return {
      ...metadata,
      absolutePath,
      relativePath,
    };
  } catch {
    console.log(`cache skip ${cacheKey} (missing binary file)`);
    return null;
  }
}

async function writeCachedBinary(cacheKey, relativePath, metadata = {}) {
  await writeCachedJson(cacheKey, {
    ...metadata,
    relativePath,
  });
}

// Fetch JSON from a remote source, using the local cache unless this key was refreshed.
async function fetchJsonWithCache(cacheKey, url, init) {
  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedJson(cacheKey);

    if (cached !== null) {
      return cached;
    }
  }

  console.log(`fetch      ${cacheKey}`);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const data = await response.json();
  await writeCachedJson(cacheKey, data);
  return data;
}

// Convenience wrapper for cache-backed GET requests.
async function fetchJson(url, cacheKey) {
  return fetchJsonWithCache(cacheKey, url);
}

async function readLocalGeoJson(filePath, sourceLabel) {
  const raw = await readFile(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse ${sourceLabel}: ${error.message}`);
  }
}

// Fetch the settlement query through the shared Overpass fallback and cache path.
async function fetchOverpassJson(query) {
  return fetchOverpassJsonWithFallback(
    [sources.overpassApi, sources.overpassFallbackApi, sources.terrainOverpassApi],
    query,
    "overpass/settlements",
  );
}

function geometryCoordinates(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates?.flat() ?? [];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates?.flat(2) ?? [];
  }

  return [];
}

function geometryExtent(geometry) {
  const coordinates = geometryCoordinates(geometry);

  if (coordinates.length === 0) {
    return null;
  }

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  if (!Number.isFinite(west)) {
    return null;
  }

  return { west, south, east, north };
}

function extentIntersects(left, right) {
  return !(
    left.east < right.west ||
    left.west > right.east ||
    left.north < right.south ||
    left.south > right.north
  );
}

function copernicusLatToken(value) {
  const direction = value >= 0 ? "N" : "S";
  const magnitude = String(Math.abs(value)).padStart(2, "0");
  return `${direction}${magnitude}_00`;
}

function copernicusLonToken(value) {
  const direction = value >= 0 ? "E" : "W";
  const magnitude = String(Math.abs(value)).padStart(3, "0");
  return `${direction}${magnitude}_00`;
}

function buildCopernicusTileUrls() {
  const latStart = Math.floor(theaterBbox.south);
  const latEnd = Math.ceil(theaterBbox.north) - 1;
  const lonStart = Math.floor(theaterBbox.west);
  const lonEnd = Math.ceil(theaterBbox.east) - 1;
  const urls = [];

  for (let latitude = latStart; latitude <= latEnd; latitude += 1) {
    for (let longitude = lonStart; longitude <= lonEnd; longitude += 1) {
      const tileBase = `Copernicus_DSM_COG_10_${copernicusLatToken(latitude)}_${copernicusLonToken(longitude)}_DEM`;
      urls.push(`${sources.copernicusBase}/${tileBase}/${tileBase}.tif`);
    }
  }

  return urls;
}

function buildFabdemTileEntries(tileIndex) {
  const entries = [];

  for (const feature of tileIndex.features ?? []) {
    const bounds = geometryExtent(feature.geometry);

    if (!bounds || !extentIntersects(bounds, theaterBbox)) {
      continue;
    }

    const fileName = feature.properties?.file_name;
    const zipfileName = feature.properties?.zipfile_name;

    if (typeof fileName !== "string" || typeof zipfileName !== "string") {
      continue;
    }

    const normalizedFileName = fileName.replace(
      /^([NS])0(\d{2}[EW]\d{3}_FABDEM_V1-2\.tif)$/i,
      "$1$2",
    );

    entries.push({
      fileName: normalizedFileName,
      zipfileName,
      zipUrl: `${sources.fabdemBase}/${zipfileName}`,
      inputPath: `/vsizip//vsicurl/${sources.fabdemBase}/${zipfileName}/${normalizedFileName}`,
    });
  }

  const unique = new Map();

  for (const entry of entries) {
    unique.set(`${entry.zipfileName}/${entry.fileName}`, entry);
  }

  return [...unique.values()];
}

async function filterReachableUrls(urls) {
  const reachable = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { method: "HEAD" });

      if (response.ok) {
        reachable.push(url);
      }
    } catch {
      // Ignore individual failures; only fail if all candidates are unreachable.
    }
  }

  return reachable;
}

async function ensureFabdemElevationCache() {
  const cacheKey = "elevation/fabdem/theater-extent";
  const relativePath = "elevation/fabdem/theater-extent.tif";

  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedBinary(cacheKey);

    if (cached) {
      return cached;
    }
  }

  const tileIndex = await fetchJson(sources.fabdemTileIndex, "elevation/fabdem/index");
  const tileEntries = buildFabdemTileEntries(tileIndex);

  if (tileEntries.length === 0) {
    throw new Error("No FABDEM tiles intersect the theater extent.");
  }

  const outputPath = cachePathForBinary(relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  await runCommand(gdalTools.warp, [
    ...tileEntries.map((entry) => entry.inputPath),
    outputPath,
    "-te",
    String(theaterBbox.west),
    String(theaterBbox.south),
    String(theaterBbox.east),
    String(theaterBbox.north),
    "-r",
    "bilinear",
    "-dstnodata",
    "0",
    "-overwrite",
    "-multi",
  ]);

  await writeCachedBinary(cacheKey, relativePath, {
    sourceId: "fabdem-30m",
    sourceLabel: "FABDEM 30m",
    tileCount: tileEntries.length,
    tiles: tileEntries.map((entry) => ({
      fileName: entry.fileName,
      zipfileName: entry.zipfileName,
      zipUrl: entry.zipUrl,
    })),
  });

  return readCachedBinary(cacheKey);
}

async function ensureCopernicusElevationCache() {
  const cacheKey = "elevation/copernicus/theater-extent";
  const relativePath = "elevation/copernicus/theater-extent.tif";

  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedBinary(cacheKey);

    if (cached) {
      return cached;
    }
  }

  const tileUrls = await filterReachableUrls(buildCopernicusTileUrls());

  if (tileUrls.length === 0) {
    throw new Error("No reachable Copernicus GLO-30 tiles for theater extent.");
  }
  const outputPath = cachePathForBinary(relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  await runCommand(gdalTools.warp, [
    ...tileUrls.map((url) => `/vsicurl/${url}`),
    outputPath,
    "-te",
    String(theaterBbox.west),
    String(theaterBbox.south),
    String(theaterBbox.east),
    String(theaterBbox.north),
    "-r",
    "bilinear",
    "-dstnodata",
    "0",
    "-overwrite",
    "-multi",
  ]);

  await writeCachedBinary(cacheKey, relativePath, {
    sourceId: "copernicus-glo-30",
    sourceLabel: "Copernicus GLO-30",
    tileCount: tileUrls.length,
    tiles: tileUrls,
  });

  return readCachedBinary(cacheKey);
}

async function ensureElevationOutputs() {
  const gdalwarpAvailable = await commandExists(gdalTools.warp);

  if (!gdalwarpAvailable) {
    throw new Error("`gdalwarp` is required for cached elevation acquisition.");
  }

  const terrainRoot = path.join(processedRoot, "terrain");
  const rawTerrainRoot = path.join(rawRoot, "terrain");
  await mkdir(terrainRoot, { recursive: true });
  await mkdir(rawTerrainRoot, { recursive: true });

  let selected = null;

  try {
    selected = await ensureFabdemElevationCache();
  } catch (error) {
    console.warn(`FABDEM acquisition failed (${error.message}). Falling back to Copernicus GLO-30.`);
    selected = await ensureCopernicusElevationCache();
  }

  if (!selected || typeof selected.absolutePath !== "string") {
    throw new Error("Elevation source selection failed.");
  }

  const processedElevationPath = path.join(terrainRoot, "elevation-clipped.tif");
  const rawElevationPath = path.join(rawTerrainRoot, "ukraine-elevation.tif");
  await copyFile(selected.absolutePath, processedElevationPath);
  await copyFile(selected.absolutePath, rawElevationPath);

  if (skipHillshadeMode) {
    return {
      hillshadeLayerPath: "terrain/hillshade-clipped.png",
    };
  }

  const gdaldemAvailable = await commandExists(gdalTools.dem);
  const gdalTranslateAvailable = await commandExists(gdalTools.translate);
  let gdalTilesAvailable = await commandExists(gdalTools.tiles);

  if (!gdaldemAvailable || !gdalTranslateAvailable) {
    throw new Error("`gdaldem` and `gdal_translate` are required for hillshade generation.");
  }

  const hillshadeTifPath = path.join(terrainRoot, "hillshade-clipped.tif");
  const hillshadePngPath = path.join(terrainRoot, "hillshade-clipped.png");
  const hillshadeTilesPath = path.join(terrainRoot, "hillshade-tiles");
  let hillshadeLayerPath = "terrain/hillshade-clipped.png";

  await runCommand(gdalTools.dem, [
    "hillshade",
    processedElevationPath,
    hillshadeTifPath,
    "-z",
    "1.0",
    "-s",
    "111120",
    "-alt",
    "45",
    "-az",
    "315",
    "-compute_edges",
  ]);

  if (gdalTilesAvailable && !(await hasWorkingProjRuntime())) {
    gdalTilesAvailable = false;
    console.warn(
      "Skipping hillshade tile generation because PROJ runtime data is incompatible with installed GDAL/PROJ tools. " +
      "Use a fresh OSGeo4W install and point OSGEO4W_BIN to its bin directory.",
    );
  }

  if (gdalTilesAvailable) {
    try {
      await runCommand(gdalTools.tiles, [
        "--xyz",
        "--tilesize",
        String(hillshadeTileSize),
        "-z",
        hillshadeTileZoomRange,
        "-w",
        "none",
        hillshadeTifPath,
        hillshadeTilesPath,
      ]);
      hillshadeLayerPath = "terrain/hillshade-tiles/{z}/{x}/{y}.png";
    } catch (error) {
      console.warn(`Hillshade tile generation failed, using single-image fallback: ${error.message}`);
    }
  }

  await runCommand(gdalTools.translate, [
    "-of",
    "PNG",
    "-outsize",
    "4096",
    "0",
    hillshadeTifPath,
    hillshadePngPath,
  ]);

  await writeCachedJson("elevation/selected-source", {
    generatedAt: new Date().toISOString(),
    extent: theaterBbox,
    source: {
      sourceId: selected.sourceId ?? "unknown",
      sourceLabel: selected.sourceLabel ?? "unknown",
    },
    cacheKey: selected.sourceId === "fabdem-30m"
      ? "elevation/fabdem/theater-extent"
      : "elevation/copernicus/theater-extent",
  });

  await writeFile(
    path.join(rawTerrainRoot, "ukraine-elevation.source.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        extent: theaterBbox,
        selectedSource: {
          sourceId: selected.sourceId ?? "unknown",
          sourceLabel: selected.sourceLabel ?? "unknown",
          cacheRelativePath: selected.relativePath ?? null,
        },
        fallbackOrder: ["fabdem-30m", "copernicus-glo-30"],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    hillshadeLayerPath,
  };
}

function detectExistingHillshadeLayerPath() {
  const tiledRoot = path.join(processedRoot, "terrain", "hillshade-tiles");
  const pngFallback = "terrain/hillshade-clipped.png";

  if (!existsSync(path.join(processedRoot, pngFallback))) {
    return null;
  }

  if (existsSync(path.join(tiledRoot, "10"))) {
    return "terrain/hillshade-tiles/{z}/{x}/{y}.png";
  }

  return pngFallback;
}

// Try multiple Overpass endpoints until one succeeds, then cache the successful payload.
async function fetchOverpassJsonWithFallback(urls, query, cacheKey) {
  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedJson(cacheKey);

    if (cached !== null) {
      return cached;
    }
  }

  let lastError = null;

  for (const url of urls) {
    try {
      return await fetchJsonWithCache(cacheKey, url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: query,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to fetch Overpass data.");
}

// Query named populated places within the theater bounds for map labels and point analytics.
function overpassPlaceQuery(bbox) {
  return `
[out:json][timeout:180];
(
  node["place"~"city|town|village"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["place"~"city|town|village"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["place"~"city|town|village"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center tags;
`.trim();
}

// Query polygonal Overpass ways for thematic terrain layers over a tile bbox.
function overpassAreaQuery(selectors, bbox) {
  return `
[out:json][timeout:90];
(
${selectors.map((selector) => `  way${selector}(${bbox.south},${bbox.west},${bbox.north},${bbox.east});`).join("\n")}
${selectors.map((selector) => `  relation${selector}(${bbox.south},${bbox.west},${bbox.north},${bbox.east});`).join("\n")}
);
out tags geom;
`.trim();
}

// Keep only larger urban extents so the fill layer emphasizes major cities rather than every settlement patch.
function filterMajorCityUrbanAreas(featureCollection) {
  return {
    type: "FeatureCollection",
    features: featureCollection.features.filter((feature) => {
      const maxPopulation = Number(feature.properties?.max_pop_al ?? 0);
      return Number.isFinite(maxPopulation) && maxPopulation >= 200000;
    }),
  };
}

function detectLabelScript(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "latin";
  }

  return /[\u0400-\u04ff]/u.test(value) ? "cyrillic" : "latin";
}

function geometryPrimaryBounds(geometry) {
  const polygon = selectPrimaryPolygon(geometry);

  if (!polygon) {
    return null;
  }

  return polygonBounds(polygon);
}

function clampBoundsToBbox(bounds, bbox) {
  if (!bounds) {
    return null;
  }

  const minLng = Math.max(bounds.minLng, bbox.west);
  const maxLng = Math.min(bounds.maxLng, bbox.east);
  const minLat = Math.max(bounds.minLat, bbox.south);
  const maxLat = Math.min(bounds.maxLat, bbox.north);

  if (maxLng <= minLng || maxLat <= minLat) {
    return null;
  }

  return {
    minLng,
    maxLng,
    minLat,
    maxLat,
  };
}

function normalizeCountryNameProperties(feature) {
  const properties = feature.properties ?? {};
  const name =
    properties.NAME ??
    properties.ADMIN ??
    properties.NAME_EN ??
    properties.name ??
    null;
  const nameEn =
    properties.NAME_EN ??
    properties.NAME ??
    properties.ADMIN ??
    properties.name_en ??
    null;
  const nameUk =
    properties.NAME_UK ??
    properties.NAME_RU ??
    properties.NAME ??
    properties.ADMIN ??
    nameEn ??
    null;
  const labelCandidate = typeof nameUk === "string" && nameUk.trim() !== "" ? nameUk : nameEn;
  const polygon = selectPrimaryPolygon(feature.geometry);
  const rawBounds = geometryPrimaryBounds(feature.geometry);
  const inTheaterBounds = polygonBoundsWithinBbox(polygon, theaterBbox);
  const bounds = inTheaterBounds ?? clampBoundsToBbox(rawBounds, theaterBbox) ?? rawBounds;
  const labelWidthDeg = bounds ? Math.max(0, bounds.maxLng - bounds.minLng) : 0;
  const labelHeightDeg = bounds ? Math.max(0, bounds.maxLat - bounds.minLat) : 0;
  const labelCentroidLng = bounds ? bounds.minLng + labelWidthDeg / 2 : null;
  const labelCentroidLat = bounds ? bounds.minLat + labelHeightDeg / 2 : null;

  return {
    type: "Feature",
    properties: {
      ...properties,
      id:
        properties.ISO_A3_EH ??
        properties.ISO_A3 ??
        properties.ISO_A2_EH ??
        properties.ISO_A2 ??
        properties.SOV_A3 ??
        nameEn ??
        name ??
        "country",
      name,
      nameEn,
      nameUk,
      nameLabel: labelCandidate,
      labelScript: detectLabelScript(labelCandidate),
      labelWidthDeg,
      labelHeightDeg,
      labelCentroidLng,
      labelCentroidLat,
    },
    geometry: feature.geometry,
  };
}

function buildCountryBoundaryLayer(featureCollection) {
  return {
    type: "FeatureCollection",
    features: featureCollection.features
      .filter((feature) => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon")
      .map(normalizeCountryNameProperties),
  };
}

function ringArea(ring) {
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

function selectPrimaryPolygon(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPolygon") {
    const best = geometry.coordinates
      .map((polygon) => ({
        polygon,
        area: ringArea(polygon[0] ?? []),
      }))
      .sort((left, right) => right.area - left.area)[0];

    return best?.polygon ?? null;
  }

  return null;
}

function polygonBounds(polygon) {
  const outerRing = polygon?.[0] ?? [];

  return outerRing.reduce(
    (bounds, [lng, lat]) => ({
      minLng: Math.min(bounds.minLng, lng),
      maxLng: Math.max(bounds.maxLng, lng),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    },
  );
}

function polygonBoundsWithinBbox(polygon, bbox) {
  const outerRing = polygon?.[0] ?? [];
  const inBboxCoordinates = outerRing.filter(
    ([lng, lat]) =>
      lng >= bbox.west &&
      lng <= bbox.east &&
      lat >= bbox.south &&
      lat <= bbox.north,
  );

  if (inBboxCoordinates.length === 0) {
    return null;
  }

  return inBboxCoordinates.reduce(
    (bounds, [lng, lat]) => ({
      minLng: Math.min(bounds.minLng, lng),
      maxLng: Math.max(bounds.maxLng, lng),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLng: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    },
  );
}

function countryLabelInnerBox(countryId, bounds) {
  const width = bounds.maxLng - bounds.minLng;
  const height = bounds.maxLat - bounds.minLat;
  const defaults = { padX: 0.18, padY: 0.2 };
  const overrides = {
    UKR: { padX: 0.14, padY: 0.18 },
    BLR: { padX: 0.2, padY: 0.24 },
    RUS: { padX: 0.14, padY: 0.08 },
    BGR: { padX: 0.08, padY: 0.2 },
    POL: { padX: 0.16, padY: 0.22 },
    SVK: { padX: 0.16, padY: 0.22 },
    MDA: { padX: 0.22, padY: 0.24 },
    ROU: { padX: 0.2, padY: 0.22 },
  };
  const config = { ...defaults, ...(overrides[countryId] ?? {}) };
  const minLng = bounds.minLng + width * config.padX;
  const maxLng = bounds.maxLng - width * config.padX;
  const minLat = bounds.minLat + height * config.padY;
  const maxLat = bounds.maxLat - height * config.padY;

  return {
    minLng,
    maxLng,
    minLat,
    maxLat,
  };
}

function countryLabelAnchorFractions(countryId) {
  const anchors = {
    RUS: { x: 0.8, y: 0.91 },
    BGR: { x: 0.94, y: 0.46 },
    BLR: { x: 0.5, y: 0.45 },
    POL: { x: 0.55, y: 0.62 },
    SVK: { x: 0.55, y: 0.55 },
    MDA: { x: 0.52, y: 0.58 },
    ROU: { x: 0.4, y: 0.62 },
  };

  return anchors[countryId] ?? { x: 0.5, y: 0.55 };
}

function buildCountryLabelPointFeature(countryFeature) {
  const polygon = selectPrimaryPolygon(countryFeature.geometry);

  if (!polygon) {
    return null;
  }

  const fullBounds = polygonBounds(polygon);
  const inTheaterBounds = polygonBoundsWithinBbox(polygon, theaterBbox);
  const bounds = inTheaterBounds ?? clampBoundsToBbox(fullBounds, theaterBbox) ?? fullBounds;

  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.maxLng)) {
    return null;
  }

  const width = bounds.maxLng - bounds.minLng;
  const height = bounds.maxLat - bounds.minLat;

  if (width <= 0 || height <= 0) {
    return null;
  }

  const countryId = String(countryFeature.properties?.id ?? "");
  const innerBox = countryLabelInnerBox(countryId, bounds);

  if (
    innerBox.maxLng <= innerBox.minLng ||
    innerBox.maxLat <= innerBox.minLat
  ) {
    return null;
  }

  const innerWidth = innerBox.maxLng - innerBox.minLng;
  const innerHeight = innerBox.maxLat - innerBox.minLat;
  const anchor = countryLabelAnchorFractions(countryId);
  const longitude = innerBox.minLng + innerWidth * anchor.x;
  const latitude = innerBox.minLat + innerHeight * anchor.y;

  return {
    type: "Feature",
    properties: {
      ...countryFeature.properties,
    },
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
  };
}

function buildCountryLabelGuideLayer(countryBoundaryLayer) {
  return {
    type: "FeatureCollection",
    features: (countryBoundaryLayer.features ?? [])
      .map(buildCountryLabelPointFeature)
      .filter(Boolean),
  };
}

function firstStringProperty(properties, keys) {
  for (const key of keys) {
    const value = properties?.[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

function buildAdminLabelPointFeature(feature, options) {
  const {
    idFields,
    nameFields,
    padX = 0.2,
    padY = 0.2,
    anchorX = 0.5,
    anchorY = 0.55,
    stripSuffixPattern = null,
  } = options;
  const polygon = selectPrimaryPolygon(feature.geometry);

  if (!polygon) {
    return null;
  }

  const fullBounds = polygonBounds(polygon);
  const inTheaterBounds = polygonBoundsWithinBbox(polygon, theaterBbox);
  const bounds = inTheaterBounds ?? clampBoundsToBbox(fullBounds, theaterBbox) ?? fullBounds;
  const width = bounds.maxLng - bounds.minLng;
  const height = bounds.maxLat - bounds.minLat;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const minLng = bounds.minLng + width * padX;
  const maxLng = bounds.maxLng - width * padX;
  const minLat = bounds.minLat + height * padY;
  const maxLat = bounds.maxLat - height * padY;

  if (maxLng <= minLng || maxLat <= minLat) {
    return null;
  }

  const properties = feature.properties ?? {};
  const id =
    firstStringProperty(properties, idFields) ??
    String(properties.shapeID ?? properties.id ?? Math.random());
  const rawName = firstStringProperty(properties, nameFields);

  if (!rawName) {
    return null;
  }

  const nameLabel = stripSuffixPattern ? rawName.replace(stripSuffixPattern, "").trim() : rawName;
  const longitude = minLng + (maxLng - minLng) * anchorX;
  const latitude = minLat + (maxLat - minLat) * anchorY;

  return {
    type: "Feature",
    properties: {
      ...properties,
      id,
      nameLabel,
      labelScript: detectLabelScript(nameLabel),
    },
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
  };
}

function buildAdminLabelPointLayer(featureCollection, options) {
  return {
    type: "FeatureCollection",
    features: (featureCollection.features ?? [])
      .map((feature) => buildAdminLabelPointFeature(feature, options))
      .filter(Boolean),
  };
}

// Normalize inconsistent population tag formats into a numeric value when possible.
function normalizePopulation(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(value.replaceAll(" ", "").replaceAll(",", ""));
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

// Normalize city names into a lookup key that is resilient to case, punctuation, and accent differences.
function normalizeSettlementName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  return normalized === "" ? null : normalized;
}

// Fill missing city populations from a curated top-50 Ukraine city fallback table.
function resolveSettlementPopulation(place, population, nameUk, nameEn) {
  if (population !== null) {
    return population;
  }

  if (place !== "city") {
    return null;
  }

  for (const candidate of [nameUk, nameEn]) {
    const key = normalizeSettlementName(candidate);

    if (!key) {
      continue;
    }

    const fallbackPopulation = topUkraineCityPopulationFallbackLookup.get(key);

    if (fallbackPopulation) {
      return fallbackPopulation;
    }
  }

  return null;
}

// Sort place classes into a stable label and symbol priority order.
function placeRank(place) {
  switch (place) {
    case "city":
      return 1;
    case "town":
      return 2;
    case "village":
      return 3;
    case "hamlet":
      return 4;
    case "isolated_dwelling":
      return 5;
    default:
      return 6;
  }
}

// Order settlements by importance so downstream labeling uses the strongest candidates first.
function sortSettlements(features) {
  return [...features].sort((left, right) => {
    const leftRank = placeRank(left.properties.place);
    const rightRank = placeRank(right.properties.place);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (right.properties.population ?? 0) - (left.properties.population ?? 0);
  });
}

// Standard point-in-ring test used by the polygon containment helpers below.
function pointInRing(point, ring) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

// Determine whether a point falls inside a Polygon or MultiPolygon geometry.
function pointInPolygonGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates;
    return pointInRing(point, outerRing) && !holes.some((ring) => pointInRing(point, ring));
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonGeometry(point, { type: "Polygon", coordinates: polygon }),
    );
  }

  return false;
}

function toClipMultiPolygon(geometry) {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return null;
}

function fromClipMultiPolygon(clipGeometry) {
  const polygons = (clipGeometry ?? [])
    .map((polygon) =>
      polygon
        .map((ring) => closeRing(ring.map(([lng, lat]) => [Number(lng), Number(lat)])))
        .filter((ring) => ring.length >= 4),
    )
    .filter((polygon) => polygon.length > 0);

  if (polygons.length === 0) {
    return null;
  }

  if (polygons.length === 1) {
    return {
      type: "Polygon",
      coordinates: polygons[0],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons,
  };
}

function clipPolygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return 0;
  }

  const outerArea = ringArea(polygon[0] ?? []);
  const holeArea = polygon
    .slice(1)
    .reduce((sum, ring) => sum + ringArea(ring), 0);

  return Math.max(0, outerArea - holeArea);
}

function clipMultiPolygonArea(clipGeometry) {
  return (clipGeometry ?? []).reduce(
    (sum, polygon) => sum + clipPolygonArea(polygon),
    0,
  );
}

function geometryRepresentativePoint(geometry) {
  const bounds = geometryBounds(geometry);

  if (!Number.isFinite(bounds.west) || !Number.isFinite(bounds.east)) {
    return null;
  }

  return [
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  ];
}

function pointDistanceToGeometryKm(point, geometry) {
  if (pointInPolygonGeometry(point, geometry)) {
    return 0;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.reduce(
      (best, ring) => Math.min(best, minDistanceToRingKm(point, ring)),
      Number.POSITIVE_INFINITY,
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (best, polygon) =>
        Math.min(best, pointDistanceToGeometryKm(point, { type: "Polygon", coordinates: polygon })),
      Number.POSITIVE_INFINITY,
    );
  }

  return Number.POSITIVE_INFINITY;
}

function bestMatchingOblastForSubdivision(subdivisionFeature, oblastFeatures) {
  const subdivisionMultiPolygon = toClipMultiPolygon(subdivisionFeature.geometry);

  if (subdivisionMultiPolygon) {
    const overlapWinner = oblastFeatures.reduce((best, oblastFeature) => {
      const oblastMultiPolygon = toClipMultiPolygon(oblastFeature.geometry);

      if (!oblastMultiPolygon) {
        return best;
      }

      const overlap = polygonClipping.intersection(subdivisionMultiPolygon, oblastMultiPolygon);
      const overlapArea = clipMultiPolygonArea(overlap);

      if (!best || overlapArea > best.overlapArea) {
        return {
          feature: oblastFeature,
          overlapArea,
        };
      }

      return best;
    }, null);

    if (overlapWinner?.feature && overlapWinner.overlapArea > 0) {
      return overlapWinner.feature;
    }
  }

  const point = geometryRepresentativePoint(subdivisionFeature.geometry);

  if (!point) {
    return null;
  }

  const containingOblast = oblastFeatures.find((oblastFeature) =>
    pointInPolygonGeometry(point, oblastFeature.geometry),
  );

  if (containingOblast) {
    return containingOblast;
  }

  return oblastFeatures.reduce((best, oblastFeature) => {
    const distance = pointDistanceToGeometryKm(point, oblastFeature.geometry);

    if (!best || distance < best.distance) {
      return {
        feature: oblastFeature,
        distance,
      };
    }

    return best;
  }, null)?.feature ?? null;
}

function clipGeometryToMask(geometry, maskGeometry) {
  const geometryMultiPolygon = toClipMultiPolygon(geometry);
  const maskMultiPolygon = toClipMultiPolygon(maskGeometry);

  if (!geometryMultiPolygon || !maskMultiPolygon) {
    return geometry;
  }

  const clipped = polygonClipping.intersection(geometryMultiPolygon, maskMultiPolygon);

  if (!clipped || clipped.length === 0) {
    return null;
  }

  return fromClipMultiPolygon(clipped);
}

// Snap ADM2 presentation to ADM1 by clipping each subdivision to its best-matching oblast polygon.
function alignOblastSubdivisionBoundaries(oblastBoundaryLayer, subdivisionLayer) {
  const oblastFeatures = (oblastBoundaryLayer.features ?? []).filter(
    (feature) =>
      feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
  );
  const subdivisionFeatures = (subdivisionLayer.features ?? []).filter(
    (feature) =>
      feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
  );

  return {
    type: "FeatureCollection",
    features: subdivisionFeatures
      .map((subdivisionFeature) => {
        const matchingOblast = bestMatchingOblastForSubdivision(subdivisionFeature, oblastFeatures);

        if (!matchingOblast) {
          return subdivisionFeature;
        }

        const clippedGeometry = clipGeometryToMask(
          subdivisionFeature.geometry,
          matchingOblast.geometry,
        );

        if (!clippedGeometry) {
          return null;
        }

        return {
          ...subdivisionFeature,
          properties: {
            ...subdivisionFeature.properties,
            parentOblast: matchingOblast.properties?.shapeName ?? null,
          },
          geometry: clippedGeometry,
        };
      })
      .filter(Boolean),
  };
}

function roundCoordinate(value, precision = 6) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function normalizedSegmentKey(a, b, precision = 6) {
  const aRounded = [roundCoordinate(a[0], precision), roundCoordinate(a[1], precision)];
  const bRounded = [roundCoordinate(b[0], precision), roundCoordinate(b[1], precision)];
  const aKey = `${aRounded[0]},${aRounded[1]}`;
  const bKey = `${bRounded[0]},${bRounded[1]}`;

  return aKey <= bKey
    ? `${aKey}|${bKey}`
    : `${bKey}|${aKey}`;
}

function extractPolygonSegments(geometry, options = {}) {
  const { includeInteriorRings = true } = options;

  if (geometry.type === "Polygon") {
    const rings = includeInteriorRings
      ? geometry.coordinates
      : geometry.coordinates.slice(0, 1);

    return rings.flatMap((ring) => {
      const segments = [];

      for (let index = 1; index < ring.length; index += 1) {
        segments.push([ring[index - 1], ring[index]]);
      }

      return segments;
    });
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) =>
      extractPolygonSegments(
        { type: "Polygon", coordinates: polygon },
        { includeInteriorRings },
      ),
    );
  }

  return [];
}

function extractLineSegments(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    const segments = [];

    for (let index = 1; index < geometry.coordinates.length; index += 1) {
      segments.push([geometry.coordinates[index - 1], geometry.coordinates[index]]);
    }

    return segments;
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.flatMap((line) =>
      extractLineSegments({ type: "LineString", coordinates: line }),
    );
  }

  return [];
}

function pointsEqual2D(a, b) {
  return Array.isArray(a) &&
    Array.isArray(b) &&
    a.length >= 2 &&
    b.length >= 2 &&
    a[0] === b[0] &&
    a[1] === b[1];
}

function pointDistanceKm(a, b) {
  const referenceLatitude = (a[1] + b[1]) / 2;
  const [ax, ay] = toKilometers(a, referenceLatitude);
  const [bx, by] = toKilometers(b, referenceLatitude);

  return Math.hypot(bx - ax, by - ay);
}

function simplifyRingByMinSegmentKm(ring, minSegmentKm) {
  if (!Array.isArray(ring) || ring.length < 4 || minSegmentKm <= 0) {
    return ring;
  }

  const isClosed = pointsEqual2D(ring[0], ring[ring.length - 1]);
  const vertices = isClosed ? ring.slice(0, -1) : ring.slice();

  if (vertices.length < 3) {
    return ring;
  }

  const simplified = [vertices[0]];

  for (let index = 1; index < vertices.length - 1; index += 1) {
    const current = vertices[index];
    const previousKept = simplified[simplified.length - 1];

    if (pointDistanceKm(previousKept, current) >= minSegmentKm) {
      simplified.push(current);
    }
  }

  const lastVertex = vertices[vertices.length - 1];
  if (!pointsEqual2D(simplified[simplified.length - 1], lastVertex)) {
    simplified.push(lastVertex);
  }

  if (isClosed) {
    if (!pointsEqual2D(simplified[0], simplified[simplified.length - 1])) {
      simplified.push(simplified[0]);
    }

    if (simplified.length < 4) {
      return ring;
    }
  } else if (simplified.length < 2) {
    return ring;
  }

  return simplified;
}

function simplifyLineByMinSegmentKm(line, minSegmentKm) {
  if (!Array.isArray(line) || line.length < 2 || minSegmentKm <= 0) {
    return line;
  }

  const simplified = [line[0]];

  for (let index = 1; index < line.length - 1; index += 1) {
    const previousKept = simplified[simplified.length - 1];
    const current = line[index];

    if (pointDistanceKm(previousKept, current) >= minSegmentKm) {
      simplified.push(current);
    }
  }

  const lastVertex = line[line.length - 1];

  if (!pointsEqual2D(simplified[simplified.length - 1], lastVertex)) {
    simplified.push(lastVertex);
  }

  return simplified.length >= 2 ? simplified : line;
}

function simplifyPolygonGeometryByMinSegmentKm(geometry, minSegmentKm) {
  if (!geometry || minSegmentKm <= 0) {
    return geometry;
  }

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) =>
        simplifyRingByMinSegmentKm(ring, minSegmentKm)
      ),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => simplifyRingByMinSegmentKm(ring, minSegmentKm))
      ),
    };
  }

  return geometry;
}

function buildSegmentStatsFromPolygonLayer(featureCollection, propertyExtractor, options = {}) {
  const { includeInteriorRings = true } = options;
  const segmentStats = new Map();

  for (const feature of featureCollection.features ?? []) {
    if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") {
      continue;
    }

    const parentKey = propertyExtractor(feature);
    const segments = extractPolygonSegments(feature.geometry, { includeInteriorRings });

    for (const [start, end] of segments) {
      if (
        !Array.isArray(start) ||
        !Array.isArray(end) ||
        start.length < 2 ||
        end.length < 2 ||
        (start[0] === end[0] && start[1] === end[1])
      ) {
        continue;
      }

      const key = normalizedSegmentKey(start, end);
      const existing = segmentStats.get(key);

      if (existing) {
        existing.count += 1;
        if (parentKey) {
          existing.parentKeys.add(parentKey);
        }
      } else {
        segmentStats.set(key, {
          count: 1,
          parentKeys: new Set(parentKey ? [parentKey] : []),
          coordinates: [start, end],
        });
      }
    }
  }

  return segmentStats;
}

function buildLineLayerFromSegmentStats(segmentStats, filterFn, propertyBuilder) {
  return {
    type: "FeatureCollection",
    features: Array.from(segmentStats.values())
      .filter(filterFn)
      .map((segment, index) => ({
        type: "Feature",
        id: index + 1,
        properties: propertyBuilder(segment),
        geometry: {
          type: "LineString",
          coordinates: segment.coordinates,
        },
      })),
  };
}

function buildOuterBoundaryLineLayerFromPolygonGeometry(geometry, properties = {}) {
  if (!geometry) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];

  return {
    type: "FeatureCollection",
    features: polygons
      .map((polygon, index) => {
        const outerRing = polygon?.[0];

        if (!Array.isArray(outerRing) || outerRing.length < 2) {
          return null;
        }

        return {
          type: "Feature",
          id: index + 1,
          properties,
          geometry: {
            type: "LineString",
            coordinates: outerRing,
          },
        };
      })
      .filter(Boolean),
  };
}

function isMaritimeBoundarySegment(start, end, seaLayer, maxSeaDistanceKm = 0.12) {
  if (!Array.isArray(start) || !Array.isArray(end)) {
    return false;
  }

  const midpoint = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
  ];

  return (seaLayer.features ?? []).some((feature) =>
    pointDistanceToGeometryKm(midpoint, feature.geometry) <= maxSeaDistanceKm,
  );
}

function suppressMaritimeSegments(lineLayer, seaLayer) {
  if (!lineLayer || !Array.isArray(lineLayer.features) || !seaLayer) {
    return lineLayer;
  }

  let nextId = 1;

  return {
    type: "FeatureCollection",
    features: lineLayer.features.flatMap((feature) => {
      const coordinates = feature.geometry?.coordinates;

      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return [];
      }

      const chunks = [];
      let currentChunk = [coordinates[0]];

      for (let index = 1; index < coordinates.length; index += 1) {
        const start = coordinates[index - 1];
        const end = coordinates[index];
        const maritime = isMaritimeBoundarySegment(start, end, seaLayer);

        if (maritime) {
          if (currentChunk.length >= 2) {
            chunks.push(currentChunk);
          }
          currentChunk = [end];
          continue;
        }

        currentChunk.push(end);
      }

      if (currentChunk.length >= 2) {
        chunks.push(currentChunk);
      }

      return chunks.map((chunk) => ({
        type: "Feature",
        id: nextId++,
        properties: feature.properties ?? {},
        geometry: {
          type: "LineString",
          coordinates: chunk,
        },
      }));
    }),
  };
}

function correctSeaLayerWithAdm0Geometry(seaLayer, adm0Geometry) {
  const seaFeatures = seaLayer?.features ?? [];
  const adm0MultiPolygon = toClipMultiPolygon(adm0Geometry);

  if (!adm0MultiPolygon || seaFeatures.length === 0) {
    return seaLayer;
  }

  let nextId = 1;

  return {
    type: "FeatureCollection",
    features: seaFeatures
      .map((feature) => {
        const seaMultiPolygon = toClipMultiPolygon(feature.geometry);

        if (!seaMultiPolygon) {
          return null;
        }

        try {
          const corrected = polygonClipping.difference(seaMultiPolygon, adm0MultiPolygon);
          const geometry = fromClipMultiPolygon(corrected);

          if (!geometry) {
            return null;
          }

          return {
            type: "Feature",
            id: nextId++,
            properties: {
              ...(feature.properties ?? {}),
              coastlineCorrection: "adm0-difference",
            },
            geometry,
          };
        } catch {
          return {
            ...feature,
            id: nextId++,
            properties: {
              ...(feature.properties ?? {}),
              coastlineCorrection: "fallback-original",
            },
          };
        }
      })
      .filter(Boolean),
  };
}

function filterPointFeaturesOutsidePolygons(pointLayer, polygonLayer) {
  if (!pointLayer || !Array.isArray(pointLayer.features)) {
    return pointLayer;
  }

  return {
    type: "FeatureCollection",
    features: pointLayer.features.filter((feature) => {
      if (feature.geometry?.type !== "Point") {
        return true;
      }

      const [longitude, latitude] = feature.geometry.coordinates ?? [];

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return false;
      }

      const point = [longitude, latitude];

      return !(polygonLayer?.features ?? []).some((polygonFeature) =>
        pointInPolygonGeometry(point, polygonFeature.geometry),
      );
    }),
  };
}

function minDistanceToFeatureCollectionKm(point, featureCollection) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (const feature of featureCollection?.features ?? []) {
    minDistance = Math.min(
      minDistance,
      pointDistanceToGeometryKm(point, feature.geometry),
    );
  }

  return minDistance;
}

function buildCoastalSeaSuppressionMask(seaLayer, osmWaterLayer, adm0LineLayer) {
  const seaFeatures = seaLayer?.features ?? [];
  const osmFeatures = (osmWaterLayer?.features ?? []).filter(
    (feature) =>
      feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
  );

  if (seaFeatures.length === 0 || osmFeatures.length === 0) {
    return seaLayer;
  }

  const coastalBorderThresholdKm = 2.0;
  const coastalSeaThresholdKm = 2.0;
  const coastalOsmFeatures = osmFeatures.filter((feature) => {
    const point = geometryRepresentativePoint(feature.geometry);

    if (!point) {
      return false;
    }

    const nearBorder = minDistanceToLineLayerKm(point, adm0LineLayer) <= coastalBorderThresholdKm;
    const nearSea = minDistanceToFeatureCollectionKm(point, seaLayer) <= coastalSeaThresholdKm;

    return nearBorder && nearSea;
  });

  let nextId = 1;

  return {
    type: "FeatureCollection",
    features: [
      ...seaFeatures.map((feature) => ({
        ...feature,
        id: nextId++,
        properties: {
          ...(feature.properties ?? {}),
          maskSource: "natural-earth-sea",
        },
      })),
      ...coastalOsmFeatures.map((feature) => ({
        ...feature,
        id: nextId++,
        properties: {
          ...(feature.properties ?? {}),
          maskSource: "osm-coastal-water",
        },
      })),
    ],
  };
}

function minDistanceToLineLayerKm(point, lineLayer) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (const feature of lineLayer.features ?? []) {
    for (const [segmentStart, segmentEnd] of extractLineSegments(feature.geometry)) {
      minDistance = Math.min(
        minDistance,
        pointToSegmentDistanceKm(point, segmentStart, segmentEnd),
      );
    }
  }

  return minDistance;
}

function dissolveAdm2ByOblast(adm2PolygonLayer) {
  const grouped = new Map();

  for (const feature of adm2PolygonLayer.features ?? []) {
    const geometryMultiPolygon = toClipMultiPolygon(feature.geometry);

    if (!geometryMultiPolygon) {
      continue;
    }

    const oblastName =
      feature.properties?.parentOblast ??
      feature.properties?.NAME_1 ??
      feature.properties?.shapeName ??
      "unknown";
    const existing = grouped.get(oblastName);

    if (!existing) {
      grouped.set(oblastName, geometryMultiPolygon);
      continue;
    }

    try {
      grouped.set(oblastName, polygonClipping.union(existing, geometryMultiPolygon));
    } catch {
      grouped.set(oblastName, existing);
    }
  }

  return {
    type: "FeatureCollection",
    features: Array.from(grouped.entries())
      .map(([oblastName, clipGeometry], index) => {
        const geometry = fromClipMultiPolygon(clipGeometry);

        if (!geometry) {
          return null;
        }

        return {
          type: "Feature",
          id: index + 1,
          properties: {
            shapeName: oblastName,
          },
          geometry,
        };
      })
      .filter(Boolean),
  };
}

function dissolveUkraineFromOblasts(oblastPolygonLayer) {
  const multipolygons = oblastPolygonLayer.features
    .map((feature) => toClipMultiPolygon(feature.geometry))
    .filter(Boolean);

  if (multipolygons.length === 0) {
    return null;
  }

  let unioned = multipolygons[0];

  for (let index = 1; index < multipolygons.length; index += 1) {
    try {
      unioned = polygonClipping.union(unioned, multipolygons[index]);
    } catch {
      // Keep previous union on occasional clipping robustness failures.
    }
  }

  return fromClipMultiPolygon(unioned);
}

// Derive ADM0/ADM1/ADM2 boundary line layers from one ADM2 polygon source using dissolve-first topology.
function buildBoundaryLineTopologyFromAdm2(adm2PolygonLayer) {
  const dissolvedOblastPolygons = dissolveAdm2ByOblast(adm2PolygonLayer);
  const ukraineGeometry = dissolveUkraineFromOblasts(dissolvedOblastPolygons);
  const theaterBoundaryMinSegmentKm = 0.6;
  const simplifiedUkraineGeometry = simplifyPolygonGeometryByMinSegmentKm(
    ukraineGeometry,
    theaterBoundaryMinSegmentKm,
  );
  const ukrainePolygonLayer = {
    type: "FeatureCollection",
    features: simplifiedUkraineGeometry
      ? [{
        type: "Feature",
        properties: {
          name: "Ukraine",
          id: "UKR",
        },
        geometry: simplifiedUkraineGeometry,
      }]
      : [],
  };

  const adm0Outer = buildOuterBoundaryLineLayerFromPolygonGeometry(
    simplifiedUkraineGeometry,
    { level: "ADM0" },
  );

  const adm1Stats = buildSegmentStatsFromPolygonLayer(
    dissolvedOblastPolygons,
    (feature) => feature.properties?.shapeName ?? null,
  );
  const adm1Shared = buildLineLayerFromSegmentStats(
    adm1Stats,
    (segment) => segment.count === 2 && segment.parentKeys.size === 2,
    (segment) => {
      const [oblastA, oblastB] = Array.from(segment.parentKeys);
      return {
        level: "ADM1",
        leftOblast: oblastA ?? null,
        rightOblast: oblastB ?? null,
      };
    },
  );

  const adm2Stats = buildSegmentStatsFromPolygonLayer(
    adm2PolygonLayer,
    (feature) =>
      feature.properties?.parentOblast ??
      feature.properties?.NAME_1 ??
      feature.properties?.shapeName ??
      null,
  );
  const adm2InternalRaw = buildLineLayerFromSegmentStats(
    adm2Stats,
    (segment) => segment.count === 2 && segment.parentKeys.size === 1,
    (segment) => ({
      level: "ADM2",
      parentOblast: Array.from(segment.parentKeys)[0] ?? null,
    }),
  );

  const boundaryExclusionThresholdKm = 0.06;
  const adm2Internal = {
    type: "FeatureCollection",
    features: (adm2InternalRaw.features ?? []).filter((feature) => {
      const [start, end] = feature.geometry?.coordinates ?? [];

      if (!start || !end) {
        return false;
      }

      const midpoint = [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
      ];

      const nearAdm0 = minDistanceToLineLayerKm(midpoint, adm0Outer) <= boundaryExclusionThresholdKm;
      const nearAdm1 = minDistanceToLineLayerKm(midpoint, adm1Shared) <= boundaryExclusionThresholdKm;

      return !nearAdm0 && !nearAdm1;
    }),
  };

  return {
    adm0Outer,
    adm1Shared,
    adm2Internal,
    dissolvedOblastPolygons,
    ukraineGeometry,
  };
}

// Convert lon/lat deltas near a reference latitude into approximate kilometer coordinates.
function toKilometers(point, referenceLatitude) {
  const kmPerDegreeLatitude = 111.32;
  const kmPerDegreeLongitude = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);

  return [
    point[0] * kmPerDegreeLongitude,
    point[1] * kmPerDegreeLatitude,
  ];
}

function fromKilometers(point, referenceLatitude) {
  const kmPerDegreeLatitude = 111.32;
  const kmPerDegreeLongitude = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);
  const safeKmPerDegreeLongitude = Math.max(0.000001, Math.abs(kmPerDegreeLongitude));

  return [
    point[0] / safeKmPerDegreeLongitude,
    point[1] / kmPerDegreeLatitude,
  ];
}

function kilometersToLatitudeDegrees(km) {
  return km / 111.32;
}

function kilometersToLongitudeDegrees(km, latitude) {
  const kmPerDegreeLongitude = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const safeKmPerDegreeLongitude = Math.max(0.000001, Math.abs(kmPerDegreeLongitude));
  return km / safeKmPerDegreeLongitude;
}

// Approximate the shortest kilometer distance from a point to a line segment.
function pointToSegmentDistanceKm(point, segmentStart, segmentEnd) {
  const referenceLatitude = (point[1] + segmentStart[1] + segmentEnd[1]) / 3;
  const [px, py] = toKilometers(point, referenceLatitude);
  const [ax, ay] = toKilometers(segmentStart, referenceLatitude);
  const [bx, by] = toKilometers(segmentEnd, referenceLatitude);
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abSquared = abx * abx + aby * aby;

  if (abSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abSquared));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;

  return Math.hypot(px - closestX, py - closestY);
}

// Find the nearest distance from a point to any segment in a polygon ring.
function minDistanceToRingKm(point, ring) {
  let minDistance = Infinity;

  for (let index = 1; index < ring.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      pointToSegmentDistanceKm(point, ring[index - 1], ring[index]),
    );
  }

  return minDistance;
}

// Allow near-border settlement features to survive even when their center falls just outside the polygon.
function pointWithinBorderBuffer(point, geometry, bufferKm) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.some((ring) => minDistanceToRingKm(point, ring) <= bufferKm);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointWithinBorderBuffer(point, { type: "Polygon", coordinates: polygon }, bufferKm),
    );
  }

  return false;
}

// Prefer richer OSM object types when deduplicating overlapping settlement records.
function settlementTypePreference(id) {
  if (id.startsWith("relation/")) {
    return 1;
  }

  if (id.startsWith("way/")) {
    return 2;
  }

  return 3;
}

// Approximate point-to-point distance in kilometers for settlement deduplication.
function pointToPointDistanceKm(left, right) {
  const referenceLatitude = (left[1] + right[1]) / 2;
  const [lx, ly] = toKilometers(left, referenceLatitude);
  const [rx, ry] = toKilometers(right, referenceLatitude);
  return Math.hypot(lx - rx, ly - ry);
}

function settlementCanonicalName(feature) {
  return (
    normalizeSettlementName(feature.properties.nameUk) ??
    normalizeSettlementName(feature.properties.nameEn) ??
    normalizeSettlementName(feature.properties.name)
  );
}

function choosePreferredSettlement(left, right) {
  const leftRank = placeRank(left.properties.place);
  const rightRank = placeRank(right.properties.place);

  if (leftRank !== rightRank) {
    return leftRank < rightRank ? left : right;
  }

  const leftPopulation = left.properties.population ?? 0;
  const rightPopulation = right.properties.population ?? 0;

  if (leftPopulation !== rightPopulation) {
    return leftPopulation > rightPopulation ? left : right;
  }

  const leftTypePreference = settlementTypePreference(left.properties.id);
  const rightTypePreference = settlementTypePreference(right.properties.id);

  if (leftTypePreference !== rightTypePreference) {
    return leftTypePreference < rightTypePreference ? left : right;
  }

  return left;
}

function settlementDuplicateDistanceKm(feature) {
  switch (feature.properties.place) {
    case "city":
      return 12;
    case "town":
      return 8;
    case "village":
      return 3;
    case "hamlet":
      return 2;
    default:
      return 2;
  }
}

function duplicateDistanceBetweenSettlements(left, right) {
  const leftPlace = left.properties.place;
  const rightPlace = right.properties.place;
  const leftPopulation = left.properties.population ?? 0;
  const rightPopulation = right.properties.population ?? 0;
  const leftIsMajorCity = leftPlace === "city" && leftPopulation >= 300000;
  const rightIsMajorCity = rightPlace === "city" && rightPopulation >= 300000;
  const isCityTownPair =
    (leftPlace === "city" && rightPlace === "town") ||
    (leftPlace === "town" && rightPlace === "city");

  if (isCityTownPair && (leftIsMajorCity || rightIsMajorCity)) {
    return 250;
  }

  return Math.max(
    settlementDuplicateDistanceKm(left),
    settlementDuplicateDistanceKm(right),
  );
}

// Collapse near-overlapping same-name settlements (node/way/relation and place-class duplicates).
function dedupeSettlements(features) {
  const groupedByName = new Map();

  for (const feature of features) {
    const canonicalName = settlementCanonicalName(feature);
    const key = canonicalName ?? `id:${feature.properties.id}`;
    const group = groupedByName.get(key) ?? [];
    let merged = false;

    for (let index = 0; index < group.length; index += 1) {
      const candidate = group[index];

      if (
        pointToPointDistanceKm(candidate.geometry.coordinates, feature.geometry.coordinates) >
        duplicateDistanceBetweenSettlements(candidate, feature)
      ) {
        continue;
      }

      group[index] = choosePreferredSettlement(candidate, feature);
      merged = true;
      break;
    }

    if (!merged) {
      group.push(feature);
    }

    groupedByName.set(key, group);
  }

  return [...groupedByName.values()].flat();
}

// Reuse the strongest known city population for duplicate city names when a sibling record is missing one.
function applyDuplicateCityPopulationFallback(features) {
  const highestPopulationByName = new Map();

  for (const feature of features) {
    if (feature.properties.place !== "city" || feature.properties.population == null) {
      continue;
    }

    for (const candidate of [feature.properties.nameUk, feature.properties.nameEn]) {
      const key = normalizeSettlementName(candidate);

      if (!key) {
        continue;
      }

      const existing = highestPopulationByName.get(key) ?? 0;
      highestPopulationByName.set(
        key,
        Math.max(existing, feature.properties.population),
      );
    }
  }

  return features.map((feature) => {
    if (feature.properties.place !== "city" || feature.properties.population != null) {
      return feature;
    }

    for (const candidate of [feature.properties.nameUk, feature.properties.nameEn]) {
      const key = normalizeSettlementName(candidate);

      if (!key) {
        continue;
      }

      const fallbackPopulation = highestPopulationByName.get(key);

      if (fallbackPopulation != null) {
        return {
          ...feature,
          properties: {
            ...feature.properties,
            population: fallbackPopulation,
          },
        };
      }
    }

    return feature;
  });
}

// Apply the curated fallback lookup one last time after deduplication so late-selected city records still get populated.
function applyCuratedCityPopulationFallback(features) {
  return features.map((feature) => {
    if (feature.properties.place !== "city" || feature.properties.population != null) {
      return feature;
    }

    for (const candidate of [feature.properties.nameUk, feature.properties.nameEn]) {
      const key = normalizeSettlementName(candidate);

      if (!key) {
        continue;
      }

      const fallbackPopulation = topUkraineCityPopulationFallbackLookup.get(key);

      if (fallbackPopulation != null) {
        return {
          ...feature,
          properties: {
            ...feature.properties,
            population: fallbackPopulation,
          },
        };
      }
    }

    return feature;
  });
}

// Split the theater bbox into tiles so heavy Overpass polygon queries stay manageable.
function buildBboxGrid(bbox, columns, rows) {
  const boxes = [];
  const width = (bbox.east - bbox.west) / columns;
  const height = (bbox.north - bbox.south) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      boxes.push({
        west: bbox.west + width * column,
        east: bbox.west + width * (column + 1),
        south: bbox.south + height * row,
        north: bbox.south + height * (row + 1),
      });
    }
  }

  return boxes;
}

// Ensure polygon rings are explicitly closed before writing GeoJSON features.
function closeRing(coordinates) {
  if (coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}

// Use bounding-box area as a cheap filter for tiny polygons that add size but little value.
function approximateBoundsAreaKm2(coordinates) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  const centerLatitude = (south + north) / 2;
  const widthKm = (east - west) * 111.32 * Math.cos((centerLatitude * Math.PI) / 180);
  const heightKm = (north - south) * 111.32;

  return Math.max(0, widthKm * heightKm);
}

// Thin large polygon rings by sampling vertices at a fixed interval.
function simplifyRing(coordinates, maxVertices) {
  if (coordinates.length <= maxVertices) {
    return coordinates;
  }

  const targetInteriorVertices = Math.max(2, maxVertices - 1);
  const step = Math.ceil((coordinates.length - 1) / targetInteriorVertices);
  const simplified = [coordinates[0]];

  for (let index = step; index < coordinates.length - 1; index += step) {
    simplified.push(coordinates[index]);
  }

  simplified.push(coordinates[coordinates.length - 1]);
  return simplified;
}

// Convert Overpass way geometries into simplified GeoJSON polygons with layer-specific properties.
function addOverpassWayFeatures(featuresById, elements, propertiesBuilder, options = {}) {
  const {
    minApproxAreaKm2 = 0,
    maxVertices = 160,
  } = options;

  for (const element of elements) {
    if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 3) {
      continue;
    }

    const coordinates = simplifyRing(closeRing(
      element.geometry.map((point) => [point.lon, point.lat]),
    ), maxVertices);

    if (coordinates.length < 4) {
      continue;
    }

    if (approximateBoundsAreaKm2(coordinates) < minApproxAreaKm2) {
      continue;
    }

    featuresById.set(String(element.id), {
      type: "Feature",
      properties: {
        id: `way/${element.id}`,
        ...propertiesBuilder(element.tags ?? {}),
      },
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
    });
  }
}

function addOverpassRelationFeatures(featuresById, elements, propertiesBuilder, options = {}) {
  const {
    minApproxAreaKm2 = 0,
    maxVertices = 160,
  } = options;

  for (const element of elements) {
    if (element.type !== "relation" || !Array.isArray(element.members) || element.members.length === 0) {
      continue;
    }

    const outers = element.members.filter(
      (member) =>
        member.type === "way" &&
        member.role === "outer" &&
        Array.isArray(member.geometry) &&
        member.geometry.length >= 3,
    );

    for (const [outerIndex, outer] of outers.entries()) {
      const coordinates = simplifyRing(closeRing(
        outer.geometry.map((point) => [point.lon, point.lat]),
      ), maxVertices);

      if (coordinates.length < 4) {
        continue;
      }

      if (approximateBoundsAreaKm2(coordinates) < minApproxAreaKm2) {
        continue;
      }

      featuresById.set(`relation/${element.id}/${outerIndex}`, {
        type: "Feature",
        properties: {
          id: `relation/${element.id}/${outerIndex}`,
          ...propertiesBuilder(element.tags ?? {}),
        },
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      });
    }
  }
}

// Fetch a tiled polygon layer from Overpass and merge deduplicated way features across tiles.
async function fetchTiledAreaLayer(layerId, selectors, propertiesBuilder, options) {
  const tiles = buildBboxGrid(theaterBbox, 3, 3);
  const featuresById = new Map();
  const layerConcurrency = Math.min(tileFetchConcurrency, tiles.length);
  const layerStartedAt = Date.now();
  let completedTileCount = 0;

  console.log(
    `[${layerId}] starting ${tiles.length} tiled requests (concurrency ${layerConcurrency})`,
  );
  const tileResponses = await mapWithConcurrency(
    tiles,
    layerConcurrency,
    async (tile, tileIndex) => {
      const response = await fetchOverpassJsonWithFallback(
        [sources.terrainOverpassApi, sources.overpassFallbackApi, sources.overpassApi],
        overpassAreaQuery(selectors, tile),
        `overpass/${layerId}/tile-${tileIndex}`,
      );
      completedTileCount += 1;
      console.log(
        `[${layerId}] tile ${tileIndex + 1}/${tiles.length} complete ` +
        `(${completedTileCount}/${tiles.length}, elapsed ${formatElapsedMs(Date.now() - layerStartedAt)})`,
      );
      return response;
    },
  );

  for (const response of tileResponses) {
    addOverpassWayFeatures(featuresById, response.elements ?? [], propertiesBuilder, options);
    addOverpassRelationFeatures(featuresById, response.elements ?? [], propertiesBuilder, options);
  }

  console.log(
    `[${layerId}] merged ${featuresById.size} deduplicated features ` +
    `(elapsed ${formatElapsedMs(Date.now() - layerStartedAt)})`,
  );

  return {
    type: "FeatureCollection",
    features: [...featuresById.values()],
  };
}

// Convert raw Overpass settlement elements into filtered, deduplicated point GeoJSON.
function overpassElementsToGeoJson(elements, theaterBoundary) {
  const features = elements
    .map((element) => {
      const tags = element.tags ?? {};
      const longitude =
        typeof element.lon === "number"
          ? element.lon
          : typeof element.center?.lon === "number"
            ? element.center.lon
            : null;
      const latitude =
        typeof element.lat === "number"
          ? element.lat
          : typeof element.center?.lat === "number"
            ? element.center.lat
            : null;

      if (longitude === null || latitude === null) {
        return null;
      }

      const place = tags.place ?? "locality";
      const rawPopulation = normalizePopulation(tags.population);
      const nameUk = tags["name:uk"] ?? tags.name ?? null;
      const nameEn = tags["name:en"] ?? null;

      if (!nameUk) {
        return null;
      }

      const population = resolveSettlementPopulation(
        place,
        rawPopulation,
        nameUk,
        nameEn,
      );

      return {
        type: "Feature",
        properties: {
          id: `${element.type}/${element.id}`,
          name: tags.name ?? nameUk,
          nameUk,
          nameEn,
          place,
          population,
          labelRank: placeRank(place),
        },
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
      };
    })
    .filter(Boolean)
    .filter((feature) =>
      theaterBoundary.features.some((boundaryFeature) =>
        pointInPolygonGeometry(feature.geometry.coordinates, boundaryFeature.geometry) ||
        pointWithinBorderBuffer(feature.geometry.coordinates, boundaryFeature.geometry, 200),
      ),
    );

  return {
    type: "FeatureCollection",
    features: sortSettlements(
      applyCuratedCityPopulationFallback(
        dedupeSettlements(applyDuplicateCityPopulationFallback(features)),
      ),
    ),
  };
}

// Basic bbox intersection used for clipping public datasets to the theater extent.
function bboxIntersects(a, b) {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

// Recursively accumulate geometry coordinates into an overall bounds object.
function accumulateCoordinates(coordinates, bounds) {
  if (!coordinates) {
    return;
  }

  if (!Array.isArray(coordinates)) {
    return;
  }

  for (const coordinate of coordinates) {
    if (Array.isArray(coordinate) && typeof coordinate[0] === "number") {
      const [longitude, latitude] = coordinate;
      bounds.west = Math.min(bounds.west, longitude);
      bounds.east = Math.max(bounds.east, longitude);
      bounds.south = Math.min(bounds.south, latitude);
      bounds.north = Math.max(bounds.north, latitude);
      continue;
    }

    accumulateCoordinates(coordinate, bounds);
  }
}

// Compute a simple bounding box for supported GeoJSON geometries.
function geometryBounds(geometry) {
  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates;
    return {
      west: longitude,
      south: latitude,
      east: longitude,
      north: latitude,
    };
  }

  const bounds = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };

  accumulateCoordinates(geometry.coordinates, bounds);
  return bounds;
}

// Remove public-source features that fall completely outside the theater bbox.
function filterFeatureCollectionToBbox(featureCollection, bbox) {
  return {
    type: "FeatureCollection",
    features: featureCollection.features.filter((feature) => {
      if (!feature.geometry) {
        return false;
      }

      return bboxIntersects(geometryBounds(feature.geometry), bbox);
    }),
  };
}

function representativePointForGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point") {
    return geometry.coordinates;
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates?.[0]?.[0])) {
    return geometry.coordinates[0][0];
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates?.[0]?.[0]?.[0])) {
    return geometry.coordinates[0][0][0];
  }

  const bounds = geometryBounds(geometry);
  if (!Number.isFinite(bounds.west) || !Number.isFinite(bounds.south)) {
    return null;
  }

  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
}

function segmentMidpoint(segmentStart, segmentEnd) {
  return [
    (segmentStart[0] + segmentEnd[0]) / 2,
    (segmentStart[1] + segmentEnd[1]) / 2,
  ];
}

function bufferLineSegmentToPolygon(segmentStart, segmentEnd, halfWidthKm) {
  const referenceLatitude = (segmentStart[1] + segmentEnd[1]) / 2;
  const [ax, ay] = toKilometers(segmentStart, referenceLatitude);
  const [bx, by] = toKilometers(segmentEnd, referenceLatitude);
  const dx = bx - ax;
  const dy = by - ay;
  const segmentLength = Math.hypot(dx, dy);

  if (segmentLength <= 0) {
    return null;
  }

  const normalX = -dy / segmentLength;
  const normalY = dx / segmentLength;
  const leftStart = fromKilometers(
    [ax + normalX * halfWidthKm, ay + normalY * halfWidthKm],
    referenceLatitude,
  );
  const leftEnd = fromKilometers(
    [bx + normalX * halfWidthKm, by + normalY * halfWidthKm],
    referenceLatitude,
  );
  const rightEnd = fromKilometers(
    [bx - normalX * halfWidthKm, by - normalY * halfWidthKm],
    referenceLatitude,
  );
  const rightStart = fromKilometers(
    [ax - normalX * halfWidthKm, ay - normalY * halfWidthKm],
    referenceLatitude,
  );

  return {
    type: "Polygon",
    coordinates: [[
      leftStart,
      leftEnd,
      rightEnd,
      rightStart,
      leftStart,
    ]],
  };
}

function bboxAroundPointKm(point, radiusKm) {
  return {
    west: point[0] - kilometersToLongitudeDegrees(radiusKm, point[1]),
    east: point[0] + kilometersToLongitudeDegrees(radiusKm, point[1]),
    south: point[1] - kilometersToLatitudeDegrees(radiusKm),
    north: point[1] + kilometersToLatitudeDegrees(radiusKm),
  };
}

function minDistanceToWaterEntriesNearPointKm(point, waterEntries, searchRadiusKm) {
  const searchBounds = bboxAroundPointKm(point, searchRadiusKm);
  let minDistance = Number.POSITIVE_INFINITY;

  for (const entry of waterEntries) {
    if (!bboxIntersects(entry.bounds, searchBounds)) {
      continue;
    }

    minDistance = Math.min(
      minDistance,
      pointDistanceToGeometryKm(point, entry.feature?.geometry ?? entry.geometry),
    );

    if (minDistance === 0) {
      return 0;
    }
  }

  return minDistance;
}

function buildBoundsSpatialIndex(entries, cellSizeDegrees = 0.18) {
  const buckets = new Map();

  for (const [entryIndex, entry] of entries.entries()) {
    const bounds = entry.bounds;

    if (
      !Number.isFinite(bounds.west) ||
      !Number.isFinite(bounds.east) ||
      !Number.isFinite(bounds.south) ||
      !Number.isFinite(bounds.north)
    ) {
      continue;
    }

    const westCell = Math.floor(bounds.west / cellSizeDegrees);
    const eastCell = Math.floor(bounds.east / cellSizeDegrees);
    const southCell = Math.floor(bounds.south / cellSizeDegrees);
    const northCell = Math.floor(bounds.north / cellSizeDegrees);

    for (let x = westCell; x <= eastCell; x += 1) {
      for (let y = southCell; y <= northCell; y += 1) {
        const key = `${x}:${y}`;
        const bucket = buckets.get(key);

        if (bucket) {
          bucket.push(entryIndex);
        } else {
          buckets.set(key, [entryIndex]);
        }
      }
    }
  }

  return {
    entries,
    buckets,
    cellSizeDegrees,
  };
}

function queryBoundsSpatialIndex(index, bounds) {
  const {
    entries,
    buckets,
    cellSizeDegrees,
  } = index;
  const westCell = Math.floor(bounds.west / cellSizeDegrees);
  const eastCell = Math.floor(bounds.east / cellSizeDegrees);
  const southCell = Math.floor(bounds.south / cellSizeDegrees);
  const northCell = Math.floor(bounds.north / cellSizeDegrees);
  const candidateIndexes = new Set();

  for (let x = westCell; x <= eastCell; x += 1) {
    for (let y = southCell; y <= northCell; y += 1) {
      const bucket = buckets.get(`${x}:${y}`);

      if (!bucket) {
        continue;
      }

      for (const entryIndex of bucket) {
        candidateIndexes.add(entryIndex);
      }
    }
  }

  return [...candidateIndexes].map((entryIndex) => entries[entryIndex]);
}

function buildMajorRiverCorridorGapLayerSerial(
  riverFeatures,
  waterEntries,
  coverageGeometry,
  options,
) {
  const {
    riverHalfWidthKm,
    minSegmentLengthKm,
    maxSegmentLengthKm,
    endpointAnchorDistanceKm,
    minMidpointGapDistanceKm,
    maxMidpointGapDistanceKm,
    queryRadiusKm,
    maxCorridorFeatures,
  } = options;
  const waterIndex = buildBoundsSpatialIndex(waterEntries);
  const corridorFeatures = [];
  let processedRiverFeatureCount = 0;
  let processedSegmentCount = 0;
  const startedAt = Date.now();
  const progressEverySegments = 25000;

  for (const riverFeature of riverFeatures) {
    processedRiverFeatureCount += 1;
    const waterway = String(riverFeature?.properties?.waterway ?? "").toLowerCase();

    if (waterway !== "river" && waterway !== "canal") {
      continue;
    }

    for (const [segmentStart, segmentEnd] of extractLineSegments(riverFeature.geometry)) {
      processedSegmentCount += 1;

      if (processedSegmentCount % progressEverySegments === 0) {
        console.log(
          `Major river corridor progress: ${processedSegmentCount} segments scanned, ` +
          `${corridorFeatures.length} features appended ` +
          `(elapsed ${formatElapsedMs(Date.now() - startedAt)}).`,
        );
      }

      const segmentLengthKm = pointDistanceKm(segmentStart, segmentEnd);

      if (segmentLengthKm < minSegmentLengthKm || segmentLengthKm > maxSegmentLengthKm) {
        continue;
      }

      const midpoint = segmentMidpoint(segmentStart, segmentEnd);

      if (coverageGeometry && !pointInPolygonGeometry(midpoint, coverageGeometry)) {
        continue;
      }

      const searchBounds = bboxAroundPointKm(midpoint, queryRadiusKm);
      const nearbyWaterEntries = queryBoundsSpatialIndex(waterIndex, searchBounds);

      if (nearbyWaterEntries.length === 0) {
        continue;
      }

      const startAnchorDistanceKm = minDistanceToWaterEntriesNearPointKm(
        segmentStart,
        nearbyWaterEntries,
        queryRadiusKm,
      );
      const endAnchorDistanceKm = minDistanceToWaterEntriesNearPointKm(
        segmentEnd,
        nearbyWaterEntries,
        queryRadiusKm,
      );

      if (
        !Number.isFinite(startAnchorDistanceKm) ||
        !Number.isFinite(endAnchorDistanceKm) ||
        startAnchorDistanceKm > endpointAnchorDistanceKm ||
        endAnchorDistanceKm > endpointAnchorDistanceKm
      ) {
        continue;
      }

      const midpointGapDistanceKm = minDistanceToWaterEntriesNearPointKm(
        midpoint,
        nearbyWaterEntries,
        queryRadiusKm,
      );

      if (
        !Number.isFinite(midpointGapDistanceKm) ||
        midpointGapDistanceKm < minMidpointGapDistanceKm ||
        midpointGapDistanceKm > maxMidpointGapDistanceKm
      ) {
        continue;
      }

      const bufferedGeometry = bufferLineSegmentToPolygon(
        segmentStart,
        segmentEnd,
        riverHalfWidthKm,
      );

      if (!bufferedGeometry) {
        continue;
      }

      corridorFeatures.push({
        type: "Feature",
        properties: {
          type: "river-corridor",
          waterway,
          source: "osm-lines-gap-fill",
          name: riverFeature?.properties?.name ?? null,
        },
        geometry: bufferedGeometry,
      });

      if (corridorFeatures.length >= maxCorridorFeatures) {
        console.warn("Major river corridor fill reached feature cap during serial scan; truncating output.");
        return {
          corridorFeatures,
          processedRiverFeatureCount,
          processedSegmentCount,
        };
      }
    }
  }

  return {
    corridorFeatures,
    processedRiverFeatureCount,
    processedSegmentCount,
  };
}

async function buildMajorRiverCorridorGapLayer(waterLayer, riverLineLayer, coverageGeometry) {
  const options = {
    riverHalfWidthKm: 0.085,
    minSegmentLengthKm: 0.1,
    maxSegmentLengthKm: 0.75,
    endpointAnchorDistanceKm: 0.07,
    minMidpointGapDistanceKm: 0.004,
    maxMidpointGapDistanceKm: 0.22,
    queryRadiusKm: 0.32,
    maxCorridorFeatures: 30000,
  };
  const startedAt = Date.now();

  const waterEntries = (waterLayer.features ?? [])
    .filter(
      (feature) =>
        feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
    )
    .map((feature) => ({
      geometry: feature.geometry,
      bounds: geometryBounds(feature.geometry),
    }));

  if (waterEntries.length === 0) {
    return emptyFeatureCollection();
  }

  const riverFeatures = (riverLineLayer?.features ?? []).filter((feature) => {
    const waterway = String(feature?.properties?.waterway ?? "").toLowerCase();
    return waterway === "river" || waterway === "canal";
  });

  if (riverFeatures.length === 0) {
    return emptyFeatureCollection();
  }

  const serialResult = buildMajorRiverCorridorGapLayerSerial(
    riverFeatures,
    waterEntries,
    coverageGeometry,
    options,
  );
  let rawFeatures = serialResult.corridorFeatures;
  const processedRiverFeatureCount = serialResult.processedRiverFeatureCount;
  const processedSegmentCount = serialResult.processedSegmentCount;

  if (rawFeatures.length > options.maxCorridorFeatures) {
    console.warn(
      `Major river corridor fill exceeded cap (${rawFeatures.length} > ${options.maxCorridorFeatures}); truncating output.`,
    );
    rawFeatures = rawFeatures.slice(0, options.maxCorridorFeatures);
  }

  const corridorFeatures = rawFeatures.map((feature, index) => {
    const nextId = index + 1;

    return {
      type: "Feature",
      id: nextId,
      properties: {
        ...(feature.properties ?? {}),
        id: `river-corridor/${nextId}`,
      },
      geometry: feature.geometry,
    };
  });

  if (corridorFeatures.length > 0) {
    console.log(
      `Major river corridor fill appended ${corridorFeatures.length} features ` +
      `after scanning ${processedSegmentCount} segments across ${processedRiverFeatureCount} river features ` +
      `(${formatElapsedMs(Date.now() - startedAt)}).`,
    );
  } else {
    console.log(
      `Major river corridor fill found no eligible segments ` +
      `after scanning ${processedSegmentCount} segments across ${processedRiverFeatureCount} river features ` +
      `(${formatElapsedMs(Date.now() - startedAt)}).`,
    );
  }

  return {
    type: "FeatureCollection",
    features: corridorFeatures,
  };
}

function appendRiverCorridorGapFeatures(waterLayer, corridorLayer) {
  if (!corridorLayer || !Array.isArray(corridorLayer.features) || corridorLayer.features.length === 0) {
    return waterLayer;
  }

  return {
    type: "FeatureCollection",
    features: [
      ...(waterLayer.features ?? []),
      ...corridorLayer.features,
    ],
  };
}

function normalizeRiverName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function pointKey(point) {
  return `${roundCoordinate(point[0], 6)},${roundCoordinate(point[1], 6)}`;
}

function buildLineEdgeGraph(segments) {
  const nodes = new Map();
  const edges = segments.map((segment, index) => {
    const startKey = pointKey(segment.segmentStart);
    const endKey = pointKey(segment.segmentEnd);

    if (!nodes.has(startKey)) {
      nodes.set(startKey, segment.segmentStart);
    }

    if (!nodes.has(endKey)) {
      nodes.set(endKey, segment.segmentEnd);
    }

    return {
      id: `edge/${index + 1}`,
      startKey,
      endKey,
      segmentStart: nodes.get(startKey),
      segmentEnd: nodes.get(endKey),
      synthetic: false,
    };
  });
  const adjacency = new Map();

  for (const edge of edges) {
    const startEdges = adjacency.get(edge.startKey) ?? [];
    startEdges.push(edge);
    adjacency.set(edge.startKey, startEdges);
    const endEdges = adjacency.get(edge.endKey) ?? [];
    endEdges.push(edge);
    adjacency.set(edge.endKey, endEdges);
  }

  return { nodes, edges, adjacency };
}

function computeGraphComponents(nodes, adjacency) {
  const visited = new Set();
  const components = [];

  for (const nodeKey of nodes.keys()) {
    if (visited.has(nodeKey)) {
      continue;
    }

    const queue = [nodeKey];
    const componentNodeKeys = [];
    visited.add(nodeKey);

    while (queue.length > 0) {
      const current = queue.shift();
      componentNodeKeys.push(current);

      for (const edge of adjacency.get(current) ?? []) {
        const next = edge.startKey === current ? edge.endKey : edge.startKey;

        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    components.push(componentNodeKeys);
  }

  return components;
}

function componentCentroidLongitude(componentNodeKeys, nodes) {
  if (componentNodeKeys.length === 0) {
    return 0;
  }

  const sum = componentNodeKeys.reduce(
    (total, nodeKey) => total + (nodes.get(nodeKey)?.[0] ?? 0),
    0,
  );

  return sum / componentNodeKeys.length;
}

function nodeKeysForComponentEnds(componentNodeKeys, adjacency) {
  const endpoints = componentNodeKeys.filter(
    (nodeKey) => (adjacency.get(nodeKey)?.length ?? 0) <= 1,
  );

  return endpoints.length > 0 ? endpoints : componentNodeKeys;
}

function edgeMidpoint(edge) {
  return [
    (edge.segmentStart[0] + edge.segmentEnd[0]) / 2,
    (edge.segmentStart[1] + edge.segmentEnd[1]) / 2,
  ];
}

async function createElevationSampler(elevationRasterPath) {
  if (!elevationRasterPath || !existsSync(elevationRasterPath)) {
    return null;
  }

  const locationInfoAvailable = await commandExists(gdalTools.locationInfo);

  if (!locationInfoAvailable) {
    return null;
  }

  const cache = new Map();

  return async (point) => {
    const cacheKey = pointKey(point);

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    try {
      const { stdout } = await runCommandCapture(gdalTools.locationInfo, [
        "-valonly",
        "-wgs84",
        elevationRasterPath,
        `${point[0]}`,
        `${point[1]}`,
      ]);
      const firstToken = stdout.trim().split(/\s+/u)[0];
      const value = Number.parseFloat(firstToken);
      const parsed = Number.isFinite(value) ? value : null;
      cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      cache.set(cacheKey, null);
      return null;
    }
  };
}

async function chooseBestComponentConnector(
  leftComponentNodeKeys,
  rightComponentNodeKeys,
  nodes,
  adjacency,
  options,
) {
  const {
    maxBridgeKm,
    sampleElevation,
    dominantDirection,
  } = options;
  const leftCandidates = nodeKeysForComponentEnds(leftComponentNodeKeys, adjacency);
  const rightCandidates = nodeKeysForComponentEnds(rightComponentNodeKeys, adjacency);
  const pairs = [];

  for (const leftNodeKey of leftCandidates) {
    const leftPoint = nodes.get(leftNodeKey);

    for (const rightNodeKey of rightCandidates) {
      const rightPoint = nodes.get(rightNodeKey);
      pairs.push({
        leftNodeKey,
        rightNodeKey,
        leftPoint,
        rightPoint,
        distanceKm: pointDistanceKm(leftPoint, rightPoint),
      });
    }
  }

  if (pairs.length === 0) {
    return null;
  }

  pairs.sort((left, right) => left.distanceKm - right.distanceKm);
  const bridgeCandidates = pairs.filter((pair) => pair.distanceKm <= maxBridgeKm);
  const shortlisted = (bridgeCandidates.length > 0 ? bridgeCandidates : pairs).slice(0, 20);
  let best = null;

  for (const candidate of shortlisted) {
    const leftElevation = sampleElevation ? await sampleElevation(candidate.leftPoint) : null;
    const rightElevation = sampleElevation ? await sampleElevation(candidate.rightPoint) : null;
    const uphillMeters =
      Number.isFinite(leftElevation) && Number.isFinite(rightElevation)
        ? Math.max(0, rightElevation - leftElevation)
        : 0;
    const connectorDirection = (() => {
      const referenceLatitude = (candidate.leftPoint[1] + candidate.rightPoint[1]) / 2;
      const [ax, ay] = toKilometers(candidate.leftPoint, referenceLatitude);
      const [bx, by] = toKilometers(candidate.rightPoint, referenceLatitude);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);

      if (length <= 0) {
        return null;
      }

      return [dx / length, dy / length];
    })();
    const directionPenaltyKm =
      dominantDirection && connectorDirection
        ? (1 - Math.max(-1, Math.min(1, (
            connectorDirection[0] * dominantDirection[0] +
            connectorDirection[1] * dominantDirection[1]
          )))) * 0.45
        : 0;
    const score = candidate.distanceKm + uphillMeters * 0.014 + directionPenaltyKm;

    if (!best || score < best.score) {
      best = {
        ...candidate,
        score,
      };
    }
  }

  return best ?? pairs[0];
}

function connectedPathExistsBetweenExtremes(nodes, edges) {
  if (edges.length === 0) {
    return false;
  }

  const adjacency = new Map();

  for (const edge of edges) {
    const startEdges = adjacency.get(edge.startKey) ?? [];
    startEdges.push(edge);
    adjacency.set(edge.startKey, startEdges);
    const endEdges = adjacency.get(edge.endKey) ?? [];
    endEdges.push(edge);
    adjacency.set(edge.endKey, endEdges);
  }

  const activeNodeKeys = [...adjacency.keys()];

  if (activeNodeKeys.length < 2) {
    return false;
  }

  const westNodeKey = activeNodeKeys.reduce((best, current) =>
    (nodes.get(current)?.[0] ?? Infinity) < (nodes.get(best)?.[0] ?? Infinity) ? current : best);
  const eastNodeKey = activeNodeKeys.reduce((best, current) =>
    (nodes.get(current)?.[0] ?? -Infinity) > (nodes.get(best)?.[0] ?? -Infinity) ? current : best);
  const visited = new Set([westNodeKey]);
  const queue = [westNodeKey];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === eastNodeKey) {
      return true;
    }

    for (const edge of adjacency.get(current) ?? []) {
      const next = edge.startKey === current ? edge.endKey : edge.startKey;

      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

async function buildFocusedHexRiverReconstructionLayer(
  waterLayer,
  riverLineLayer,
  elevationRasterPath,
) {
  const targetHexIds = ["HX-W18-N50", "HX-W17-N50"];
  const hexPath = path.join(processedRoot, "hex-cells.geojson");

  if (!existsSync(hexPath) || !riverLineLayer) {
    return emptyFeatureCollection();
  }

  const hexCells = await readLocalGeoJson(hexPath, "hex-cells");
  const targetHexFeatures = (hexCells.features ?? []).filter((feature) =>
    targetHexIds.includes(feature?.properties?.id),
  );

  if (targetHexFeatures.length !== targetHexIds.length) {
    console.warn("Focused river reconstruction skipped: target hexes not found.");
    return emptyFeatureCollection();
  }

  const candidateRiverSegments = [];

  for (const feature of riverLineLayer.features ?? []) {
    const name = typeof feature?.properties?.name === "string"
      ? feature.properties.name.trim()
      : "";
    const nameKey = normalizeRiverName(name);

    for (const [segmentStart, segmentEnd] of extractLineSegments(feature.geometry)) {
      const midpoint = segmentMidpoint(segmentStart, segmentEnd);
      const containingHex = targetHexFeatures.find((hexFeature) =>
        pointInPolygonGeometry(midpoint, hexFeature.geometry),
      );

      if (!containingHex) {
        continue;
      }

      candidateRiverSegments.push({
        name,
        nameKey,
        hexId: containingHex.properties?.id ?? null,
        segmentStart,
        segmentEnd,
      });
    }
  }

  if (candidateRiverSegments.length === 0) {
    return emptyFeatureCollection();
  }
  const startedAt = Date.now();
  console.log(
    `Focused river reconstruction: ${candidateRiverSegments.length} candidate segments across ` +
    `${targetHexIds.join(", ")}.`,
  );

  const riverStatsByName = new Map();

  for (const segment of candidateRiverSegments) {
    const stats = riverStatsByName.get(segment.nameKey) ?? {
      totalLengthKm: 0,
      hexIds: new Set(),
    };
    stats.totalLengthKm += pointDistanceKm(segment.segmentStart, segment.segmentEnd);
    if (segment.hexId) {
      stats.hexIds.add(segment.hexId);
    }
    riverStatsByName.set(segment.nameKey, stats);
  }

  const dominantRiverNameKey = [...riverStatsByName.entries()]
    .filter(([, stats]) => stats.hexIds.size >= 2)
    .sort((left, right) => right[1].totalLengthKm - left[1].totalLengthKm)[0]?.[0] ??
    [...riverStatsByName.entries()].sort((left, right) => right[1].totalLengthKm - left[1].totalLengthKm)[0]?.[0] ??
    "";

  if (!dominantRiverNameKey) {
    return emptyFeatureCollection();
  }

  const dominantRiverSegments = candidateRiverSegments.filter(
    (segment) => segment.nameKey === dominantRiverNameKey,
  );
  const dominantDirection = (() => {
    let sumX = 0;
    let sumY = 0;

    for (const segment of dominantRiverSegments) {
      const referenceLatitude = (segment.segmentStart[1] + segment.segmentEnd[1]) / 2;
      const [ax, ay] = toKilometers(segment.segmentStart, referenceLatitude);
      const [bx, by] = toKilometers(segment.segmentEnd, referenceLatitude);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);

      if (length <= 0) {
        continue;
      }

      sumX += dx / length;
      sumY += dy / length;
    }

    const totalLength = Math.hypot(sumX, sumY);

    if (totalLength <= 0) {
      return null;
    }

    return [sumX / totalLength, sumY / totalLength];
  })();
  const baseGraph = buildLineEdgeGraph(dominantRiverSegments);
  const sampleElevation = await createElevationSampler(elevationRasterPath);
  const waterEntries = (waterLayer.features ?? [])
    .filter(
      (feature) =>
        feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
    )
    .map((feature) => ({
      feature,
      bounds: geometryBounds(feature.geometry),
    }));
  const waterIndex = buildBoundsSpatialIndex(waterEntries);
  const midpointDistanceCache = new Map();
  const attemptCount = 4;
  let bestAttempt = null;

  for (let attemptIndex = 0; attemptIndex < attemptCount; attemptIndex += 1) {
    const maxBridgeKm = 0.32 + attemptIndex * 0.28;
    const waterCoveredThresholdKm = 0.02 + attemptIndex * 0.01;
    const riverHalfWidthKm = 0.09 + attemptIndex * 0.02;
    const nodes = new Map(baseGraph.nodes);
    const edges = [...baseGraph.edges];
    let adjacency = new Map();

    function rebuildAdjacency() {
      adjacency = new Map();

      for (const edge of edges) {
        const startEdges = adjacency.get(edge.startKey) ?? [];
        startEdges.push(edge);
        adjacency.set(edge.startKey, startEdges);
        const endEdges = adjacency.get(edge.endKey) ?? [];
        endEdges.push(edge);
        adjacency.set(edge.endKey, endEdges);
      }
    }

    rebuildAdjacency();

    for (let connectorRound = 0; connectorRound < 12; connectorRound += 1) {
      const components = computeGraphComponents(nodes, adjacency);

      if (components.length <= 1) {
        break;
      }

      components.sort(
        (left, right) =>
          componentCentroidLongitude(left, nodes) - componentCentroidLongitude(right, nodes),
      );
      let addedConnectorInRound = false;

      for (let componentIndex = 0; componentIndex < components.length - 1; componentIndex += 1) {
        const leftComponent = components[componentIndex];
        const rightComponent = components[componentIndex + 1];
        const connector = await chooseBestComponentConnector(
          leftComponent,
          rightComponent,
          nodes,
          adjacency,
          {
            maxBridgeKm,
            sampleElevation,
            dominantDirection,
          },
        );

        if (!connector) {
          continue;
        }

        const startKey = pointKey(connector.leftPoint);
        const endKey = pointKey(connector.rightPoint);

        if (startKey === endKey) {
          continue;
        }

        if (!nodes.has(startKey)) {
          nodes.set(startKey, connector.leftPoint);
        }

        if (!nodes.has(endKey)) {
          nodes.set(endKey, connector.rightPoint);
        }

        edges.push({
          id: `focused-connector/${attemptIndex + 1}/${edges.length + 1}`,
          startKey,
          endKey,
          segmentStart: nodes.get(startKey),
          segmentEnd: nodes.get(endKey),
          synthetic: true,
        });
        addedConnectorInRound = true;
      }

      if (!addedConnectorInRound) {
        break;
      }

      rebuildAdjacency();
    }

    const corridorFeatures = [];
    const visibleEdges = [];
    let nextId = 1;

    for (const edge of edges) {
      const midpoint = edgeMidpoint(edge);
      const distanceCacheKey = pointKey(midpoint);
      const midpointDistanceKm = midpointDistanceCache.has(distanceCacheKey)
        ? midpointDistanceCache.get(distanceCacheKey)
        : (() => {
            const nearbyWaterEntries = queryBoundsSpatialIndex(
              waterIndex,
              bboxAroundPointKm(midpoint, 0.35),
            );
            const distance = minDistanceToWaterEntriesNearPointKm(
              midpoint,
              nearbyWaterEntries,
              0.35,
            );
            midpointDistanceCache.set(distanceCacheKey, distance);
            return distance;
          })();
      const coveredByWater = Number.isFinite(midpointDistanceKm) &&
        midpointDistanceKm <= waterCoveredThresholdKm;
      const needsCorridor = !coveredByWater || edge.synthetic;

      if (needsCorridor) {
        const geometry = bufferLineSegmentToPolygon(
          edge.segmentStart,
          edge.segmentEnd,
          riverHalfWidthKm,
        );

        if (geometry) {
          corridorFeatures.push({
            type: "Feature",
            id: nextId,
            properties: {
              id: `river-corridor/focused/${nextId}`,
              type: "river-corridor",
              source: "focused-hex-reconstruction",
              riverName: dominantRiverNameKey,
              attempt: attemptIndex + 1,
            },
            geometry,
          });
          nextId += 1;
        }
      }

      if (coveredByWater || needsCorridor) {
        visibleEdges.push(edge);
      }
    }

    const connected = connectedPathExistsBetweenExtremes(nodes, visibleEdges);
    console.log(
      `Focused river reconstruction attempt ${attemptIndex + 1}/${attemptCount}: ` +
      `${connected ? "connected" : "not connected"}, corridors=${corridorFeatures.length}, ` +
      `maxBridgeKm=${maxBridgeKm.toFixed(2)}.`,
    );
    bestAttempt = {
      connected,
      corridorFeatures,
      attemptIndex,
      dominantRiverNameKey,
    };

    if (connected) {
      console.log(
        `Focused river reconstruction connected for ${targetHexIds.join(", ")} ` +
        `on attempt ${attemptIndex + 1} (${corridorFeatures.length} features, ` +
        `${formatElapsedMs(Date.now() - startedAt)}).`,
      );
      break;
    }
  }

  if (!bestAttempt || bestAttempt.corridorFeatures.length === 0) {
    return emptyFeatureCollection();
  }

  if (!bestAttempt.connected) {
    console.warn(
      `Focused river reconstruction remained disconnected after ${attemptCount} attempts; ` +
      `using best-effort corridors (${bestAttempt.corridorFeatures.length} features, ` +
      `${formatElapsedMs(Date.now() - startedAt)}).`,
    );
  }

  return {
    type: "FeatureCollection",
    features: bestAttempt.corridorFeatures,
  };
}

function mergeWaterBodiesWithCoverageFallback(primary, fallback, primaryCoverageGeometry) {
  if (!primaryCoverageGeometry) {
    return primary;
  }

  const mergedFeatures = [...(primary.features ?? [])];
  const seenIds = new Set(
    mergedFeatures
      .map((feature) => feature?.properties?.id ?? feature?.id ?? null)
      .filter((value) => typeof value === "string" || typeof value === "number"),
  );

  for (const fallbackFeature of fallback.features ?? []) {
    if (!fallbackFeature.geometry) {
      continue;
    }

    const representativePoint = representativePointForGeometry(fallbackFeature.geometry);
    if (representativePoint && pointInPolygonGeometry(representativePoint, primaryCoverageGeometry)) {
      continue;
    }

    const featureId = fallbackFeature?.properties?.id ?? fallbackFeature?.id ?? null;
    if (
      (typeof featureId === "string" || typeof featureId === "number") &&
      seenIds.has(featureId)
    ) {
      continue;
    }

    mergedFeatures.push(fallbackFeature);
    if (typeof featureId === "string" || typeof featureId === "number") {
      seenIds.add(featureId);
    }
  }

  return {
    type: "FeatureCollection",
    features: mergedFeatures,
  };
}

// Write processed GeoJSON outputs into the application-facing data directory.
async function writeGeoJson(relativePath, data) {
  const targetPath = path.join(processedRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");
}

// Resolve the actual GeoBoundaries GeoJSON download URL from the metadata endpoint.
async function resolveGeoBoundariesDownload(apiUrl, metadataCacheKey) {
  const metadata = await fetchJson(
    apiUrl,
    metadataCacheKey,
  );
  return metadata.gjDownloadURL ?? metadata.simplifiedGeometryGeoJSON;
}

async function loadAdm2Subdivisions() {
  if (existsSync(sources.adm2LocalGeoJson)) {
    console.log("local hit  gadm/adm2-geometry");
    return readLocalGeoJson(sources.adm2LocalGeoJson, "gadm/adm2-geometry");
  }

  const adm2Url = await resolveGeoBoundariesDownload(
    sources.adm2Api,
    "geoboundaries/adm2-metadata",
  );
  return fetchJson(adm2Url, "geoboundaries/adm2-geometry");
}

function localOsmPbfCandidates() {
  return [
    path.join(rawRoot, "osm", "ukraine-osm-extract.pbf"),
    path.join(cacheRoot, "raw-intake", "osm", "ukraine-latest.osm.pbf"),
  ];
}

function resolveLocalOsmPbfPath() {
  return localOsmPbfCandidates().find((candidate) => existsSync(candidate)) ?? null;
}

function normalizeExtractedWaterBodies(featureCollection) {
  // Keep much higher fidelity for Ukraine water polygons because this layer is
  // the primary zoomed-in reference in operational areas.
  const minApproxAreaKm2 = 0.005;
  const minSegmentKm = 0.03;
  const maxVertices = 1200;

  function simplifyWaterRing(ring) {
    const stabilized = simplifyRingByMinSegmentKm(closeRing(ring), minSegmentKm);
    if (stabilized.length <= maxVertices) {
      return stabilized;
    }

    return simplifyRing(stabilized, maxVertices);
  }

  function simplifyPolygonRings(rings) {
    if (!Array.isArray(rings) || rings.length === 0) {
      return null;
    }

    const outerRing = simplifyWaterRing(rings[0]);
    if (outerRing.length < 4) {
      return null;
    }

    if (approximateBoundsAreaKm2(outerRing) < minApproxAreaKm2) {
      return null;
    }

    const holes = rings
      .slice(1)
      .map((ring) => simplifyWaterRing(ring))
      .filter((ring) => ring.length >= 4);

    return [outerRing, ...holes];
  }

  return {
    type: "FeatureCollection",
    features: (featureCollection.features ?? [])
      .filter(
        (feature) =>
          feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
      )
      .map((feature, index) => {
        const tags = feature.properties ?? {};
        const osmId = tags.osm_id ?? tags.osm_way_id ?? index + 1;
        const waterType = tags.water ?? tags.natural ?? tags.waterway ?? tags.landuse ?? "water";
        const geometry = feature.geometry.type === "Polygon"
          ? (() => {
              const coordinates = simplifyPolygonRings(feature.geometry.coordinates);
              if (!coordinates) {
                return null;
              }

              return {
                type: "Polygon",
                coordinates,
              };
            })()
          : (() => {
              const polygons = feature.geometry.coordinates
                .map((polygon) => simplifyPolygonRings(polygon))
                .filter((polygon) => Boolean(polygon));
              if (polygons.length === 0) {
                return null;
              }

              return {
                type: "MultiPolygon",
                coordinates: polygons,
              };
            })();

        if (!geometry) {
          return null;
        }

        return {
          type: "Feature",
          id: index + 1,
          properties: {
            id: `osm/${osmId}`,
            type: String(waterType),
          },
          geometry,
        };
      })
      .filter((feature) => Boolean(feature)),
  };
}

function normalizeExtractedMajorRiverLines(featureCollection) {
  const minSegmentKm = 0.12;

  function geometryLengthKm(geometry) {
    return extractLineSegments(geometry).reduce(
      (sum, [segmentStart, segmentEnd]) => sum + pointDistanceKm(segmentStart, segmentEnd),
      0,
    );
  }

  function normalizeLineGeometry(geometry) {
    if (!geometry) {
      return null;
    }

    if (geometry.type === "LineString") {
      const coordinates = simplifyLineByMinSegmentKm(geometry.coordinates, minSegmentKm);
      return coordinates.length >= 2
        ? {
          type: "LineString",
          coordinates,
        }
        : null;
    }

    if (geometry.type === "MultiLineString") {
      const lines = geometry.coordinates
        .map((line) => simplifyLineByMinSegmentKm(line, minSegmentKm))
        .filter((line) => line.length >= 2);
      return lines.length > 0
        ? {
          type: "MultiLineString",
          coordinates: lines,
        }
        : null;
    }

    return null;
  }

  return {
    type: "FeatureCollection",
    features: (featureCollection.features ?? [])
      .map((feature, index) => {
        const tags = feature.properties ?? {};
        const waterway = String(tags.waterway ?? "").toLowerCase();

        if (waterway !== "river") {
          return null;
        }

        const geometry = normalizeLineGeometry(feature.geometry);

        if (!geometry) {
          return null;
        }

        const lengthKm = geometryLengthKm(geometry);
        const hasName = typeof tags.name === "string" && tags.name.trim() !== "";
        const isMajorRiver = lengthKm >= 40 || (hasName && lengthKm >= 12);

        if (!isMajorRiver) {
          return null;
        }

        const osmId = tags.osm_id ?? tags.osm_way_id ?? index + 1;

        return {
          type: "Feature",
          id: index + 1,
          properties: {
            id: `way/${osmId}`,
            waterway,
            name: tags.name ? String(tags.name) : null,
            lengthKm: Number(lengthKm.toFixed(3)),
          },
          geometry,
        };
      })
      .filter((feature) => Boolean(feature)),
  };
}

async function extractMajorRiverLinesFromLocalOsmPbf() {
  const cacheKey = "osm/rivers/pbf-lines";
  const extractSchemaVersion = 1;
  const pbfPath = resolveLocalOsmPbfPath();

  if (!pbfPath) {
    console.warn("Skipping local PBF river extraction: no local Ukraine OSM PBF found.");
    return null;
  }

  const pbfStats = await stat(pbfPath);
  const pbfMtimeMs = Math.trunc(pbfStats.mtimeMs);
  const relativeOutputPath = path.join("osm", "rivers-lines-from-pbf.geojson");
  const outputPath = cachePathForBinary(relativeOutputPath);

  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedBinary(cacheKey);

    if (
      cached &&
      cached.sourcePbfPath === pbfPath &&
      cached.sourcePbfMtimeMs === pbfMtimeMs &&
      cached.extractSchemaVersion === extractSchemaVersion
    ) {
      console.log("cache hit  osm/rivers/pbf-lines");
      return normalizeExtractedMajorRiverLines(
        await readLocalGeoJson(cached.absolutePath, "osm/rivers/pbf-lines"),
      );
    }
  }

  const ogr2ogrAvailable = await commandExists(gdalTools.ogr2ogr);

  if (!ogr2ogrAvailable) {
    console.warn("Skipping local PBF river extraction: `ogr2ogr` is not available.");
    return null;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const startedAt = Date.now();
  console.log("Starting local PBF major-river extraction...");

  const whereClause = "waterway = 'river'";
  const tempOutputPath = `${outputPath}.tmp-${Date.now()}`;

  try {
    await runCommand(gdalTools.ogr2ogr, [
      "-skipfailures",
      "-f",
      "GeoJSON",
      tempOutputPath,
      pbfPath,
      "lines",
      "-spat",
      `${theaterBbox.west}`,
      `${theaterBbox.south}`,
      `${theaterBbox.east}`,
      `${theaterBbox.north}`,
      "-where",
      whereClause,
      "-t_srs",
      "EPSG:4326",
      "-lco",
      "RFC7946=YES",
    ]);

    await copyFile(tempOutputPath, outputPath);
    await writeCachedBinary(cacheKey, relativeOutputPath, {
      sourcePbfPath: pbfPath,
      sourcePbfMtimeMs: pbfMtimeMs,
      extractSchemaVersion,
    });

    console.log(
      `Completed local PBF major-river extraction (${formatElapsedMs(Date.now() - startedAt)}).`,
    );

    return normalizeExtractedMajorRiverLines(
      await readLocalGeoJson(tempOutputPath, "osm/rivers/pbf-lines"),
    );
  } finally {
    if (existsSync(tempOutputPath)) {
      await unlink(tempOutputPath);
    }
  }
}

async function extractWaterBodiesFromLocalOsmPbf() {
  const cacheKey = "osm/water-bodies/pbf-extract";
  const extractSchemaVersion = 3;
  const pbfPath = resolveLocalOsmPbfPath();

  if (!pbfPath) {
    console.warn("Skipping local PBF water extraction: no local Ukraine OSM PBF found.");
    return null;
  }

  const pbfStats = await stat(pbfPath);
  const pbfMtimeMs = Math.trunc(pbfStats.mtimeMs);
  const relativeOutputPath = path.join("osm", "water-bodies-from-pbf.geojson");
  const outputPath = cachePathForBinary(relativeOutputPath);

  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedBinary(cacheKey);

    if (
      cached &&
      cached.sourcePbfPath === pbfPath &&
      cached.sourcePbfMtimeMs === pbfMtimeMs &&
      cached.extractSchemaVersion === extractSchemaVersion
    ) {
      console.log("cache hit  osm/water-bodies/pbf-extract");
      return normalizeExtractedWaterBodies(
        await readLocalGeoJson(cached.absolutePath, "osm/water-bodies/pbf-extract"),
      );
    }
  }

  const ogr2ogrAvailable = await commandExists(gdalTools.ogr2ogr);

  if (!ogr2ogrAvailable) {
    console.warn("Skipping local PBF water extraction: `ogr2ogr` is not available.");
    return null;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const startedAt = Date.now();
  console.log("Starting local PBF water-body extraction...");

  const whereClause = [
    "natural = 'water'",
    "landuse IN ('reservoir','basin')",
    `(
      other_tags IS NOT NULL
      AND (
        other_tags LIKE '%"water"=>"lake"%'
        OR other_tags LIKE '%"water"=>"reservoir"%'
        OR other_tags LIKE '%"water"=>"basin"%'
        OR other_tags LIKE '%"water"=>"river"%'
        OR other_tags LIKE '%"water"=>"oxbow"%'
        OR other_tags LIKE '%"water"=>"canal"%'
        OR other_tags LIKE '%"water"=>"lagoon"%'
        OR other_tags LIKE '%"water"=>"pond"%'
        OR other_tags LIKE '%"waterway"=>"riverbank"%'
        OR other_tags LIKE '%"waterway"=>"canal"%'
      )
    )`,
  ].join(" OR ").replace(/\s+/g, " ").trim();
  const tempOutputPath = `${outputPath}.tmp-${Date.now()}`;

  try {
    await runCommand(gdalTools.ogr2ogr, [
      "-skipfailures",
      "-f",
      "GeoJSON",
      tempOutputPath,
      pbfPath,
      "multipolygons",
      "-makevalid",
      "-nlt",
      "MULTIPOLYGON",
      "-spat",
      `${theaterBbox.west}`,
      `${theaterBbox.south}`,
      `${theaterBbox.east}`,
      `${theaterBbox.north}`,
      "-where",
      whereClause,
      "-t_srs",
      "EPSG:4326",
      "-lco",
      "RFC7946=YES",
    ]);

    await copyFile(tempOutputPath, outputPath);
    await writeCachedBinary(cacheKey, relativeOutputPath, {
      sourcePbfPath: pbfPath,
      sourcePbfMtimeMs: pbfMtimeMs,
      extractSchemaVersion,
    });

    console.log(
      `Completed local PBF water-body extraction (${formatElapsedMs(Date.now() - startedAt)}).`,
    );

    return normalizeExtractedWaterBodies(
      await readLocalGeoJson(tempOutputPath, "osm/water-bodies/pbf-extract"),
    );
  } finally {
    if (existsSync(tempOutputPath)) {
      await unlink(tempOutputPath);
    }
  }
}

// Print a read-only report of every known cache entry and its freshness metadata.
async function printCacheReport() {
  const entries = await Promise.all(getKnownCacheKeys().map((cacheKey) => describeCacheEntry(cacheKey)));

  console.log(`Cache schema version: ${cacheSchemaVersion}`);
  console.log(`Cache TTL: ${formatDuration(cacheTtlMs)}`);

  for (const entry of entries) {
    console.log(
      [
        entry.status.padEnd(15, " "),
        entry.cacheKey,
        `schema=${entry.version}`,
        `cachedAt=${entry.cachedAt}`,
        `ttlRemaining=${entry.ttlRemaining}`,
      ].join(" | "),
    );
  }
}

// Build all fallback public layers, or run a limited smoke test when requested.
async function main() {
  await mkdir(cacheRoot, { recursive: true });
  await mkdir(layersRoot, { recursive: true });
  console.log(
    `Using worker concurrency ${workerConcurrency} (tile fetch concurrency ${tileFetchConcurrency}).`,
  );

  if (cacheReportMode) {
    await printCacheReport();
    return;
  }

  if (elevationOnlyMode) {
    await ensureElevationOutputs();
    console.log("Elevation acquisition completed through the public cache pipeline.");
    return;
  }

  if (smokeTestMode === "static") {
    const [adm0Url, adm1Url] = await Promise.all([
      resolveGeoBoundariesDownload(sources.adm0Api, "geoboundaries/adm0-metadata"),
      resolveGeoBoundariesDownload(sources.adm1Api, "geoboundaries/adm1-metadata"),
    ]);

    await Promise.all([
      fetchJson(adm0Url, "geoboundaries/adm0-geometry"),
      fetchJson(adm1Url, "geoboundaries/adm1-geometry"),
      loadAdm2Subdivisions(),
      fetchJson(sources.rivers, "natural-earth/rivers"),
      fetchJson(sources.lakes, "natural-earth/lakes"),
      fetchJson(sources.seas, "natural-earth/seas"),
      fetchJson(sources.roads, "natural-earth/roads"),
      fetchJson(sources.railways, "natural-earth/railways"),
      fetchJson(sources.countries, "natural-earth/countries"),
      fetchJson(sources.countryBoundaryLines, "natural-earth/country-boundary-lines"),
      fetchJson(sources.urbanAreas, "natural-earth/urban-areas"),
    ]);
    console.log("Smoke test completed for static public sources.");
    return;
  }

  if (smokeTestMode === "settlements") {
    await fetchOverpassJson(overpassPlaceQuery(theaterBbox));
    console.log("Smoke test completed for Overpass settlements.");
    return;
  }

  if (smokeTestMode === "wetlands") {
    await fetchTiledAreaLayer(
      "wetlands",
      ['["natural"="wetland"]', "[wetland]"],
      (tags) => ({
        type: tags.wetland ?? tags.natural ?? "wetland",
      }),
      {
        minApproxAreaKm2: 2,
        maxVertices: 32,
      },
    );
    console.log("Smoke test completed for Overpass wetlands.");
    return;
  }

  if (smokeTestMode === "forests") {
    await fetchTiledAreaLayer(
      "forests",
      ['["landuse"="forest"]', '["natural"="wood"]'],
      (tags) => ({
        type: tags.landuse === "forest" ? "forest" : "wood",
      }),
      {
        minApproxAreaKm2: 8,
        maxVertices: 36,
      },
    );
    console.log("Smoke test completed for Overpass forests.");
    return;
  }

  if (smokeTestMode === "water-bodies") {
    await fetchTiledAreaLayer(
      "water-bodies",
      ['["natural"="water"]', "[water]", '["waterway"="riverbank"]', '["landuse"="reservoir"]'],
      (tags) => ({
        type: tags.water ?? tags.natural ?? tags.waterway ?? tags.landuse ?? "water",
      }),
      {
        minApproxAreaKm2: 0.05,
        maxVertices: 160,
      },
    );
    console.log("Smoke test completed for Overpass water-body polygons.");
    return;
  }

  const [adm0Url, adm1Url] = await Promise.all([
    resolveGeoBoundariesDownload(sources.adm0Api, "geoboundaries/adm0-metadata"),
    resolveGeoBoundariesDownload(sources.adm1Api, "geoboundaries/adm1-metadata"),
  ]);

  const [
    theaterBoundary,
    oblastBoundaries,
    oblastSubdivisions,
    rivers,
    lakes,
    seas,
    roads,
    railways,
    countries,
    countryBoundaryLines,
    urbanAreas,
  ] = await Promise.all([
    fetchJson(adm0Url, "geoboundaries/adm0-geometry"),
    fetchJson(adm1Url, "geoboundaries/adm1-geometry"),
    loadAdm2Subdivisions(),
    fetchJson(sources.rivers, "natural-earth/rivers"),
    fetchJson(sources.lakes, "natural-earth/lakes"),
    fetchJson(sources.seas, "natural-earth/seas"),
    fetchJson(sources.roads, "natural-earth/roads"),
    fetchJson(sources.railways, "natural-earth/railways"),
    fetchJson(sources.countries, "natural-earth/countries"),
    fetchJson(sources.countryBoundaryLines, "natural-earth/country-boundary-lines"),
    fetchJson(sources.urbanAreas, "natural-earth/urban-areas"),
  ]);

  const pbfExtractionStartedAt = Date.now();
  console.log("Starting local OSM PBF extraction jobs in parallel...");
  const pbfWaterPromise = extractWaterBodiesFromLocalOsmPbf()
    .then((value) => {
      console.log(
        `Local PBF water-body job finished (${formatElapsedMs(Date.now() - pbfExtractionStartedAt)}).`,
      );
      return value;
    });
  const pbfRiversPromise = extractMajorRiverLinesFromLocalOsmPbf()
    .then((value) => {
      console.log(
        `Local PBF major-river job finished (${formatElapsedMs(Date.now() - pbfExtractionStartedAt)}).`,
      );
      return value;
    });
  const pbfExtractionPromise = Promise.all([
    pbfWaterPromise,
    pbfRiversPromise,
  ]).then((result) => {
    console.log(
      `All local OSM PBF extraction jobs completed (${formatElapsedMs(Date.now() - pbfExtractionStartedAt)}).`,
    );
    return result;
  });
  const settlements = await fetchOverpassJson(overpassPlaceQuery(theaterBbox));
  const forests = await fetchTiledAreaLayer(
    "forests",
    ['["landuse"="forest"]', '["natural"="wood"]'],
    (tags) => ({
      type: tags.landuse === "forest" ? "forest" : "wood",
    }),
    {
      minApproxAreaKm2: 0.4,
      maxVertices: 120,
    },
  );
  const wetlands = await fetchTiledAreaLayer(
    "wetlands",
    ['["natural"="wetland"]', "[wetland]"],
    (tags) => ({
      type: tags.wetland ?? tags.natural ?? "wetland",
    }),
    {
      minApproxAreaKm2: 2,
      maxVertices: 32,
    },
  );
  const osmWaterBodiesPrototype = await fetchTiledAreaLayer(
    "water-bodies",
    ['["natural"="water"]', "[water]", '["waterway"="riverbank"]', '["landuse"="reservoir"]'],
    (tags) => ({
      type: tags.water ?? tags.natural ?? tags.waterway ?? tags.landuse ?? "water",
    }),
    {
      minApproxAreaKm2: 0.05,
      maxVertices: 120,
    },
  );
  const [osmWaterBodiesFromPbf, osmMajorRiverLinesFromPbf] = await pbfExtractionPromise;

  let elevationAvailable = false;
  let hillshadeLayerPath = "terrain/hillshade-clipped.png";
  const elevationRasterPath = path.join(processedRoot, "terrain", "elevation-clipped.tif");

  if (!skipElevationMode) {
    try {
      const elevationOutputs = await ensureElevationOutputs();
      hillshadeLayerPath = elevationOutputs?.hillshadeLayerPath ?? hillshadeLayerPath;
      elevationAvailable = true;
    } catch (error) {
      console.warn(`Skipping elevation/hillshade in public build: ${error.message}`);
    }
  } else {
    console.log("Skipping elevation/hillshade in public build due to --skip-elevation.");
    const existingHillshadePath = detectExistingHillshadeLayerPath();
    if (existsSync(elevationRasterPath) && existingHillshadePath) {
      elevationAvailable = true;
      hillshadeLayerPath = existingHillshadePath;
    }
  }

  const postElevationVectorPrepStartedAt = Date.now();
  console.log("Starting post-elevation vector assembly...");
  const filteredLayers = {
    "layers/theater-boundary.geojson": theaterBoundary,
    "layers/oblast-boundaries.geojson": oblastBoundaries,
    "layers/oblast-label-points.geojson": emptyFeatureCollection(),
    "layers/oblast-subdivisions.geojson": emptyFeatureCollection(),
    "layers/oblast-subdivision-label-points.geojson": emptyFeatureCollection(),
    "layers/rivers.geojson": filterFeatureCollectionToBbox(rivers, theaterBbox),
    "layers/water-bodies.geojson": filterFeatureCollectionToBbox(
      osmWaterBodiesPrototype,
      theaterBbox,
    ),
    "layers/water-bodies-osm-prototype.geojson": osmWaterBodiesPrototype,
    "layers/seas.geojson": filterFeatureCollectionToBbox(seas, theaterBbox),
    "layers/wetlands.geojson": wetlands,
    "layers/forests.geojson": forests,
    "layers/roads.geojson": filterFeatureCollectionToBbox(roads, theaterBbox),
    "layers/railways.geojson": filterFeatureCollectionToBbox(railways, theaterBbox),
    "layers/country-boundaries.geojson": buildCountryBoundaryLayer(
      filterFeatureCollectionToBbox(countries, theaterBbox),
    ),
    "layers/country-label-guides.geojson": emptyFeatureCollection(),
    "layers/country-boundary-lines.geojson": filterFeatureCollectionToBbox(
      countryBoundaryLines,
      theaterBbox,
    ),
    "layers/major-city-urban-areas.geojson": filterMajorCityUrbanAreas(
      filterFeatureCollectionToBbox(urbanAreas, theaterBbox),
    ),
    "layers/settlements.geojson": overpassElementsToGeoJson(
      settlements.elements ?? [],
      theaterBoundary,
    ),
  };
  const clippedOblastBoundaries = filterFeatureCollectionToBbox(oblastBoundaries, theaterBbox);
  const clippedAdm2Polygons = filterFeatureCollectionToBbox(oblastSubdivisions, theaterBbox);
  const alignedOblastSubdivisions = alignOblastSubdivisionBoundaries(
    clippedOblastBoundaries,
    clippedAdm2Polygons,
  );
  const admBoundaryTopology = buildBoundaryLineTopologyFromAdm2(oblastSubdivisions);
  let effectiveWaterBodies = osmWaterBodiesFromPbf
    ? mergeWaterBodiesWithCoverageFallback(
        osmWaterBodiesFromPbf,
        osmWaterBodiesPrototype,
        admBoundaryTopology.ukraineGeometry,
      )
    : osmWaterBodiesPrototype;
  console.log(
    `Completed post-elevation vector assembly ` +
    `(${formatElapsedMs(Date.now() - postElevationVectorPrepStartedAt)}).`,
  );
  const postElevationHydrologyStartedAt = Date.now();
  console.log("Starting post-elevation hydrology reconstruction...");
  const riverCorridorGapLayer = await buildMajorRiverCorridorGapLayer(
    effectiveWaterBodies,
    osmMajorRiverLinesFromPbf,
    admBoundaryTopology.ukraineGeometry,
  );
  effectiveWaterBodies = appendRiverCorridorGapFeatures(
    effectiveWaterBodies,
    riverCorridorGapLayer,
  );
  const focusedHexRiverLayer = await buildFocusedHexRiverReconstructionLayer(
    effectiveWaterBodies,
    osmMajorRiverLinesFromPbf,
    existsSync(elevationRasterPath) ? elevationRasterPath : null,
  );
  effectiveWaterBodies = appendRiverCorridorGapFeatures(
    effectiveWaterBodies,
    focusedHexRiverLayer,
  );
  console.log(
    `Completed post-elevation hydrology reconstruction ` +
    `(${formatElapsedMs(Date.now() - postElevationHydrologyStartedAt)}).`,
  );
  const clippedEffectiveWaterBodies = filterFeatureCollectionToBbox(
    effectiveWaterBodies,
    theaterBbox,
  );
  const correctedSeas = correctSeaLayerWithAdm0Geometry(seas, admBoundaryTopology.ukraineGeometry);
  filteredLayers["layers/water-bodies.geojson"] = clippedEffectiveWaterBodies;
  filteredLayers["layers/seas.geojson"] = filterFeatureCollectionToBbox(correctedSeas, theaterBbox);
  filteredLayers["layers/theater-boundary.geojson"] = admBoundaryTopology.adm0Outer;
  filteredLayers["layers/oblast-boundaries.geojson"] = admBoundaryTopology.adm1Shared;
  filteredLayers["layers/oblast-subdivisions.geojson"] = admBoundaryTopology.adm2Internal;
  filteredLayers["layers/settlements.geojson"] = filterPointFeaturesOutsidePolygons(
    filteredLayers["layers/settlements.geojson"],
    filteredLayers["layers/seas.geojson"],
  );
  filteredLayers["layers/settlement-voronoi-cells.geojson"] = buildSettlementVoronoiLayer(
    filteredLayers["layers/country-boundaries.geojson"],
    filteredLayers["layers/settlements.geojson"],
  );
  filteredLayers["layers/country-label-guides.geojson"] = buildCountryLabelGuideLayer(
    filteredLayers["layers/country-boundaries.geojson"],
  );
  filteredLayers["layers/oblast-label-points.geojson"] = buildAdminLabelPointLayer(
    admBoundaryTopology.dissolvedOblastPolygons,
    {
      idFields: ["shapeISO", "shapeID", "id"],
      nameFields: ["shapeName", "NAME_1", "name"],
      padX: 0.2,
      padY: 0.2,
      anchorX: 0.5,
      anchorY: 0.56,
      stripSuffixPattern: /\s+Oblast$/iu,
    },
  );
  filteredLayers["layers/oblast-subdivision-label-points.geojson"] = buildAdminLabelPointLayer(
    alignedOblastSubdivisions,
    {
      idFields: ["shapeID", "shapeISO", "id"],
      nameFields: ["shapeName", "NAME_2", "name"],
      padX: 0.22,
      padY: 0.22,
      anchorX: 0.5,
      anchorY: 0.56,
      stripSuffixPattern: /\s+Raion$/iu,
    },
  );

  const layerEntries = Object.entries(filteredLayers);
  for (const [index, [relativePath, data]] of layerEntries.entries()) {
    console.log(`Writing layer ${index + 1}/${layerEntries.length}: ${relativePath}`);
    await writeGeoJson(relativePath, data);
  }

  const layerCatalog = [
    {
      id: "theater-boundary",
      label: "Theater Boundary",
      category: "reference",
      geometryKind: "line",
      path: "layers/theater-boundary.geojson",
    },
    {
      id: "oblast-boundaries",
      label: "Oblast Boundaries",
      category: "reference",
      geometryKind: "line",
      path: "layers/oblast-boundaries.geojson",
    },
    {
      id: "oblast-label-points",
      label: "Oblast Labels",
      category: "reference",
      geometryKind: "point",
      path: "layers/oblast-label-points.geojson",
    },
    {
      id: "oblast-subdivisions",
      label: "Oblast Subdivisions",
      category: "reference",
      geometryKind: "line",
      path: "layers/oblast-subdivisions.geojson",
    },
    {
      id: "oblast-subdivision-label-points",
      label: "Oblast Subdivision Labels",
      category: "reference",
      geometryKind: "point",
      path: "layers/oblast-subdivision-label-points.geojson",
    },
    {
      id: "country-boundaries",
      label: "Country Boundaries",
      category: "reference",
      geometryKind: "polygon",
      path: "layers/country-boundaries.geojson",
    },
    {
      id: "country-boundary-lines",
      label: "Country Boundary Lines",
      category: "reference",
      geometryKind: "line",
      path: "layers/country-boundary-lines.geojson",
    },
    {
      id: "country-label-guides",
      label: "Country Labels",
      category: "reference",
      geometryKind: "line",
      path: "layers/country-label-guides.geojson",
    },
    {
      id: "rivers",
      label: "Rivers",
      category: "hydrology",
      geometryKind: "line",
      path: "layers/rivers.geojson",
    },
    {
      id: "water-bodies",
      label: "Water Bodies",
      category: "hydrology",
      geometryKind: "polygon",
      path: "layers/water-bodies.geojson",
    },
    {
      id: "water-bodies-osm-prototype",
      label: "Water Bodies (OSM Prototype)",
      category: "hydrology",
      geometryKind: "polygon",
      path: "layers/water-bodies-osm-prototype.geojson",
    },
    {
      id: "seas",
      label: "Seas",
      category: "hydrology",
      geometryKind: "polygon",
      path: "layers/seas.geojson",
    },
    {
      id: "wetlands",
      label: "Wetlands",
      category: "hydrology",
      geometryKind: "polygon",
      path: "layers/wetlands.geojson",
    },
    {
      id: "forests",
      label: "Forests",
      category: "terrain",
      geometryKind: "polygon",
      path: "layers/forests.geojson",
    },
    {
      id: "roads",
      label: "Roads",
      category: "transport",
      geometryKind: "line",
      path: "layers/roads.geojson",
    },
    {
      id: "railways",
      label: "Railways",
      category: "transport",
      geometryKind: "line",
      path: "layers/railways.geojson",
    },
    {
      id: "major-city-urban-areas",
      label: "Major City Urban Areas",
      category: "settlements",
      geometryKind: "polygon",
      path: "layers/major-city-urban-areas.geojson",
    },
    {
      id: "settlements",
      label: "Settlements",
      category: "settlements",
      geometryKind: "point",
      path: "layers/settlements.geojson",
    },
    ...(elevationAvailable
      ? [
          {
            id: "terrain-elevation",
            label: "Terrain Elevation",
            category: "terrain",
            geometryKind: "raster",
            path: "terrain/elevation-clipped.tif",
          },
          {
            id: "terrain-hillshade",
            label: "Terrain Hillshade",
            category: "terrain",
            geometryKind: "raster",
            path: hillshadeLayerPath,
          },
        ]
      : []),
    settlementVoronoiCatalogEntry,
  ];

  await writeGeoJson("layers.json", {
    generatedAt: new Date().toISOString(),
    layers: layerCatalog,
  });

  console.log("Wrote processed public fallback layers and layers.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
