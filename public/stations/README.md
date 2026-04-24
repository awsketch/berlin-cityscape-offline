# Stations (offline app)

Each `station-N/` folder holds the editable content for one station:

- `title.txt` — station name (one line)
- `description.txt` — short description (1–3 sentences)
- `clue.txt` — hint to where the QR code is hidden
- `images/` — photos shown in the unlocked-state carousel, named
  `image-1.jpg`, `image-2.jpg`, … (see `images/README.md`)

Structural data (id, category, audio filename, QR unlock token) lives in the
`STATIONS` array inside `src/offline-app.jsx` — edit there if you swap a
station for a different place. The folder names stay stable so you don’t have
to rename folders each time.
