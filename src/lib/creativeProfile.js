export const CREATIVE_SHORT_BIO_MAX_LENGTH = 160;
export const CREATIVE_DISCIPLINE_MAX_COUNT = 6;
export const CREATIVE_DISCIPLINE_MAX_LENGTH = 40;

const LEGACY_DISCIPLINE_NAMES = [
  'Social Media Management', 'Interface Customization', 'Photo And Video Editing',
  'Photo & Video Editing', 'Application Development', 'Website Development',
  'Website Creation', 'Branding & Page Support', 'Marketing Consultation',
  'Digital Marketing', 'Content Planning', 'Content Creation', 'Campaign Support',
  'Interface Design', 'Graphic Design', 'Digital Support', 'Digital Systems',
  'Photo Editing', 'Video Editing', 'Photography', 'Videography',
];

export function creativeShortBioCount(value = '') {
  return String(value).trim().length;
}

export function normalizeCreativeDisciplines(value = []) {
  const source = Array.isArray(value) ? value : [value];
  const entries = source.flatMap((item) => String(item || '').split(/[\n,]+/)).flatMap((item) => {
    const trimmed = item.trim().replace(/\s+/g, ' ');
    if (trimmed.length <= CREATIVE_DISCIPLINE_MAX_LENGTH) return [trimmed];
    const lower = trimmed.toLowerCase();
    const matches = LEGACY_DISCIPLINE_NAMES.map((name) => ({ name, index: lower.indexOf(name.toLowerCase()) }))
      .filter(({ index }) => index >= 0).sort((a, b) => a.index - b.index);
    return matches.length > 1 ? matches.map(({ name }) => name) : [trimmed];
  });
  return entries.map((item) => String(item || '').trim().replace(/\s+/g, ' ')).filter(Boolean)
    .filter((item, index, list) => list.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index);
}

export function creativeDisciplineError(value = []) {
  const entries = normalizeCreativeDisciplines(value);
  if (entries.length > CREATIVE_DISCIPLINE_MAX_COUNT) return `Add no more than ${CREATIVE_DISCIPLINE_MAX_COUNT} disciplines.`;
  if (entries.some((item) => item.length > CREATIVE_DISCIPLINE_MAX_LENGTH)) return `Keep each discipline within ${CREATIVE_DISCIPLINE_MAX_LENGTH} characters.`;
  return '';
}
