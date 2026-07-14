export function normalizeHeroOverlayOpacity(value, fallback = 0.55) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

export function createHeroBackgroundRender({
  imageUrl = '',
  position = 'center',
  blur = 14,
  mode = 'none',
  overlayOpacity = 0.55,
} = {}) {
  const normalizedOverlayOpacity = normalizeHeroOverlayOpacity(overlayOpacity);
  return {
    imageUrl,
    position,
    blur,
    mode,
    overlayOpacity: normalizedOverlayOpacity,
    overlayStyle: {
      backgroundColor: 'var(--hero-overlay-color, #09090b)',
      opacity: normalizedOverlayOpacity,
    },
    style: imageUrl
      ? {
          backgroundImage: `url(${imageUrl})`,
          backgroundPosition: position,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          filter: mode === 'ambient-blur' ? `blur(${blur}px)` : undefined,
          transform: mode === 'ambient-blur' ? 'scale(1.05)' : undefined,
        }
      : {},
  };
}
