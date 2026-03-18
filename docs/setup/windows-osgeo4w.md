# Windows OSGeo4W Setup

Elevation and hillshade generation rely on GDAL/PROJ tools.

## Required Packages

- `gdal`
- `gdal312-runtime` (or runtime matching installed GDAL line)
- `proj`
- `proj-runtime-data`
- `proj-data`
- `python3-gdal` (needed for `gdal2tiles`)

## Environment

Set explicit GDAL/OSGeo bin path before running commands:

```powershell
$env:OSGEO4W_BIN='C:\OSGeo4W\bin'
```

## Quick Validation

```powershell
C:\OSGeo4W\bin\gdalinfo.exe --version
C:\OSGeo4W\bin\proj.exe
C:\OSGeo4W\bin\projinfo.exe EPSG:3857
C:\OSGeo4W\bin\sqlite3.exe C:\OSGeo4W\share\proj\proj.db "select * from metadata where key in ('PROJ.VERSION','DATABASE.LAYOUT.VERSION.MAJOR','DATABASE.LAYOUT.VERSION.MINOR');"
```

## Troubleshooting Notes

- Use a clean install root (`C:\OSGeo4W`) for upgrades.
- Avoid mixing old/new PROJ runtime families in one install.
- If `proj_9.dll` is missing, reinstall `proj9-runtime`.
- If `proj.db` layout mismatch appears, reinstall PROJ runtime/data in a clean root.

For broader build context, see [Public Layer Builder](../pipeline/public-layer-builder.md).
