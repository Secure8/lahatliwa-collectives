import { EDITORIAL_BLOCK_TYPES, emptyEditorialDocument } from './editorialDocument.js';

const BLOCK_LABELS = Object.freeze({
  paragraph: 'Paragraph',
  heading: 'Heading',
  image: 'Image',
  gallery: 'Gallery',
  quote: 'Quote',
  facts: 'Facts',
  callout: 'Callout',
  divider: 'Divider',
});

export const EDITORIAL_SECTION_OPTIONS = Object.freeze(
  EDITORIAL_BLOCK_TYPES.map((type) => ({ type, label: BLOCK_LABELS[type] })),
);

export const EDITORIAL_CONTENT_CHOICES = Object.freeze([
  { key: 'journal', label: 'Journal', description: 'Guides, culture stories, and tourism updates.' },
  { key: 'event', label: 'Event', description: 'Festivals, schedules, and community celebrations.' },
  { key: 'place', label: 'Destination', description: 'Destinations, nature spots, and heritage sites.' },
  { key: 'activity', label: 'Activity', description: 'Tours, workshops, and visitor experiences.' },
  { key: 'local_product', label: 'Local Product', description: 'Food, crafts, makers, and product stories.' },
]);

const LAYOUTS = Object.freeze({
  event: [
    ['festival-guide', 'Festival Guide', 'A story-led guide with highlights and visitor notes.', ['heading:What to expect', 'paragraph', 'heading:Plan your visit', 'paragraph', 'callout']],
    ['upcoming-event', 'Upcoming Event', 'A concise announcement with essential context.', ['paragraph', 'heading:Event highlights', 'paragraph', 'callout']],
    ['community-celebration', 'Community Celebration', 'A people-first format for local traditions.', ['heading:The celebration', 'paragraph', 'quote', 'heading:Community notes', 'paragraph']],
  ],
  place: [
    ['destination-guide', 'Destination Guide', 'A complete introduction and practical visitor guide.', ['paragraph', 'image', 'heading:Why visit', 'paragraph', 'heading:Before you go', 'callout']],
    ['nature-spot', 'Beach or Nature Spot', 'A visual format for landscapes and outdoor places.', ['image', 'paragraph', 'gallery', 'heading:Visitor notes', 'callout']],
    ['heritage-site', 'Heritage Site', 'History, meaning, and respectful visitor guidance.', ['heading:The story of this place', 'paragraph', 'quote', 'heading:Visiting responsibly', 'paragraph']],
  ],
  activity: [
    ['outdoor-experience', 'Outdoor Experience', 'An experience overview with preparation notes.', ['paragraph', 'heading:What you will experience', 'paragraph', 'heading:Prepare before you go', 'callout']],
    ['tour-workshop', 'Tour or Workshop', 'A clear format for guided and hands-on experiences.', ['paragraph', 'heading:How it works', 'paragraph', 'facts', 'callout']],
    ['visitor-activity', 'Visitor Activity', 'A flexible introduction for things to do.', ['paragraph', 'image', 'heading:Good to know', 'paragraph']],
  ],
  local_product: [
    ['product-story', 'Product Story', 'Origins, craft, and the people behind a product.', ['heading:The story', 'paragraph', 'image', 'heading:How it is made', 'paragraph']],
    ['maker-profile', 'Maker Profile', 'A portrait-led story about a local maker.', ['quote', 'paragraph', 'heading:The craft', 'paragraph', 'gallery']],
    ['food-craft-feature', 'Food or Craft Feature', 'A visual feature with buying information.', ['image', 'paragraph', 'facts', 'callout']],
  ],
  journal: [
    ['travel-guide', 'Travel Guide', 'A practical guide organized for easy reading.', ['paragraph', 'heading:Start here', 'paragraph', 'heading:Plan your visit', 'callout']],
    ['culture-story', 'Culture Story', 'A narrative format for people, heritage, and traditions.', ['paragraph', 'quote', 'heading:Why it matters', 'paragraph']],
    ['tourism-update', 'Tourism News or Update', 'A concise update with context and sources.', ['paragraph', 'divider', 'heading:What visitors should know', 'paragraph']],
  ],
});

export function editorialLayoutsFor(contentType = 'journal') {
  return (LAYOUTS[contentType] || LAYOUTS.journal).map(([key, label, description]) => ({ key, label, description }));
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEditorialBlock(type, overrides = {}) {
  const base = { id: makeId(), type, hidden: false, align: 'left', width: 'normal', spacing: 'normal', background: 'none' };
  if (type === 'heading') return { ...base, level: 2, text: '', ...overrides };
  if (type === 'image') return { ...base, url: '', alt: '', caption: '', aspectRatio: 'landscape', fit: 'cover', imageAlign: 'center', ...overrides };
  if (type === 'gallery') return { ...base, images: [], aspectRatio: 'landscape', fit: 'cover', ...overrides };
  if (type === 'quote') return { ...base, text: '', attribution: '', ...overrides };
  if (type === 'facts') return { ...base, items: [], ...overrides };
  if (type === 'callout') return { ...base, tone: 'note', title: '', text: '', linkLabel: '', linkUrl: '', ...overrides };
  if (type === 'divider') return { ...base, ...overrides };
  return { ...base, type: 'paragraph', text: '', ...overrides };
}

function descriptorToBlock(descriptor) {
  const [type, text = ''] = descriptor.split(':');
  return createEditorialBlock(type, text ? { text } : {});
}

export function createEditorialTemplate(contentType = 'journal', layoutKey = '') {
  const layouts = LAYOUTS[contentType] || LAYOUTS.journal;
  const selected = layouts.find(([key]) => key === layoutKey) || layouts[0];
  return { version: 1, blocks: selected ? selected[3].map(descriptorToBlock) : emptyEditorialDocument().blocks };
}

export function moveEditorialBlock(blocks = [], fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= blocks.length || toIndex >= blocks.length) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function duplicateEditorialBlock(blocks = [], index) {
  if (!blocks[index]) return blocks;
  const duplicate = { ...structuredClone(blocks[index]), id: makeId() };
  return [...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)];
}

export function removeEditorialBlock(blocks = [], index) {
  return blocks.filter((_, current) => current !== index);
}

export function insertEditorialBlock(blocks = [], type, index = blocks.length) {
  const safeIndex = Math.max(0, Math.min(index, blocks.length));
  return [...blocks.slice(0, safeIndex), createEditorialBlock(type), ...blocks.slice(safeIndex)];
}

export function blockDisplayName(block = {}, index = 0) {
  const label = BLOCK_LABELS[block.type] || 'Section';
  const hint = String(block.text || block.title || block.caption || '').trim().slice(0, 36);
  return hint ? `${label}: ${hint}` : `${label} ${index + 1}`;
}

export function createHistoryState(value) {
  return { past: [], present: structuredClone(value), future: [] };
}

export function pushHistory(history, value, limit = 60) {
  if (JSON.stringify(history.present) === JSON.stringify(value)) return history;
  return { past: [...history.past, history.present].slice(-limit), present: structuredClone(value), future: [] };
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1), future: [history.present, ...history.future] };
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
