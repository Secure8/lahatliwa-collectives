export const CREATIVE_SHORT_BIO_MAX_LENGTH = 160;

export function creativeShortBioCount(value = '') {
  return String(value).trim().length;
}
