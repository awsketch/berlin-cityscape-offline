# Station 1 — Logo

Drop the station's logo into this folder as a single PNG file named exactly:

    logo.png

Full path:
`public/stations/station-1/logo/logo.png`

Rules:
- Must be a `.png` file
- Filename must be exactly `logo.png` (lowercase, no suffix, no version)
- Transparent background recommended — the index page renders it on top of
  the three station-color circles, so a transparent PNG looks best
- Aspect ratio is flexible. The image is sized with `object-fit: contain`,
  so it won't stretch. Suggested export at ~512×512 (or wider if the logo
  is horizontal); the app caps display at 120px tall on the detail page
  and 64px tall on the index row.

If `logo.png` is missing, the app automatically falls back to the written
station name (loaded from `title.txt`), so partially-authored stations
keep working.
