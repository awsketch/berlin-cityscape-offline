# Station photos (offline app)

Drop this station’s photos here, named sequentially:

    image-1.jpg
    image-2.jpg
    image-3.jpg
    …

The offline app auto-enumerates them: on unlock it probes `image-1`, then
`image-2`, etc. (both `.jpg` and `.png` extensions) and stops at the first
missing index. Up to 20 photos per station.

The carousel swipes horizontally in order, so the filename order = the display
order.

Tips:
- Landscape crops work best (the carousel is full-width, ~4:3).
- Keep file sizes under ~300 KB each — the whole thing is served as static
  files, no image resizing on the server.
- JPEG for photos, PNG only for diagrams / line drawings.
