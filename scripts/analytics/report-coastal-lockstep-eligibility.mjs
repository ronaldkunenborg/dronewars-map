import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");
const reportsRoot = path.join(repoRoot, "reports");
const layerBuilderPath = path.join(repoRoot, "scripts", "layers", "fetch-public-layers.mjs");

const inputPaths = {
  hexCells: path.join(processedRoot, "hex-cells.geojson"),
  countryBoundaries: path.join(processedRoot, "layers", "country-boundaries.geojson"),
};

const outputPaths = {
  json: path.join(reportsRoot, "coastal-lockstep-eligibility.json"),
  md: path.join(reportsRoot, "coastal-lockstep-eligibility.md"),
};

const autoRule = {
  eastMin: 34,
  eastMax: 73,
  northMin: 3,
  northMax: 27,
};

function parseHexId(id) {
  const match = /^HX-([EW])(\d+)-N(\d+)$/.exec(String(id ?? ""));

  if (!match) {
    return null;
  }

  const easting = Number.parseInt(match[2], 10);
  const northing = Number.parseInt(match[3], 10);

  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    return null;
  }

  return {
    hemisphere: match[1],
    easting,
    northing,
    signedEasting: match[1] === "W" ? -easting : easting,
  };
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point, polygonCoordinates) {
  const [outer, ...holes] = polygonCoordinates;

  if (!Array.isArray(outer) || !pointInRing(point, outer)) {
    return false;
  }

  return !holes.some((ring) => pointInRing(point, ring));
}

function pointInGeometry(point, geometry) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function hexTouchesUkraine(feature, ukraineGeometry) {
  const center = feature?.properties?.centerLngLat;

  if (Array.isArray(center) && center.length >= 2 && pointInGeometry(center, ukraineGeometry)) {
    return true;
  }

  const outerRing = feature?.geometry?.coordinates?.[0] ?? [];
  return outerRing.some(
    (point) => Array.isArray(point) && point.length >= 2 && pointInGeometry(point, ukraineGeometry),
  );
}

function extractHexIdListFromLayerBuilder(sourceText, constantName) {
  const regex = new RegExp(`const ${constantName} = \\[([\\s\\S]*?)\\];`);
  const match = sourceText.match(regex);

  if (!match) {
    throw new Error(`Could not find ${constantName} in ${layerBuilderPath}`);
  }

  return [
    ...match[1].matchAll(/"(HX-[EW]\d+-N\d+)"/g),
  ].map((entry) => entry[1]);
}

function buildRow(hexId, feature, hexById, ukraineHexSet, lockstepHexIdSet) {
  const parsed = parseHexId(hexId);
  const adjacencyIds = Array.isArray(feature?.properties?.adjacencyIds)
    ? feature.properties.adjacencyIds.map((value) => String(value))
    : [];
  const inUkraine = ukraineHexSet.has(hexId);
  const onUkraineBoundary = inUkraine && adjacencyIds.some((neighborId) => !ukraineHexSet.has(neighborId));
  const seaCoverage = Number(feature?.properties?.seaCoverage ?? 0);
  const hasSeaInHex = seaCoverage > 0;
  const hasSeaNeighbor = adjacencyIds.some(
    (neighborId) => Number(hexById.get(neighborId)?.properties?.seaCoverage ?? 0) > 0,
  );
  const seaOrNeighborSea = hasSeaInHex || hasSeaNeighbor;
  const inAutoRange =
    parsed?.hemisphere === "E" &&
    parsed.easting >= autoRule.eastMin &&
    parsed.easting <= autoRule.eastMax &&
    parsed.northing >= autoRule.northMin &&
    parsed.northing <= autoRule.northMax;
  const autoEligibleByRule = Boolean(inAutoRange && inUkraine && onUkraineBoundary && seaOrNeighborSea);
  const inManualLockstepList = lockstepHexIdSet.has(hexId);

  let inclusionMode = "excluded";

  if (inManualLockstepList && autoEligibleByRule) {
    inclusionMode = "both";
  } else if (inManualLockstepList) {
    inclusionMode = "manual-override";
  } else if (autoEligibleByRule) {
    inclusionMode = "auto-missing";
  }

  const exclusionReasonParts = [];

  if (!autoEligibleByRule) {
    if (!inAutoRange) exclusionReasonParts.push("outside-auto-range");
    if (!inUkraine) exclusionReasonParts.push("not-in-ukraine");
    if (inUkraine && !onUkraineBoundary) exclusionReasonParts.push("not-ukraine-boundary");
    if (!seaOrNeighborSea) exclusionReasonParts.push("no-sea-in-or-neighbor");
  }

  return {
    hexId,
    inAutoRange,
    inUkraine,
    onUkraineBoundary,
    seaCoverage: Number(seaCoverage.toFixed(3)),
    hasSeaInHex,
    hasSeaNeighbor,
    seaOrNeighborSea,
    autoEligibleByRule,
    inManualLockstepList,
    inclusionMode,
    exclusionReason: exclusionReasonParts.length > 0 ? exclusionReasonParts.join(",") : null,
  };
}

function sortRows(rows) {
  return [...rows].sort((left, right) => {
    const a = parseHexId(left.hexId);
    const b = parseHexId(right.hexId);

    if (!a || !b) {
      return String(left.hexId).localeCompare(String(right.hexId));
    }

    if (a.signedEasting !== b.signedEasting) {
      return a.signedEasting - b.signedEasting;
    }

    return a.northing - b.northing;
  });
}

function toMarkdown(report) {
  const lines = [];

  lines.push("# Coastal Lockstep Eligibility Report");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");

  lines.push("## Auto Rule");
  lines.push("");
  lines.push(`- Easting window: \`E${report.autoRule.eastMin}..E${report.autoRule.eastMax}\``);
  lines.push(`- Northing window: \`N${report.autoRule.northMin}..N${report.autoRule.northMax}\``);
  lines.push("- Eligibility: in window + in Ukraine + on Ukraine boundary + sea in hex or neighbor");
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total hexes evaluated: ${report.summary.totalRows}`);
  lines.push(`- Manual lockstep list size: ${report.summary.manualLockstepCount}`);
  lines.push(`- Auto-eligible by rule: ${report.summary.autoEligibleCount}`);
  lines.push(`- Included by both auto + manual: ${report.summary.bothCount}`);
  lines.push(`- Included by manual override only: ${report.summary.manualOverrideCount}`);
  lines.push(`- Auto-eligible but missing from list: ${report.summary.autoMissingCount}`);
  lines.push("");

  function writeTable(title, rows) {
    lines.push(`## ${title}`);
    lines.push("");

    if (rows.length === 0) {
      lines.push("None.");
      lines.push("");
      return;
    }

    lines.push("| Hex | In Ukraine | On Boundary | Sea Coverage | Sea Neighbor | Auto Eligible | Inclusion Mode | Reason |");
    lines.push("| --- | --- | --- | ---: | --- | --- | --- | --- |");

    for (const row of rows) {
      lines.push(
        `| ${row.hexId} | ${row.inUkraine} | ${row.onUkraineBoundary} | ${row.seaCoverage} | ${row.hasSeaNeighbor} | ${row.autoEligibleByRule} | ${row.inclusionMode} | ${row.exclusionReason ?? ""} |`,
      );
    }

    lines.push("");
  }

  writeTable("Manual Overrides (In List, Not Auto-Eligible)", report.rows.manualOverrides);
  writeTable("Auto-Eligible Missing From Manual List", report.rows.autoMissing);

  lines.push("## Full Dataset");
  lines.push("");
  lines.push("See JSON report: `reports/coastal-lockstep-eligibility.json`.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function loadGeoJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const [hexCells, countryBoundaries, layerBuilderSource] = await Promise.all([
    loadGeoJson(inputPaths.hexCells),
    loadGeoJson(inputPaths.countryBoundaries),
    readFile(layerBuilderPath, "utf8"),
  ]);

  const lockstepHexIds = extractHexIdListFromLayerBuilder(
    layerBuilderSource,
    "adm2LandSeaLockstepHexIds",
  );
  const lockstepHexIdSet = new Set(lockstepHexIds);

  const ukraineFeature = (countryBoundaries.features ?? []).find((feature) => {
    const props = feature?.properties ?? {};
    return String(props.ISO_A3 ?? props.id ?? "") === "UKR";
  });

  if (!ukraineFeature?.geometry) {
    throw new Error("Could not find UKR geometry in processed country-boundaries layer.");
  }

  const hexFeatures = (hexCells.features ?? []).filter((feature) => {
    const id = String(feature?.properties?.id ?? "");
    return /^HX-[EW]\d+-N\d+$/.test(id);
  });
  const hexById = new Map(hexFeatures.map((feature) => [String(feature.properties.id), feature]));

  const ukraineHexSet = new Set(
    hexFeatures
      .filter((feature) => hexTouchesUkraine(feature, ukraineFeature.geometry))
      .map((feature) => String(feature.properties.id)),
  );

  const universeHexIdSet = new Set([
    ...hexFeatures.map((feature) => String(feature.properties.id)),
    ...lockstepHexIds,
  ]);

  const rows = sortRows(
    [...universeHexIdSet]
      .map((hexId) => {
        const feature = hexById.get(hexId);
        if (!feature) {
          return {
            hexId,
            inAutoRange: false,
            inUkraine: false,
            onUkraineBoundary: false,
            seaCoverage: 0,
            hasSeaInHex: false,
            hasSeaNeighbor: false,
            seaOrNeighborSea: false,
            autoEligibleByRule: false,
            inManualLockstepList: lockstepHexIdSet.has(hexId),
            inclusionMode: lockstepHexIdSet.has(hexId) ? "manual-override" : "excluded",
            exclusionReason: "missing-from-hex-cells",
          };
        }

        return buildRow(hexId, feature, hexById, ukraineHexSet, lockstepHexIdSet);
      }),
  );

  const manualOverrides = rows.filter((row) => row.inclusionMode === "manual-override");
  const autoMissing = rows.filter((row) => row.inclusionMode === "auto-missing");

  const report = {
    generatedAt: new Date().toISOString(),
    input: {
      hexCells: path.relative(repoRoot, inputPaths.hexCells),
      countryBoundaries: path.relative(repoRoot, inputPaths.countryBoundaries),
      layerBuilderSource: path.relative(repoRoot, layerBuilderPath),
    },
    autoRule,
    summary: {
      totalRows: rows.length,
      manualLockstepCount: lockstepHexIdSet.size,
      autoEligibleCount: rows.filter((row) => row.autoEligibleByRule).length,
      bothCount: rows.filter((row) => row.inclusionMode === "both").length,
      manualOverrideCount: manualOverrides.length,
      autoMissingCount: autoMissing.length,
    },
    rows: {
      manualOverrides,
      autoMissing,
      all: rows,
    },
  };

  await mkdir(reportsRoot, { recursive: true });
  await writeFile(outputPaths.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputPaths.md, toMarkdown(report), "utf8");

  console.log(
    `Wrote ${path.relative(repoRoot, outputPaths.json)} and ${path.relative(repoRoot, outputPaths.md)} ` +
    `(manual overrides=${manualOverrides.length}, auto missing=${autoMissing.length}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
