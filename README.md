# Berlin Kartograph — Offline

A printed-map companion to the main Berlin Kartograph app. No map inside the
app: the user navigates with a printed map, and the app is an **index of
stations** that unlock one by one as the user finds and scans each station's
QR code.

Same Bauhaus design system as the map version. Same station folder structure,
same unlock tokens — the QR codes you printed for the map app work here too.

## Flow

1. **Index screen** — list of all stations, each shown as "Locked" or "Found".
2. **Tap a station row** → station detail page opens.
3. **Locked state** — shows the description and the "where's the QR hidden?"
   clue, plus a big **Scan QR Code** button.
4. **Tap Scan QR Code** → in-app camera opens (html5-qrcode).
5. **Scan a valid Kartograph QR** → the station unlocks. If the scanned QR
   belongs to a different station, the app navigates straight to that one
   instead.
6. **Unlocked state** — the same page now shows an audio player and a
   horizontal swipeable photo carousel. The station is marked "Found" on the
   index.

Found state is persisted in `localStorage` under the key
`berlinKartographOfflineFound`.

## Quick start

```
cd "App Cityscape Offline"
npm install
npm start
```

Opens at <http://localhost:3000>. For the QR scanner to work you'll need to
browse over HTTPS (or `localhost`, which browsers treat as secure) and grant
camera permission.

For a production build:

```
npm run build
```

## Project structure

```
App Cityscape Offline/
├── package.json              React 18 + html5-qrcode — no Leaflet.
├── public/
│   ├── index.html            Google Fonts (Space Grotesk + Manrope) + manifest.
│   ├── manifest.json         PWA manifest (Kartograph Offline, red theme).
│   ├── audio/                Per-station MP3s. Naming: NN-slug.mp3.
│   └── stations/
│       └── station-<N>/      Content per station (same layout as map app).
│           ├── title.txt
│           ├── description.txt
│           ├── clue.txt      Hint about where the printed QR is hidden.
│           └── images/       image-1.jpg, image-2.jpg, … for the carousel.
└── src/
    ├── index.js              Entry point — renders OfflineApp.
    └── offline-app.jsx       The whole app: list, detail, QR scanner, carousel.
```

## Editing a station

- **Text** (title / description / clue) lives in the `.txt` files under
  `public/stations/station-<N>/`. No rebuild needed — refresh the page and
  the content re-fetches.
- **Photos** go into `public/stations/station-<N>/images/` named sequentially:
  `image-1.jpg`, `image-2.jpg`, … The carousel auto-enumerates until it hits
  the first gap. Both `.jpg`, `.jpeg`, `.png`, and `.webp` are supported at
  each index.
- **Audio** goes into `public/audio/` with the filename that matches the
  `audioUrl` field for that station in `src/offline-app.jsx`.
- **Changing which place a slot points to** (e.g. swapping station 6 for
  something different): edit the corresponding entry in the `STATIONS` array
  in `src/offline-app.jsx` (category + audio filename + unlockToken), rewrite
  the .txt files, drop in new images, and re-print the QR code if the token
  changes.

## QR codes

Each station's `unlockToken` matches the one in the map app. A QR code can
encode either:

- the **raw token**, e.g. `hh-r8p3v7nxbf`, or
- a **URL containing `?unlock=<token>`**, e.g.
  `https://kartograph.example/?unlock=hh-r8p3v7nxbf`

Both are accepted by the scanner. If you already have QR codes printed for the
map version they'll work in this app without reprinting.

If you need fresh ones, generate them with any QR tool (e.g.
`qrencode -o station-01.png "hh-r8p3v7nxbf"`).

## Design system (don't touch without asking)

- **Palette**: Bauhaus red `#ff3333` / blue `#3399cc` / yellow `#FDE74C`,
  surface `#f9f9f9`, on-surface `#1a1c1c`. Maintained as a parallel copy of
  the map app's `COLORS` — the two have diverged (map app currently uses
  `#175ead` blue and `#930016` deep red) so changes must be mirrored by hand.
- **Type**: Space Grotesk for headlines / labels, Manrope for body.
- **Geometry**: 0 rounded corners anywhere. Category primitives: red circle
  (historic), blue square (modern), yellow diamond (secret).
- **Rule**: no color beyond the palette, no rounded corners, no drop shadows
  except the single Bauhaus 0-radius offset used in the unlock toast.

## Browser support

- Chrome / Edge / Safari 15+ / Firefox 100+.
- The QR scanner needs `getUserMedia` — that means HTTPS in production.
  `localhost` works in dev.

## Why this variant exists

The main (map-based) app gives the user a map and turn-by-turn self-navigation.
This variant is for when you'd rather hand out a printed, editorial-style map
at the start of the experience and keep the app as the reveal surface — an
indexed catalogue of the stops rather than a wayfinder.
