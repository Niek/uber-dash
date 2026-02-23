# Uber Trips Dashboard

## Idea
A client-side single-page web app that reads Uber Trips CSV exports, consolidates transaction rows into trips, and provides a daily analytics + route visualization dashboard.

The app is designed to work without a backend and with minimal dependencies, so users can open it directly in a browser and analyze trip history locally.

## Goals
- Keep data processing fully local in the browser.
- Support drag-and-drop CSV upload.
- Present a clear daily overview and trip-level details.
- Visualize trips on an OpenStreetMap map for spatial context.
- Keep implementation simple and maintainable.

## Tech Stack
- Plain HTML + JavaScript (no framework)
- [Bulma](https://bulma.io/) via Cloudflare CDN for styling (built-in classes only)
- [Leaflet](https://leafletjs.com/) via Cloudflare CDN + OpenStreetMap tiles for map rendering
- Photon (komoot) geocoding API for address-to-coordinate lookup
- OSRM public API for road-route geometry lookup

## File Layout
- `/Users/niek/Documents/Code/uber/index.html`: SPA layout and dependency includes.
- `/Users/niek/Documents/Code/uber/app.js`: CSV parsing, data model, dashboard rendering, map rendering, interactivity.
- `/Users/niek/Documents/Code/uber/uber.csv`: sample data file for local testing.

## Deployment
- Live URL: https://niek.github.io/uber-dash/

## Core Features
1. CSV ingestion
- File input and drag-and-drop upload.
- Handles Uber CSV files with metadata/preamble before the transactions header.
- Supports quoted CSV fields containing commas.

2. Trip normalization
- Merges transaction lines (for example `Fare` + `Tip`) into one logical trip using date/time/service/city/pickup/drop-off keying.
- Computes per-trip totals in EUR and local currency.

3. Dashboard summary
- KPIs: day count, trip count, total EUR, average EUR per trip.
- Day list grouped by date.
- Day ordering: newest date to oldest date.

4. Day details
- Trips table for selected day.
- Trip ordering within the day: chronological (oldest to newest).
- Numbered trips (`#`) for easy map/table cross-reference.

5. Map visualization
- Plots each trip as pickup marker, drop-off marker, and route polyline (OSRM road route when available).
- Adds a numbered marker per trip.
- Fits map bounds to visible plotted trips.

6. Linked highlighting
- Hovering a table row highlights the corresponding map route/markers.
- Hovering map route/markers highlights the corresponding table row.

7. Geocoding behavior
- Uses Photon (`https://photon.komoot.io/api/`) for geocoding.
- Resolves unique addresses per selected day with bounded parallel requests.
- Keeps geocode cache in memory only for the active session (no `localStorage`).
- Uses fallback query simplification for difficult address formats.

## Current Limitations
- Geocoding quality depends on Photon and address quality; some routes may not be plottable.
- Route geometry depends on OSRM availability; when unavailable, map falls back to straight pickup-to-drop-off polylines.
- CSV format assumptions are based on Uber export columns currently present in sample data.
- No automated test suite is set up; validation is manual.
- Requires network access for map tiles, Photon geocoding, and OSRM routing.

## Manual Test Plan
Use `/Users/niek/Documents/Code/uber/uber.csv` unless noted otherwise.

1. Launch
- Open `/Users/niek/Documents/Code/uber/index.html` in a browser.
- Confirm page loads without JS errors.

2. Upload
- Upload by file picker.
- Upload by drag-and-drop.
- Confirm status message indicates successful load.

3. Data checks
- Confirm KPI cards show non-zero values.
- Confirm day list is sorted newest to oldest.
- Select a few days and confirm trip table loads.

4. Ordering checks
- For a selected day, confirm trips are sorted oldest to newest by UTC time.

5. Numbering checks
- Confirm table includes `#` column.
- Confirm map shows numbered trip markers.
- Confirm numbers correspond between map and table.

6. Hover linking
- Hover a row and confirm route + markers highlight.
- Hover a route/marker and confirm row highlights.
- Move cursor away and confirm highlight resets.

7. Geocoding/map checks
- Confirm map fits to visible trips when geocoding succeeds.
- Confirm partial plotting behavior when some addresses fail geocoding.
- Confirm routes follow roads when OSRM returns geometry.
- Confirm straight-line fallback is used when routing geometry is unavailable.

8. Basic robustness
- Upload an invalid CSV and confirm user-facing error appears.
- Re-upload valid CSV and confirm dashboard recovers.

## Developer Notes
- Keep dependencies minimal and client-only.
- Prefer Bulma utility/components before custom CSS.
- Use Conventional Commits for all commit messages (for example: `feat: add daily summary cards`).
- If adding new data transforms, preserve:
  - day order: newest -> oldest
  - trip order inside day: oldest -> newest
  - stable trip IDs for table/map linking
