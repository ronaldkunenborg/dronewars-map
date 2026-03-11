export const theaterExtent = {
  west: 22.0,
  south: 44.0,
  east: 40.5,
  north: 52.5,
};

export const vectorLayerDefinitions = [
  {
    id: "theater-boundary",
    sourceId: "theater-boundary",
    outputName: "theater-boundary.geojson",
    geometryType: "polygon",
    category: "reference",
    clipToTheater: false,
  },
  {
    id: "oblast-boundaries",
    sourceId: "oblast-boundaries",
    outputName: "oblast-boundaries.geojson",
    geometryType: "polygon",
    category: "reference",
    clipToTheater: true,
  },
  {
    id: "hydrology",
    sourceId: "hydrology-supplement",
    outputName: "hydrology-supplement.geojson",
    geometryType: "polygon",
    category: "hydrology",
    clipToTheater: true,
    optional: true,
  },
];

export const rasterLayerDefinitions = [
  {
    id: "elevation",
    sourceId: "elevation",
    outputName: "elevation-clipped.tif",
    category: "terrain",
    clipMode: "theater-extent",
  },
  {
    id: "landcover",
    sourceId: "landcover",
    outputName: "landcover-clipped.tif",
    category: "terrain",
    clipMode: "theater-boundary",
  },
];
