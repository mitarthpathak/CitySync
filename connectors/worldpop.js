'use strict';

// TODO(worldpop): NOT INTEGRATED. Placeholder so the architecture shows it is planned.
//
// Why not tonight: WorldPop ships GeoTIFF population rasters - aggregating one to a ward
// polygon needs a Python geospatial stack (rasterio/gdal), not a fit for this Node
// backend. If ward-level population is needed later, prefer a small committed static
// lookup (e.g. data/jaipur-ward-population.json) over adding that toolchain.
module.exports = {
  key: 'worldpop',
  label: 'WorldPop population rasters (planned)',
  layer: 'exposure',
  category: 'Exposure',
  planned: true,
  requiresKey: false,
  attribution: 'WorldPop',
  docsUrl: 'https://www.worldpop.org/',
  reason: 'GeoTIFF raster aggregation needs a Python geospatial toolchain (rasterio/gdal); use a small committed static lookup instead if ward population is needed.',
  run: async () => {
    throw new Error('worldpop connector is a planned stub, not implemented');
  },
};
