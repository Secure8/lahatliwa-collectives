export function createHeroBackgroundRender({
  imageUrl = '',
  position = 'center',
  blur = 14,
  mode = 'none',
  overlayOpacity = 0.55,
} = {}) {
  return {
    imageUrl,
    position,
    blur,
    mode,
    overlayOpacity,
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
