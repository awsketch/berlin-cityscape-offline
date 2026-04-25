import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// --- Bauhaus design tokens (mirrored from the map app — keep these in sync) ---
const COLORS = {
  surface: '#f9f9f9',
  surfaceLow: '#f3f3f3',
  surfaceHigh: '#e8e8e8',
  surfaceHighest: '#e2e2e2',
  surfaceLowest: '#ffffff',
  onSurface: '#1a1c1c',
  onSurfaceVariant: '#5d3f3d',
  primary: '#ff3333',        // Bauhaus Red — historic / heritage
  primaryDeep: '#d92626',
  secondary: '#3399cc',      // Bauhaus Blue — modern architecture / utility
  tertiary: '#ffff00',       // Bauhaus Yellow — secret spots / guidance
  found: '#1a1c1c',          // Stark black for "found" state
};

// Categories still drive the eyebrow text colour and label. The `shape` field
// is gone — every station now uses the same 3-circle marker form, with the
// per-station identity coming from STATION_COLOR_ORDER below instead of from
// a unique shape per category.
const CATEGORY_STYLE = {
  historic: { color: COLORS.primary,   label: 'Historic Site' },
  modern:   { color: COLORS.secondary, label: 'Modern Architecture' },
  secret:   { color: COLORS.tertiary,  label: 'Secret Spot' },
};

// --- Per-station marker colour order ---
// Every station's marker is the same form: three small circles in a row.
// Identity comes from the *order* of red / yellow / blue. With 6 stations and
// 3! = 6 unique permutations, each station gets one. Keep this stable —
// people will memorise stations by their colour order, like a key signature.
//
// Indexed by station id (1-based). Arrays are read left-to-right.
const STATION_COLOR_ORDER = {
  1: [COLORS.primary,   COLORS.tertiary,  COLORS.secondary], // R Y B
  2: [COLORS.primary,   COLORS.secondary, COLORS.tertiary],  // R B Y
  3: [COLORS.tertiary,  COLORS.primary,   COLORS.secondary], // Y R B
  4: [COLORS.tertiary,  COLORS.secondary, COLORS.primary],   // Y B R
  5: [COLORS.secondary, COLORS.primary,   COLORS.tertiary],  // B R Y
  6: [COLORS.secondary, COLORS.tertiary,  COLORS.primary],   // B Y R
};

// The "always-colourful" logo order — also drives the boot splash convergence.
// Red leads (matches the brand-primary colour used on the title text).
const LOGO_COLOR_ORDER = [COLORS.primary, COLORS.tertiary, COLORS.secondary];

// Single storage key: in the offline app, scanning the QR both unlocks the
// station and marks it 'found' — so we only persist one array.
const STORAGE_KEY = 'berlinKartographOfflineFound';

// Station config — Scheunenviertel, Berlin Mitte.
// Structural data only: editable title / description / clue text lives in
// `public/stations/<folder>/*.txt` and is loaded at runtime. Images live in
// `public/stations/<folder>/images/` as `image-1.jpg`, `image-2.jpg`, …
//
// `audioUrl` points at a file inside `public/audio/` — served at runtime at
// the corresponding URL.
//
// `unlockToken` is the secret inside the printed QR code. The app will
// accept either the raw token or a full URL containing `?unlock=<token>` —
// same tokens used by the map version, so existing QR codes work.
const STATIONS = [
  {
    id: 1,
    folder: 'station-1',
    category: 'historic',
    audioUrl: '/audio/01-juedische-maedchenschule.mp3',
    unlockToken: 'ns-jt9k4m2zwq',
  },
  {
    id: 2,
    folder: 'station-2',
    category: 'historic',
    audioUrl: '/audio/02-hackesche-hoefe.mp3',
    unlockToken: 'hh-r8p3v7nxbf',
  },
  {
    id: 3,
    folder: 'station-3',
    category: 'secret',
    audioUrl: '/audio/03-monbijoupark.mp3',
    unlockToken: 'mb-cwm2x5h7tq',
  },
  {
    id: 4,
    folder: 'station-4',
    category: 'modern',
    audioUrl: '/audio/04-kw-institute.mp3',
    unlockToken: 'kw-y4n6kbsd9p',
  },
  {
    id: 5,
    folder: 'station-5',
    category: 'modern',
    audioUrl: '/audio/05-volksbuehne.mp3',
    unlockToken: 'vb-z3q8rhwm5c',
  },
  {
    id: 6,
    folder: 'station-6',
    category: 'secret',
    audioUrl: '/audio/06-station-six.mp3',
    unlockToken: 's6-a7k2m9wpqx4b',
  },
];

const MAX_IMAGES_PER_STATION = 20;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// Fallback title used before the .txt files finish loading, so list rows
// never flash blank.
const fallbackTitle = (station) =>
  `Station ${String(station.id).padStart(2, '0')}`;

// Fetch a .txt file from public/stations/<folder>/; return '' if missing
// or unreadable rather than crashing the UI.
const fetchStationText = async (folder, filename) => {
  try {
    const base = process.env.PUBLIC_URL || '';
    const res = await fetch(`${base}/stations/${folder}/${filename}`);
    if (!res.ok) return '';
    const raw = await res.text();
    return raw.trim();
  } catch {
    return '';
  }
};

// Probe `image-N.{jpg,jpeg,png,webp}` under public/stations/<folder>/images/
// sequentially. Stop at the first index where no extension resolves — that's
// the natural boundary the user controls by just adding files.
//
// Uses the <img> tag's load/error events rather than fetch HEAD so we work
// even with CRA's dev server 404 fall-through.
const probeStationImages = async (folder) => {
  const base = process.env.PUBLIC_URL || '';
  const urls = [];
  for (let i = 1; i <= MAX_IMAGES_PER_STATION; i++) {
    let found = null;
    for (const ext of IMAGE_EXTENSIONS) {
      const url = `${base}/stations/${folder}/images/image-${i}.${ext}`;
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      if (ok) {
        found = url;
        break;
      }
    }
    if (!found) break;
    urls.push(found);
  }
  return urls;
};

// Read saved 'found' station ids once on startup.
const loadInitialFound = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Accept either the raw token or a URL containing `?unlock=<token>` — so the
// same QR codes used by the map version work here too.
const extractToken = (raw) => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  // URL-with-query case
  try {
    const u = new URL(trimmed);
    const t = u.searchParams.get('unlock');
    if (t) return t.trim();
  } catch {
    // not a URL — fall through
  }
  // Plain `?unlock=…` or `unlock=…` case
  const m = trimmed.match(/unlock=([^&\s]+)/i);
  if (m) return m[1].trim();
  return trimmed;
};

// --- Three-circle row ---
// The single visual primitive for all marker / logo / accent uses across the
// app. Pass an explicit `colors` array of three values, or use the helpers
// below (StationMarker / Logo) which derive colours from a station id or the
// logo convention.
const CircleTrio = ({ colors, size = 14, gap = 6 }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: `${gap}px`,
    }}
  >
    {colors.map((c, i) => (
      <span
        key={i}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: c,
          borderRadius: '50%',
          display: 'inline-block',
        }}
      />
    ))}
  </span>
);

// --- Per-station marker ---
// Three circles in this station's assigned order. Default state = all black;
// once the station is found, the row fills in with its colour permutation.
// Discovery reveals identity, rather than fading it.
// eslint-disable-next-line no-unused-vars
const StationMarker = ({ stationId, isFound, size = 14, gap = 6 }) => {
  const colors = STATION_COLOR_ORDER[stationId] || LOGO_COLOR_ORDER;
  const display = isFound ? colors : [COLORS.found, COLORS.found, COLORS.found];
  return <CircleTrio colors={display} size={size} gap={gap} />;
};

// --- Bauhaus-accent row (decorative — always colourful, logo order) ---
const AccentRow = ({ size = 14, gap = 6 }) => (
  <CircleTrio colors={LOGO_COLOR_ORDER} size={size} gap={gap} />
);

// --- Station logo ---
// Renders the per-station PNG placed at
// `public/stations/<folder>/logo/logo.png`. Used in place of the written
// station name on both the index list and the detail screen.
//
// If the file isn't there yet (404 / image error), falls back to rendering the
// station name as text styled to fit the slot — so the app keeps working as
// you author logos one by one.
const StationLogo = ({ station, imgStyle, fallbackStyle, alt }) => {
  const [errored, setErrored] = useState(false);
  const base = process.env.PUBLIC_URL || '';
  const url = `${base}/stations/${station.folder}/logo/logo.png`;
  if (errored) {
    return <span style={fallbackStyle}>{station.name}</span>;
  }
  return (
    <img
      src={url}
      alt={alt || station.name}
      onError={() => setErrored(true)}
      style={imgStyle}
    />
  );
};

// --- Header ---
const Header = ({ leftSlot, rightSlot }) => (
  <header style={{
    backgroundColor: COLORS.surface,
    color: COLORS.onSurface,
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${COLORS.surfaceLow}`,
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
      {leftSlot || (
        <>
          {/* 3-circle logo (red, yellow, blue — LOGO_COLOR_ORDER). The boot
              splash converges to this position on first paint. */}
          <CircleTrio colors={LOGO_COLOR_ORDER} size={14} gap={6} />
          <h1 style={{
            margin: 0,
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            letterSpacing: '-0.02em',
            fontSize: '18px',
            color: COLORS.primary,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            Berlin is for Seekers
          </h1>
        </>
      )}
    </div>
    {rightSlot}
  </header>
);

// --- Eyebrow (small uppercase spaced label) ---
const Eyebrow = ({ children, color = COLORS.onSurface, size = 10, spacing = '0.22em', style = {} }) => (
  <span style={{
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: `${size}px`,
    textTransform: 'uppercase',
    letterSpacing: spacing,
    color,
    display: 'block',
    ...style,
  }}>
    {children}
  </span>
);

// --- Audio Player (same styling as the map app) ---
const AudioPlayer = ({ audioUrl, treasureName }) => (
  <div style={{
    marginTop: '20px',
    padding: '14px',
    backgroundColor: COLORS.surfaceLow,
  }}>
    <Eyebrow spacing="0.18em" style={{ marginBottom: '8px' }}>
      Talk to me! · {treasureName}
    </Eyebrow>
    <audio
      controls
      preload="none"
      style={{ width: '100%', marginTop: '4px' }}
      controlsList="nodownload"
    >
      <source src={audioUrl} type="audio/mpeg" />
      Your browser does not support the audio element.
    </audio>
  </div>
);

// --- Photo Carousel (horizontal scroll-snap + pagination dots) ---
const PhotoCarousel = ({ images, treasureName }) => {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  // Update the active dot on scroll — debounce-free but cheap.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (!w) return;
      const idx = Math.round(el.scrollLeft / w);
      setActive((prev) => (prev === idx ? prev : idx));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (idx) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  };

  if (!images || images.length === 0) return null;

  return (
    <div style={{ marginTop: '20px' }}>
      <Eyebrow spacing="0.18em" style={{ marginBottom: '8px' }}>
        Photos · {images.length} {images.length === 1 ? 'image' : 'images'}
      </Eyebrow>
      {/* Track */}
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          // Hide default scrollbar — carousel has its own dot indicators.
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: COLORS.surfaceLow,
        }}
      >
        {images.map((src, i) => (
          <div
            key={src}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'start',
              aspectRatio: '4 / 3',
              background: COLORS.onSurface,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={src}
              alt={`${treasureName} — view ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
        ))}
      </div>
      {/* Dots */}
      {images.length > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '6px',
          marginTop: '10px',
        }}>
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Show photo ${i + 1} of ${images.length}`}
              aria-current={active === i ? 'true' : 'false'}
              style={{
                width: active === i ? '22px' : '10px',
                height: '4px',
                padding: 0,
                background: active === i ? COLORS.primary : COLORS.surfaceHighest,
                border: 'none',
                cursor: 'pointer',
                transition: 'width 180ms ease, background 180ms ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- QR Scanner Modal (wraps html5-qrcode in a Bauhaus-framed overlay) ---
const QR_ELEMENT_ID = 'bk-offline-qr-reader';

const QRScannerModal = ({ expectedStationName, onClose, onDecoded, error }) => {
  const scannerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let scanner = null;

    const start = async () => {
      try {
        scanner = new Html5Qrcode(QR_ELEMENT_ID, { verbose: false });
        scannerRef.current = scanner;
        // Prefer the rear camera on phones.
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!cameras || cameras.length === 0) {
          onDecoded(null, 'No camera found on this device.');
          return;
        }
        const rear = cameras.find((c) => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
        await scanner.start(
          rear.id,
          {
            fps: 10,
            qrbox: (w, h) => {
              const min = Math.min(w, h);
              const box = Math.max(180, Math.floor(min * 0.7));
              return { width: box, height: box };
            },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            // Fire once per successful decode — guard so we don't spam on repeat reads.
            if (!mountedRef.current) return;
            onDecoded(decodedText, null);
          },
          // ignore per-frame scan errors — they're just "no code in view"
          () => {}
        );
      } catch (e) {
        if (!cancelled) onDecoded(null, e && e.message ? e.message : 'Could not start camera.');
      }
    };

    start();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      const s = scannerRef.current;
      if (s) {
        // stop() returns a Promise but we don't need to await during cleanup.
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan QR code"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(26,28,28,0.92)',
        zIndex: 2100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `4px solid ${COLORS.primary}`,
        backgroundColor: COLORS.onSurface,
        color: COLORS.surfaceLowest,
      }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow color={COLORS.primary} style={{ marginBottom: '2px' }}>
            Scan · Station QR
          </Eyebrow>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '16px',
            textTransform: 'uppercase',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {expectedStationName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          style={{
            background: 'transparent',
            border: 'none',
            color: COLORS.surfaceLowest,
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '28px',
            fontWeight: 400,
            lineHeight: 1,
            padding: 0,
            width: '32px',
            height: '32px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      {/* Camera viewport */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div
          id={QR_ELEMENT_ID}
          style={{
            width: '100%',
            maxWidth: '640px',
          }}
        />
      </div>

      {/* Bottom help bar */}
      <div style={{
        padding: '16px 20px 24px 20px',
        backgroundColor: COLORS.onSurface,
        color: COLORS.surfaceLowest,
        borderTop: `1px solid rgba(255,255,255,0.08)`,
      }}>
        {error ? (
          <div style={{
            borderLeft: `6px solid ${COLORS.primary}`,
            paddingLeft: '10px',
            marginBottom: '12px',
          }}>
            <Eyebrow color={COLORS.primary} style={{ marginBottom: '2px' }}>
              Scan failed
            </Eyebrow>
            <div style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: '13px',
              lineHeight: 1.45,
              opacity: 0.9,
            }}>
              {error}
            </div>
          </div>
        ) : (
          <Eyebrow color={COLORS.tertiary} spacing="0.2em" style={{ marginBottom: '6px' }}>
            Hold steady · centre the code
          </Eyebrow>
        )}
        <div style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: '12px',
          lineHeight: 1.5,
          opacity: 0.75,
        }}>
          Point your camera at the QR code printed at this station. It'll unlock as soon as it's recognised.
        </div>
      </div>
    </div>
  );
};

// --- List Row (Stitch "seeker list" adapted to inline styles) ---
// Left block (~half the row width): the three station-color circles enlarged
// as a backdrop, with the station logo (public/stations/<folder>/logo/logo.png)
// overlaid on top. Right block: eyebrow + Found/Locked pill + chevron.
const StationRow = ({ station, isFound, onOpen }) => {
  const style = CATEGORY_STYLE[station.category] || CATEGORY_STYLE.historic;
  const stationColors = STATION_COLOR_ORDER[station.id] || LOGO_COLOR_ORDER;
  const backdropColors = isFound
    ? stationColors
    : [COLORS.found, COLORS.found, COLORS.found];

  return (
    <button
      type="button"
      onClick={() => onOpen(station.id)}
      aria-label={`Open ${station.name}`}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        padding: 0,
        margin: 0,
        marginBottom: '4px',
        backgroundColor: 'transparent',
        border: 'none',
        color: COLORS.onSurface,
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        minHeight: '96px',
      }}
    >
      {/* Left ~half — enlarged circles as a backdrop, station logo on top.
          Circles stay black until the station is found, then fill in with
          its color permutation (discovery reveals identity). */}
      <div style={{
        flex: '0 0 50%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
        minWidth: 0,
      }}>
        {/* Backdrop circles (absolutely positioned, centered, behind logo) */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <CircleTrio colors={backdropColors} size={42} gap={10} />
        </div>
        {/* Logo (or text fallback) layered on top */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <StationLogo
            station={station}
            imgStyle={{
              maxWidth: '100%',
              maxHeight: '64px',
              objectFit: 'contain',
              display: 'block',
            }}
            fallbackStyle={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '14px',
              lineHeight: 1.05,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              color: COLORS.onSurface,
              textAlign: 'center',
              padding: '0 6px',
              wordBreak: 'break-word',
            }}
          />
        </div>
      </div>

      {/* Right content — grey card with eyebrow + found/locked pill + chevron */}
      <div style={{
        flex: 1,
        padding: '18px 18px 18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        minWidth: 0,
        backgroundColor: COLORS.surfaceLow,
      }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow color={style.color} size={10} spacing="0.22em" style={{ marginBottom: '8px' }}>
            {`Station ${String(station.id).padStart(2, '0')}`}
          </Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isFound ? (
              <span style={{
                display: 'inline-block',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                padding: '4px 8px',
                backgroundColor: COLORS.onSurface,
                color: COLORS.surfaceLowest,
              }}>
                ✓ Found
              </span>
            ) : (
              <span style={{
                display: 'inline-block',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                padding: '4px 8px',
                color: COLORS.onSurfaceVariant,
                border: `1px solid ${COLORS.surfaceHighest}`,
                backgroundColor: 'transparent',
              }}>
                Locked
              </span>
            )}
          </div>
        </div>
        {/* Right-pointing chevron (pure CSS triangle) */}
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 0,
            height: 0,
            borderTop: '7px solid transparent',
            borderBottom: '7px solid transparent',
            borderLeft: `9px solid ${COLORS.onSurface}`,
          }}
        />
      </div>
    </button>
  );
};

// --- List Screen ---
const ListScreen = ({ stations, foundIds, onOpenStation }) => {
  const allFound = foundIds.length === stations.length && stations.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <Header
        rightSlot={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 10px',
            backgroundColor: COLORS.surfaceHighest,
          }}>
            <Eyebrow spacing="0.18em">Found</Eyebrow>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '14px',
              color: COLORS.primary,
              letterSpacing: '-0.02em',
            }}>
              {foundIds.length}/{stations.length}
            </span>
          </div>
        }
      />

      <main style={{
        flex: 1,
        padding: '28px 20px 40px 20px',
        maxWidth: '720px',
        width: '100%',
        margin: '0 auto',
      }}>
        {/* Hero */}
        <section style={{ marginBottom: '28px' }}>
          <Eyebrow color={COLORS.primary} spacing="0.22em" style={{ marginBottom: '10px' }}>
            Scheunenviertel
          </Eyebrow>
          <h2 style={{
            margin: 0,
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: 'clamp(38px, 11vw, 64px)',
            lineHeight: 0.92,
            textTransform: 'uppercase',
            letterSpacing: '-0.03em',
            color: COLORS.onSurface,
          }}>
            Utopias<br />
            <span style={{ color: COLORS.primary }}>Disappoint</span>
          </h2>
          <div style={{
            width: '96px',
            height: '8px',
            backgroundColor: COLORS.secondary,
            margin: '18px 0 16px 0',
          }} />
          <p style={{
            margin: 0,
            fontFamily: "'Manrope', sans-serif",
            fontSize: '14px',
            lineHeight: 1.55,
            color: COLORS.onSurfaceVariant,
            maxWidth: '460px',
          }}>
            Use the printed map to find each station. Open its page below, read
            the clue, then scan the QR code to unlock the audio story and
            photos.
          </p>
        </section>

        {/* Station list */}
        <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {stations.map((s) => (
            <div role="listitem" key={s.id}>
              <StationRow
                station={s}
                isFound={foundIds.includes(s.id)}
                onOpen={onOpenStation}
              />
            </div>
          ))}
        </div>

        {/* Footer accent */}
        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: `1px solid ${COLORS.surfaceLow}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <AccentRow size={14} />
          <Eyebrow color={COLORS.onSurfaceVariant} spacing="0.2em">
            Berlin is for Seekers · Offline
          </Eyebrow>
        </div>
      </main>

      {/* Bauhaus completion banner (only when every station is found) */}
      {allFound && (
        <div style={{
          backgroundColor: COLORS.primary,
          color: '#ffffff',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span aria-hidden="true" style={{
              width: '20px',
              height: '20px',
              background: COLORS.tertiary,
              display: 'inline-block',
              borderRadius: '50%',
            }} />
            <div>
              <Eyebrow color="rgba(255,255,255,0.85)" style={{ marginBottom: '2px' }}>
                Index Complete
              </Eyebrow>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '18px',
                textTransform: 'uppercase',
                letterSpacing: '-0.01em',
              }}>
                All Stations Unlocked
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }} aria-hidden="true">
            <span style={{ width: '14px', height: '14px', background: '#ffffff', display: 'inline-block', borderRadius: '50%' }} />
            <span style={{ width: '14px', height: '14px', background: COLORS.secondary, display: 'inline-block', borderRadius: '50%' }} />
            <span style={{ width: '14px', height: '14px', background: COLORS.tertiary, display: 'inline-block', borderRadius: '50%' }} />
          </div>
        </div>
      )}
    </div>
  );
};

// --- Detail Screen (locked or unlocked state for a single station) ---
const DetailScreen = ({ station, isFound, images, imagesLoaded, onBack, onOpenScanner }) => {
  const style = CATEGORY_STYLE[station.category] || CATEGORY_STYLE.historic;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <Header
        leftSlot={
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to index"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 10px',
              background: COLORS.surfaceHighest,
              border: 'none',
              cursor: 'pointer',
              color: COLORS.onSurface,
              font: 'inherit',
            }}
          >
            {/* Left-pointing triangle */}
            <span aria-hidden="true" style={{
              display: 'inline-block',
              width: 0,
              height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: `6px solid ${COLORS.onSurface}`,
            }} />
            <Eyebrow spacing="0.18em">Index</Eyebrow>
          </button>
        }
        rightSlot={
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: style.color,
          }}>
            {`Station ${String(station.id).padStart(2, '0')}`}
          </span>
        }
      />

      <main style={{
        flex: 1,
        padding: '24px 20px 40px 20px',
        maxWidth: '720px',
        width: '100%',
        margin: '0 auto',
      }}>
        {/* Station eyebrow */}
        <Eyebrow color={style.color} spacing="0.22em" style={{ marginBottom: '8px' }}>
          {`Station ${String(station.id).padStart(2, '0')}`}
        </Eyebrow>

        {/* Title — replaced by station logo image
            (public/stations/<folder>/logo/logo.png).
            If the file isn't present, falls back to the text title styled the
            way the heading used to look. The <h2> wrapper preserves the
            heading semantics for assistive tech. */}
        <h2 style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
        }}>
          <StationLogo
            station={station}
            imgStyle={{
              maxWidth: '100%',
              maxHeight: '120px',
              objectFit: 'contain',
              display: 'block',
            }}
            fallbackStyle={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: 'clamp(30px, 8vw, 44px)',
              lineHeight: 1,
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              color: COLORS.onSurface,
            }}
          />
        </h2>

        {/* Category color bar underline */}
        <div style={{
          width: '64px',
          height: '6px',
          backgroundColor: style.color,
          margin: '14px 0 18px 0',
        }} />

        {isFound ? (
          // --- Unlocked state ---
          <>
            {/* Found pill */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{
                display: 'inline-block',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                padding: '6px 10px',
                backgroundColor: COLORS.onSurface,
                color: COLORS.surfaceLowest,
              }}>
                ✓ Found
              </span>
            </div>

            {/* Photos carousel (if any). Three states:
                - not-yet-probed → render a neutral placeholder so we don't
                  flash "no photos" while the fetch is in flight
                - probed, 0 images → helpful empty-state with authoring hint
                - probed, 1+ images → the carousel */}
            {!imagesLoaded ? (
              <div style={{
                marginTop: '20px',
                padding: '14px',
                backgroundColor: COLORS.surfaceLow,
                borderLeft: `6px solid ${COLORS.surfaceHighest}`,
              }}>
                <Eyebrow color={COLORS.onSurfaceVariant} spacing="0.18em" style={{ marginBottom: '4px' }}>
                  Loading photos…
                </Eyebrow>
              </div>
            ) : images && images.length > 0 ? (
              <PhotoCarousel images={images} treasureName={station.name} />
            ) : (
              <div style={{
                marginTop: '20px',
                padding: '14px',
                backgroundColor: COLORS.surfaceLow,
                borderLeft: `6px solid ${COLORS.surfaceHighest}`,
              }}>
                <Eyebrow color={COLORS.onSurfaceVariant} spacing="0.18em" style={{ marginBottom: '4px' }}>
                  No photos yet
                </Eyebrow>
                <div style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '12px',
                  color: COLORS.onSurfaceVariant,
                  lineHeight: 1.5,
                }}>
                  Drop images into <code>public/stations/{station.folder}/images/</code>
                  {' '}(named <code>image-1.jpg</code>, <code>image-2.jpg</code>, …) and they'll
                  show up here.
                </div>
              </div>
            )}

            {/* Audio */}
            <AudioPlayer audioUrl={station.audioUrl} treasureName={station.name} />

            {/* Long description — the in-depth story, only after unlock.
                Lives in public/stations/<folder>/description-long.txt and is
                rendered below the photos + audio player. Blank lines split
                paragraphs. */}
            {station.descriptionLong && (
              <div style={{ marginTop: '28px' }}>
                <Eyebrow color={style.color} spacing="0.2em" style={{ marginBottom: '8px' }}>
                  About this place
                </Eyebrow>
                {station.descriptionLong.split(/\n\s*\n/).map((para, i) => (
                  <p
                    key={i}
                    style={{
                      margin: '0 0 12px 0',
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: '15px',
                      lineHeight: 1.6,
                      color: COLORS.onSurface,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {para.trim()}
                  </p>
                ))}
              </div>
            )}

            {/* Accent row */}
            <div style={{ marginTop: '28px' }}>
              <AccentRow size={14} />
            </div>
          </>
        ) : (
          // --- Locked state ---
          <>
            {/* Short description — the teaser shown before unlock, in italic
                above the clue. Lives in public/stations/<folder>/description.txt. */}
            {station.description && (
              <p style={{
                margin: '0 0 18px 0',
                fontFamily: "'Manrope', sans-serif",
                fontStyle: 'italic',
                fontSize: '15px',
                lineHeight: 1.55,
                color: COLORS.onSurface,
              }}>
                {station.description}
              </p>
            )}

            {/* Clue block */}
            <div style={{
              backgroundColor: COLORS.surfaceLow,
              padding: '18px 18px 18px 18px',
              borderLeft: `6px solid ${style.color}`,
              marginBottom: '22px',
            }}>
              <Eyebrow color={COLORS.onSurface} spacing="0.2em" style={{ marginBottom: '8px' }}>
                Clue · Where is the QR?
              </Eyebrow>
              <p style={{
                margin: 0,
                fontFamily: "'Manrope', sans-serif",
                fontSize: '14px',
                lineHeight: 1.55,
                color: COLORS.onSurface,
              }}>
                {station.clue || 'No clue written yet. Check public/stations/' + station.folder + '/clue.txt.'}
              </p>
            </div>

            {/* Locked state info */}
            <div style={{
              padding: '14px',
              backgroundColor: COLORS.surfaceLow,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '22px',
            }}>
              {/* Padlock glyph (built from primitives) */}
              <span aria-hidden="true" style={{
                flexShrink: 0,
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <span style={{
                  width: '14px',
                  height: '8px',
                  border: `2px solid ${COLORS.onSurface}`,
                  borderBottom: 'none',
                }} />
                <span style={{
                  width: '20px',
                  height: '14px',
                  background: COLORS.onSurface,
                }} />
              </span>
              <div>
                <Eyebrow spacing="0.18em" style={{ marginBottom: '2px' }}>
                  Audio & Photos Locked
                </Eyebrow>
                <div style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: '12px',
                  color: COLORS.onSurfaceVariant,
                  lineHeight: 1.45,
                }}>
                  Scan the QR code at this station to unlock.
                </div>
              </div>
            </div>

            {/* Scan CTA */}
            <button
              type="button"
              onClick={onOpenScanner}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                width: '100%',
                backgroundColor: COLORS.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 0,
                padding: '16px 20px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '14px',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                cursor: 'pointer',
              }}
            >
              {/* QR-ish square glyph */}
              <span aria-hidden="true" style={{
                display: 'inline-grid',
                gridTemplateColumns: '6px 6px 6px',
                gridTemplateRows: '6px 6px 6px',
                gap: '2px',
              }}>
                <span style={{ background: '#fff' }} />
                <span style={{ background: 'transparent' }} />
                <span style={{ background: '#fff' }} />
                <span style={{ background: 'transparent' }} />
                <span style={{ background: '#fff' }} />
                <span style={{ background: 'transparent' }} />
                <span style={{ background: '#fff' }} />
                <span style={{ background: 'transparent' }} />
                <span style={{ background: '#fff' }} />
              </span>
              Scan QR Code
            </button>

            {/* Accent row */}
            <div style={{ marginTop: '28px' }}>
              <AccentRow size={14} />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// --- Just-unlocked Toast (brief confirmation when a QR is accepted) ---
const UnlockToast = ({ station }) => {
  if (!station) return null;
  const style = CATEGORY_STYLE[station.category] || CATEGORY_STYLE.historic;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: COLORS.onSurface,
        color: COLORS.surfaceLowest,
        borderLeft: `12px solid ${style.color}`,
        padding: '14px 20px',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        zIndex: 2000,
        boxShadow: '0 6px 0 rgba(26,28,28,0.12)',
      }}
    >
      <Eyebrow color={style.color} style={{ marginBottom: '4px' }}>
        ✓ Unlocked
      </Eyebrow>
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        fontSize: '16px',
        textTransform: 'uppercase',
        letterSpacing: '-0.01em',
      }}>
        {station.name}
      </div>
      <div style={{
        fontFamily: "'Manrope', sans-serif",
        fontSize: '12px',
        opacity: 0.75,
        marginTop: '4px',
      }}>
        Audio and photos are ready below.
      </div>
    </div>
  );
};

// --- Boot splash ---
// Three big circles (red, yellow, blue — LOGO_COLOR_ORDER) burst from dots in
// unison, hold briefly, then shrink and translate to land on the matching
// circle of the 3-circle header logo, fading out as the static logo takes over
// underneath. Total runtime: 2.5s.
//
// Geometry assumptions (kept in sync with the Header's logo):
// - Each big splash circle is 72px, 28px gap → row width = 3*72 + 2*28 = 272px
// - Each logo circle is 14px, 6px gap → row width = 3*14 + 2*6 = 54px
// - Header padding is 14px top / 20px left, so logo-circle 1 (red, leftmost)
//   sits at viewport (27px, 21px); logo-circle 2 (yellow) at (47px, 21px);
//   logo-circle 3 (blue) at (67px, 21px).
// - End-state scale = 14/72 ≈ 0.19 so the splash circles match logo size.
//
// Implementation notes:
// - Three explicit @keyframes (one per circle) — no CSS variables in
//   keyframes (those can silently fail in some build pipelines).
// - Timer captured in a ref so React re-renders / StrictMode double-mounts
//   never reset the 2.5s countdown.
const BootSplash = ({ onDone }) => {
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[BootSplash] mounted');
    const t = setTimeout(() => onDoneRef.current && onDoneRef.current(), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="presentation"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: COLORS.surface,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'bootSplashFade 0.4s ease-in 2.1s both',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes bootSplashFade {
          to { opacity: 0; }
        }
        /* Big-circle 1 (red, leftmost): screen-center starts at -100px from row
           center → -50vw - 100px from viewport-left. End at logo position 27px. */
        @keyframes bootCircleRed {
          0%   { transform: translate(0,0) scale(0);    opacity: 0; }
          10%  { transform: translate(0,0) scale(0.08); opacity: 1; }
          56%  { transform: translate(0,0) scale(1);    opacity: 1; }
          76%  { transform: translate(0,0) scale(1);    opacity: 1; }
          100% { transform: translate(calc(-50vw + 127px), calc(-50vh + 21px)) scale(0.19); opacity: 0; }
        }
        /* Big-circle 2 (yellow, middle). End at logo position 47px. */
        @keyframes bootCircleYellow {
          0%   { transform: translate(0,0) scale(0);    opacity: 0; }
          10%  { transform: translate(0,0) scale(0.08); opacity: 1; }
          56%  { transform: translate(0,0) scale(1);    opacity: 1; }
          76%  { transform: translate(0,0) scale(1);    opacity: 1; }
          100% { transform: translate(calc(-50vw + 47px), calc(-50vh + 21px)) scale(0.19); opacity: 0; }
        }
        /* Big-circle 3 (blue, rightmost): screen-center starts at +100px from
           row center. End at logo position 67px. */
        @keyframes bootCircleBlue {
          0%   { transform: translate(0,0) scale(0);    opacity: 0; }
          10%  { transform: translate(0,0) scale(0.08); opacity: 1; }
          56%  { transform: translate(0,0) scale(1);    opacity: 1; }
          76%  { transform: translate(0,0) scale(1);    opacity: 1; }
          100% { transform: translate(calc(-50vw - 33px), calc(-50vh + 21px)) scale(0.19); opacity: 0; }
        }
        .boot-circle {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          transform-origin: 50% 50%;
          will-change: transform, opacity;
        }
        .boot-circle--red    { animation: bootCircleRed    2.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .boot-circle--yellow { animation: bootCircleYellow 2.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .boot-circle--blue   { animation: bootCircleBlue   2.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>
      <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
        <div className="boot-circle boot-circle--red"    style={{ backgroundColor: COLORS.primary }} />
        <div className="boot-circle boot-circle--yellow" style={{ backgroundColor: COLORS.tertiary }} />
        <div className="boot-circle boot-circle--blue"   style={{ backgroundColor: COLORS.secondary }} />
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function OfflineApp() {
  const [foundIds, setFoundIds] = useState(loadInitialFound);
  const [activeId, setActiveId] = useState(null); // null = list screen
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [justUnlockedId, setJustUnlockedId] = useState(null);
  const [bootDone, setBootDone] = useState(false); // splash overlay until 2.5s

  // Content loaded from public/stations/<folder>/*.txt — keyed by id.
  const [stationContent, setStationContent] = useState({});
  // Image URL lists, keyed by station id. Populated lazily when a station
  // detail page is opened in an unlocked state.
  const [stationImages, setStationImages] = useState({});

  // Load each station's .txt files once on mount.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(
        STATIONS.map(async (s) => {
          const [title, description, descriptionLong, clue] = await Promise.all([
            fetchStationText(s.folder, 'title.txt'),
            fetchStationText(s.folder, 'description.txt'),
            fetchStationText(s.folder, 'description-long.txt'),
            fetchStationText(s.folder, 'clue.txt'),
          ]);
          return [s.id, { title, description, descriptionLong, clue }];
        })
      );
      if (!cancelled) {
        setStationContent(Object.fromEntries(entries));
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Merge static config + loaded content into the "enriched" station list.
  const stations = useMemo(
    () =>
      STATIONS.map((s) => {
        const c = stationContent[s.id] || {};
        return {
          ...s,
          name: c.title || fallbackTitle(s),
          description: c.description || '',
          descriptionLong: c.descriptionLong || '',
          clue: c.clue || '',
        };
      }),
    [stationContent]
  );

  // Persist found ids (skip the hydration pass).
  const didHydrate = useRef(false);
  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(foundIds));
    } catch {
      // Private mode / quota — fail silently.
    }
  }, [foundIds]);

  // When a station is unlocked, probe its images/ folder (once per station).
  const activeStation = activeId != null ? stations.find((s) => s.id === activeId) : null;
  const activeIsFound = activeStation ? foundIds.includes(activeStation.id) : false;

  useEffect(() => {
    if (!activeStation || !activeIsFound) return;
    if (stationImages[activeStation.id] !== undefined) return; // already probed
    let cancelled = false;
    probeStationImages(activeStation.folder).then((urls) => {
      if (cancelled) return;
      setStationImages((prev) => ({ ...prev, [activeStation.id]: urls }));
    });
    return () => { cancelled = true; };
  }, [activeStation, activeIsFound, stationImages]);

  // Auto-dismiss the unlock toast.
  useEffect(() => {
    if (justUnlockedId == null) return;
    const t = setTimeout(() => setJustUnlockedId(null), 4500);
    return () => clearTimeout(t);
  }, [justUnlockedId]);

  const openStation = useCallback((id) => {
    setActiveId(id);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, []);
  const closeStation = useCallback(() => {
    setActiveId(null);
    setScannerOpen(false);
    setScanError(null);
  }, []);
  const openScanner = useCallback(() => {
    setScanError(null);
    setScannerOpen(true);
  }, []);
  const closeScanner = useCallback(() => {
    setScannerOpen(false);
    setScanError(null);
  }, []);

  const handleDecoded = useCallback((decodedText, errorMessage) => {
    if (errorMessage) {
      setScanError(errorMessage);
      return;
    }
    const token = extractToken(decodedText);
    const matched = STATIONS.find((s) => s.unlockToken === token);
    if (!matched) {
      setScanError("That code isn't a Seekers station QR. Try again.");
      return;
    }
    // Record found + navigate to the matched station's page (which will
    // render in its unlocked state automatically).
    setFoundIds((prev) => (prev.includes(matched.id) ? prev : [...prev, matched.id]));
    setJustUnlockedId(matched.id);
    setActiveId(matched.id);
    setScannerOpen(false);
    setScanError(null);
  }, []);

  // Render
  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      backgroundColor: COLORS.surface,
    }}>
      {/* --- Boot splash (first paint only) --- */}
      {!bootDone && <BootSplash onDone={() => setBootDone(true)} />}

      {activeStation ? (
        <DetailScreen
          station={activeStation}
          isFound={activeIsFound}
          images={stationImages[activeStation.id] || []}
          imagesLoaded={stationImages[activeStation.id] !== undefined}
          onBack={closeStation}
          onOpenScanner={openScanner}
        />
      ) : (
        <ListScreen
          stations={stations}
          foundIds={foundIds}
          onOpenStation={openStation}
        />
      )}

      {scannerOpen && activeStation && (
        <QRScannerModal
          expectedStationName={activeStation.name}
          onClose={closeScanner}
          onDecoded={handleDecoded}
          error={scanError}
        />
      )}

      {justUnlockedId != null && (
        <UnlockToast station={stations.find((s) => s.id === justUnlockedId)} />
      )}
    </div>
  );
}
