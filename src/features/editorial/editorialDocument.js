export const EDITORIAL_DOCUMENT_VERSION = 1;
export const EDITORIAL_BLOCK_TYPES = Object.freeze(['paragraph', 'heading', 'quote', 'image', 'gallery', 'facts', 'callout', 'divider']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_URL = /^(https:\/\/|\/(?!\/))[^\s<>"']+$/i;

const clean = (value, max = 5000) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

function safeLink(value = '') {
  const url = clean(value, 2048);
  return !url || SAFE_URL.test(url) ? url : '';
}

function normalizeImage(value = {}) {
  const rawUrl = clean(value.url, 2048);
  const url = safeLink(value.url);
  if (rawUrl && !url) return null;
  return { url, alt: clean(value.alt, 240), caption: clean(value.caption, 500), mediaId: UUID.test(String(value.mediaId || '')) ? value.mediaId : null };
}

function presentation(value = {}) {
  return {
    hidden: value.hidden === true,
    collapsed: value.collapsed === true,
    align: ['left', 'center', 'right'].includes(value.align) ? value.align : 'left',
    width: ['narrow', 'normal', 'wide', 'full'].includes(value.width) ? value.width : 'normal',
    spacing: ['compact', 'normal', 'relaxed'].includes(value.spacing) ? value.spacing : 'normal',
    background: ['none', 'soft', 'accent'].includes(value.background) ? value.background : 'none',
    emphasis: ['normal', 'strong', 'subtle'].includes(value.emphasis) ? value.emphasis : 'normal',
    linkUrl: safeLink(value.linkUrl),
  };
}

export function normalizeEditorialBlock(block = {}, index = 0) {
  const type = EDITORIAL_BLOCK_TYPES.includes(block.type) ? block.type : '';
  if (!type) return null;
  const id = UUID.test(String(block.id || '')) ? block.id : `block-${index + 1}`;
  const style = presentation(block);
  if (type === 'paragraph') return { id, type, text: clean(block.text, 10000), ...style };
  if (type === 'heading') return { id, type, level: [2, 3, 4].includes(Number(block.level)) ? Number(block.level) : 2, text: clean(block.text, 240), ...style };
  if (type === 'quote') return { id, type, text: clean(block.text, 3000), attribution: clean(block.attribution, 240), ...style };
  if (type === 'image') {
    const image = normalizeImage(block);
    return image ? { id, type, ...image, ...style, aspectRatio: ['natural', 'landscape', 'portrait', 'square'].includes(block.aspectRatio) ? block.aspectRatio : 'landscape', fit: block.fit === 'contain' ? 'contain' : 'cover', imageAlign: ['left', 'center', 'right'].includes(block.imageAlign) ? block.imageAlign : 'center' } : null;
  }
  if (type === 'gallery') return { id, type, images: (Array.isArray(block.images) ? block.images : []).slice(0, 12).map(normalizeImage).filter(Boolean), ...style, aspectRatio: ['landscape', 'portrait', 'square'].includes(block.aspectRatio) ? block.aspectRatio : 'landscape', fit: block.fit === 'contain' ? 'contain' : 'cover' };
  if (type === 'facts') return { id, type, items: (Array.isArray(block.items) ? block.items : []).slice(0, 20).map((item) => ({ label: clean(item?.label, 100), value: clean(item?.value, 500) })).filter((item) => item.label && item.value), ...style };
  if (type === 'callout') return { id, type, tone: ['note', 'tip', 'warning'].includes(block.tone) ? block.tone : 'note', title: clean(block.title, 160), text: clean(block.text, 2000), linkLabel: clean(block.linkLabel, 80), linkUrl: safeLink(block.linkUrl), ...style };
  return { id, type: 'divider', ...style };
}

export function validateEditorialDocument(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rawBlocks = Array.isArray(source.blocks) ? source.blocks : [];
  const blocks = rawBlocks.slice(0, 200).map(normalizeEditorialBlock).filter(Boolean);
  const errors = [];
  if (Number(source.version || EDITORIAL_DOCUMENT_VERSION) !== EDITORIAL_DOCUMENT_VERSION) errors.push('Unsupported document version.');
  if (rawBlocks.length > 200) errors.push('A document can contain at most 200 blocks.');
  if (blocks.length !== rawBlocks.length) errors.push('One or more blocks contain unsupported or unsafe values.');
  return { valid: errors.length === 0, errors, document: { version: EDITORIAL_DOCUMENT_VERSION, blocks } };
}

export function emptyEditorialDocument() {
  return { version: EDITORIAL_DOCUMENT_VERSION, blocks: [] };
}

export function editorialDocumentText(document = {}) {
  const { document: safe } = validateEditorialDocument(document);
  return safe.blocks.flatMap((block) => {
    if (block.type === 'gallery' || block.type === 'divider' || block.type === 'image') return [];
    if (block.type === 'facts') return block.items.flatMap((item) => [item.label, item.value]);
    return [block.title, block.text, block.attribution].filter(Boolean);
  }).join(' ');
}
