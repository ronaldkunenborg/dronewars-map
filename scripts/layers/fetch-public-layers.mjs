import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
};
const hillshadeTileSize = 1024;
const hillshadeTileZoomRange = "4-10";

const gdalCommandNames = new Set(Object.values(gdalTools));
const osgeoBinDir = process.env.OSGEO4W_BIN ?? "C:\\OSGeo4W\\bin";
const osgeoRootDir = path.dirname(osgeoBinDir);

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

function runCommandWithExitCode(command, args) {
  const resolvedCommand = resolveCommand(command);

  return new Promise((resolve) => {
    const child = spawn(resolvedCommand, args, {
      stdio: "ignore",
      shell: false,
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

// Convert lon/lat deltas near a reference latitude into approximate kilometer coordinates.
function toKilometers(point, referenceLatitude) {
  const kmPerDegreeLatitude = 111.32;
  const kmPerDegreeLongitude = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);

  return [
    point[0] * kmPerDegreeLongitude,
    point[1] * kmPerDegreeLatitude,
  ];
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

// Fetch a tiled polygon layer from Overpass and merge deduplicated way features across tiles.
async function fetchTiledAreaLayer(layerId, selectors, propertiesBuilder, options) {
  const tiles = buildBboxGrid(theaterBbox, 3, 3);
  const featuresById = new Map();

  for (const [tileIndex, tile] of tiles.entries()) {
    const response = await fetchOverpassJsonWithFallback(
      [sources.terrainOverpassApi, sources.overpassFallbackApi, sources.overpassApi],
      overpassAreaQuery(selectors, tile),
      `overpass/${layerId}/tile-${tileIndex}`,
    );

    addOverpassWayFeatures(featuresById, response.elements ?? [], propertiesBuilder, options);
  }

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

  let elevationAvailable = false;
  let hillshadeLayerPath = "terrain/hillshade-clipped.png";

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
    const existingElevationPath = path.join(processedRoot, "terrain", "elevation-clipped.tif");

    if (existsSync(existingElevationPath) && existingHillshadePath) {
      elevationAvailable = true;
      hillshadeLayerPath = existingHillshadePath;
    }
  }

  const filteredLayers = {
    "layers/theater-boundary.geojson": theaterBoundary,
    "layers/oblast-boundaries.geojson": oblastBoundaries,
    "layers/oblast-label-points.geojson": emptyFeatureCollection(),
    "layers/oblast-subdivisions.geojson": emptyFeatureCollection(),
    "layers/oblast-subdivision-label-points.geojson": emptyFeatureCollection(),
    "layers/rivers.geojson": filterFeatureCollectionToBbox(rivers, theaterBbox),
    "layers/water-bodies.geojson": filterFeatureCollectionToBbox(lakes, theaterBbox),
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
  filteredLayers["layers/oblast-subdivisions.geojson"] = alignOblastSubdivisionBoundaries(
    filteredLayers["layers/oblast-boundaries.geojson"],
    filterFeatureCollectionToBbox(oblastSubdivisions, theaterBbox),
  );
  filteredLayers["layers/settlement-voronoi-cells.geojson"] = buildSettlementVoronoiLayer(
    filteredLayers["layers/country-boundaries.geojson"],
    filteredLayers["layers/settlements.geojson"],
  );
  filteredLayers["layers/country-label-guides.geojson"] = buildCountryLabelGuideLayer(
    filteredLayers["layers/country-boundaries.geojson"],
  );
  filteredLayers["layers/oblast-label-points.geojson"] = buildAdminLabelPointLayer(
    filteredLayers["layers/oblast-boundaries.geojson"],
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
    filteredLayers["layers/oblast-subdivisions.geojson"],
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

  for (const [relativePath, data] of Object.entries(filteredLayers)) {
    await writeGeoJson(relativePath, data);
  }

  const layerCatalog = [
    {
      id: "theater-boundary",
      label: "Theater Boundary",
      category: "reference",
      geometryKind: "polygon",
      path: "layers/theater-boundary.geojson",
    },
    {
      id: "oblast-boundaries",
      label: "Oblast Boundaries",
      category: "reference",
      geometryKind: "polygon",
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
      geometryKind: "polygon",
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
