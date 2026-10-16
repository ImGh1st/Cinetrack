# CineTrack PWA

A cinematic, local-first movie and TV watchlist prototype. It runs without an account and stores your library in the browser on your device.

## Included in this first build

- Add and edit movies and series manually
- IMDb, Rotten Tomatoes critics/audience, Metacritic, and personal rating fields
- Watch statuses, favorites, genres, notes, optional poster URL and IMDb ID
- Search, type/status filters, and sorting
- Custom collections with many-to-many membership
- Lightweight season/episode checklist for series
- Local library statistics
- JSON backup/restore and CSV import/export
- Duplicate warnings based on IMDb ID or title/year/type
- Discovery view that applies the 2001+ and IMDb 7.0+ rule to saved local records
- PWA manifest and service worker for install/offline shell support

## Run locally

Because service workers require a secure context, use a local server rather than opening `index.html` directly when testing PWA behavior.

With Python installed:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

You can also deploy the folder as a static site over HTTPS.

## Data and privacy

The current MVP stores its data in browser `localStorage`. This is simple and easy to inspect, but it is not suitable for a very large catalog. A production-scale version should migrate the repository to IndexedDB, as specified in the original product plan. Export JSON backups regularly. Clearing browser site data can permanently erase the library.

No API keys or network metadata services are included in this version. Poster image URLs, if entered, are loaded from their remote host. Ratings entered by the user are not independently verified.

## Discovery limitations

The Discover page evaluates titles already saved in your library. It does not claim to enumerate every IMDb-rated film. Comprehensive discovery requires a permitted, reliable catalog/rating data source and must respect its coverage, rate limits, licensing, and terms. IMDb's public datasets are snapshots and have field/usage limitations; Rotten Tomatoes and Metacritic data should not be scraped or fabricated.

## Import/export

- JSON backup includes titles, collections, memberships, seasons, episodes, and progress.
- CSV is a spreadsheet-friendly export of media records. Import supports the CineTrack CSV column names.
- Import is merge-oriented and asks for confirmation. Keep a separate backup before testing with important data.

## Known limitations in this MVP

- Data is stored in `localStorage`, not IndexedDB.
- No live metadata provider is connected.
- Episode titles and season metadata are entered as a simple checklist rather than fetched from a provider.
- The discovery page filters local records only.
- The initial PWA shell caches same-origin app files; remote poster images may not be available offline.
- The app is a working starting point, not yet the fully verified production build described in the full specification.

## Suggested next engineering steps

1. Move storage to IndexedDB with schema migrations and transactional restore.
2. Add TMDb metadata search as an optional provider.
3. Add a lawful IMDb-rating discovery import pipeline.
4. Expand CSV mapping, merge conflict previews, and automated tests.
5. Test install/offline behavior on Android Chrome and desktop browsers.
