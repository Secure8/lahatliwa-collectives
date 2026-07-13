export function projectLayout(index, count = Infinity) {
  if (count === 1) return 'feature';
  if (count === 2) return 'half';
  if (count === 3) return index === 0 ? 'feature' : 'half';
  const pattern = ['feature', 'half', 'half', 'offset-large', 'offset-small', 'cinematic'];
  const layout = pattern[index % pattern.length];
  const isUnpairedFinalItem = index === count - 1 && (layout === 'half' || layout === 'offset-large');
  return isUnpairedFinalItem ? 'feature' : layout;
}
