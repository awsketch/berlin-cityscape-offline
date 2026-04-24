# Audio stories

This folder holds the audio "reward" files for each station, revealed after the
user scans that station's QR code. They're served as static assets by Create
React App: a file at `public/audio/foo.mp3` becomes available at the URL
`/audio/foo.mp3` at runtime.

## Naming convention

`<two-digit-station-id>-<slugified-name>.mp3`

Examples:

- `01-neue-synagoge.mp3`
- `02-hackesche-hoefe.mp3`
- `03-monbijoupark.mp3`
- `04-kw-institute.mp3`
- `05-volksbuehne.mp3`
- `06-station-six.mp3` (rename once the 6th station is chosen)

The filenames used by the app live in `src/offline-app.jsx` — in the `STATIONS`
array each entry has an `audioUrl` pointing at `/audio/<filename>.mp3`. Update
that field if you rename a file here.

## Encoding recommendation

- Mono
- MP3, 96 kbps (or 64 kbps for pure spoken word)
- ~0.7 MB per minute at 96 kbps → six 7-minute files ≈ 30 MB total

ffmpeg example:

```
ffmpeg -i raw.wav -ac 1 -b:a 96k -codec:a libmp3lame output.mp3
```

The six placeholder files currently in this folder are 0 bytes — the audio
player will render but won't play until you replace them with real recordings.
