import { Delaunay } from "d3-delaunay";
import polygonClipping from "polygon-clipping";

export const settlementVoronoiCatalogEntry = {
  id: "settlement-voronoi-cells",
  label: "Settlement Voronoi Cells",
  category: "operational",
  geometryKind: "polygon",
  path: "layers/settlement-voronoi-cells.geojson",
};

function closeRing(ring) {
  if (ring.length === 0) {
    return ring;
  }

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];

  if (firstLng === lastLng && firstLat === lastLat) {
    return ring;
  }

  return [...ring, ring[0]];
}

function pointInRing(point, ring) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
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

function polygonContainsPoint(point, polygon) {
  const [outerRing, ...holes] = polygon;

  if (!outerRing || !pointInRing(point, outerRing)) {
    return false;
  }

  return !holes.some((ring) => pointInRing(point, ring));
}

function featureContainsPoint(feature, point) {
  const geometry = feature.geometry;

  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    return polygonContainsPoint(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => polygonContainsPoint(point, polygon));
  }

  return false;
}

function geometryBounds(geometry) {
  const positions =
    geometry.type === "Polygon"
      ? geometry.coordinates.flat()
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.flat(2)
        : [];

  return positions.reduce(
    (bounds, [lng, lat]) => ({
      minLng: Math.min(bounds.minLng, lng),
      minLat: Math.min(bounds.minLat, lat),
      maxLng: Math.max(bounds.maxLng, lng),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLng: Number.POSITIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLng: Number.NEGATIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    },
  );
}

function squaredDistanceToSegment(point, from, to) {
  const [px, py] = point;
  const [ax, ay] = from;
  const [bx, by] = to;
  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    return (px - ax) ** 2 + (py - ay) ** 2;
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return (px - closestX) ** 2 + (py - closestY) ** 2;
}

function polygonDistanceToPoint(point, polygon) {
  if (polygonContainsPoint(point, polygon)) {
    return 0;
  }

  let bestDistance = Number.POSITIVE_INFINITY;

  for (const ring of polygon) {
    for (let index = 1; index < ring.length; index += 1) {
      bestDistance = Math.min(
        bestDistance,
        squaredDistanceToSegment(point, ring[index - 1], ring[index]),
      );
    }
  }

  return Math.sqrt(bestDistance);
}

function featureDistanceToPoint(feature, point) {
  const geometry = feature.geometry;

  if (!geometry) {
    return Number.POSITIVE_INFINITY;
  }

  if (geometry.type === "Polygon") {
    return polygonDistanceToPoint(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return Math.min(
      ...geometry.coordinates.map((polygon) => polygonDistanceToPoint(point, polygon)),
    );
  }

  return Number.POSITIVE_INFINITY;
}

function toClipMultiPolygon(geometry) {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function fromClipMultiPolygon(clipGeometry) {
  const polygons = clipGeometry
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

function buildVoronoiCellGeometry(points, index, clipGeometry) {
  if (points.length === 1) {
    return clipGeometry;
  }

  const bounds = geometryBounds(clipGeometry);
  const voronoi = Delaunay.from(points).voronoi([
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
  ]);
  const rawCell = voronoi.cellPolygon(index);

  if (!rawCell || rawCell.length < 4) {
    return null;
  }

  const clipped = polygonClipping.intersection(
    [[closeRing(rawCell.map(([lng, lat]) => [Number(lng), Number(lat)]))]],
    toClipMultiPolygon(clipGeometry),
  );

  if (!clipped || clipped.length === 0) {
    return null;
  }

  return fromClipMultiPolygon(clipped);
}

function featureLabel(feature, fallback) {
  return (
    feature.properties?.shapeName ??
    feature.properties?.nameUk ??
    feature.properties?.name ??
    fallback
  );
}

export function buildSettlementVoronoiLayer(oblastBoundaries, settlements) {
  const settlementFeatures = (settlements.features ?? []).filter(
    (feature) =>
      feature.geometry?.type === "Point" &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.properties?.place === "city" &&
      typeof feature.geometry.coordinates[0] === "number" &&
      typeof feature.geometry.coordinates[1] === "number",
  );
  const features = [];
  const oblastRecords = (oblastBoundaries.features ?? [])
    .filter(
      (feature) =>
        feature.geometry &&
        (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"),
    )
    .map((feature) => ({
      feature,
      settlements: [],
    }));

  for (const settlementFeature of settlementFeatures) {
    const containingOblast =
      oblastRecords.find((record) =>
        featureContainsPoint(record.feature, settlementFeature.geometry.coordinates),
      ) ??
      oblastRecords.reduce((best, candidate) => {
        const distance = featureDistanceToPoint(
          candidate.feature,
          settlementFeature.geometry.coordinates,
        );

        if (!best || distance < best.distance) {
          return {
            distance,
            record: candidate,
          };
        }

        return best;
      }, null)?.record;

    containingOblast?.settlements.push(settlementFeature);
  }

  for (const { feature: oblastFeature, settlements: oblastSettlements } of oblastRecords) {
    if (oblastSettlements.length === 0) {
      continue;
    }

    const uniquePoints = [];
    const seenCoordinates = new Set();

    for (const settlement of oblastSettlements) {
      const [lng, lat] = settlement.geometry.coordinates;
      const coordinateKey = `${lng.toFixed(8)},${lat.toFixed(8)}`;

      if (seenCoordinates.has(coordinateKey)) {
        continue;
      }

      seenCoordinates.add(coordinateKey);
      uniquePoints.push(settlement);
    }

    for (const [index, settlement] of uniquePoints.entries()) {
      const geometry = buildVoronoiCellGeometry(
        uniquePoints.map((feature) => feature.geometry.coordinates),
        index,
        oblastFeature.geometry,
      );

      if (!geometry) {
        continue;
      }

      const settlementId =
        settlement.properties?.id ??
        `${featureLabel(settlement, "settlement")}-${index}`;

      features.push({
        type: "Feature",
        properties: {
          id: `VOR-${settlementId}`,
          settlementId,
          nameUk: settlement.properties?.nameUk ?? settlement.properties?.name ?? null,
          nameEn: settlement.properties?.nameEn ?? null,
          place: settlement.properties?.place ?? "settlement",
          population: settlement.properties?.population ?? null,
          oblastId: oblastFeature.properties?.shapeID ?? oblastFeature.properties?.id ?? null,
          oblastName: featureLabel(oblastFeature, "Oblast"),
        },
        geometry,
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
