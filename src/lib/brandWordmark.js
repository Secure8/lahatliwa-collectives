export function normalizeBrandWordmark(value, fallback = '') {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || String(fallback || '').replace(/\s+/g, ' ').trim();
}

export function brandWordmarkLengthClass(value) {
  const length = normalizeBrandWordmark(value).length;
  if (length > 32) return 'brand-wordmark--very-long';
  if (length > 18) return 'brand-wordmark--long';
  return '';
}

export function isBrandWordmarkText(value, configuredBrandName, aliases = []) {
  const text = normalizeBrandWordmark(value).toLocaleLowerCase();
  const brands = [configuredBrandName, ...aliases]
    .map((name) => normalizeBrandWordmark(name).toLocaleLowerCase())
    .filter(Boolean);
  if (!text || !brands.length) return false;
  return brands.some((brand) => text === brand || text === `${brand} collectives`);
}
