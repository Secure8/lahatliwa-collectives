import assert from 'node:assert/strict';
import test from 'node:test';
import { contextualInquiryUrl, defaultTourismInquiryCategory, inquiryContextFromSearchParams, normalizeInquiryContext, TOURISM_INQUIRY_CATEGORIES } from './inquiryContext.js';

test('typed Editorial inquiry context survives a validated URL round trip', () => {
  const url = contextualInquiryUrl({ context: { id: '123e4567-e89b-42d3-a456-426614174000', type: 'place', slug: 'jawili-falls', title: 'Jawili Falls', municipality: 'Tangalan', publicUrl: '/places/jawili-falls', sourceAction: 'destination-card' } });
  const params = new URL(`https://example.test${url}`).searchParams;
  const context = inquiryContextFromSearchParams(params);
  assert.equal(params.get('path'), 'tourism');
  assert.deepEqual(context, { id: '123e4567-e89b-42d3-a456-426614174000', type: 'place', slug: 'jawili-falls', title: 'Jawili Falls', publicUrl: '/places/jawili-falls', municipality: 'Tangalan', inquiryCategory: 'destination-information', sourceAction: 'destination-card' });
});

test('published project context keeps a verified identifier and branch through refresh', () => {
  const url = contextualInquiryUrl({ context: { type: 'project', id: '123e4567-e89b-42d3-a456-426614174000', slug: 'community-film', title: 'Community Film', branch: 'studio', sourceAction: 'project-detail-inquiry' } });
  const params = new URL(`https://example.test${url}`).searchParams;
  assert.equal(params.get('path'), 'service');
  assert.equal(params.get('branch'), 'studio');
  assert.deepEqual(inquiryContextFromSearchParams(params), { type: 'project', id: '123e4567-e89b-42d3-a456-426614174000', slug: 'community-film', title: 'Community Film', publicUrl: '/projects/community-film', branch: 'studio', service: '', creative: '', sourceAction: 'project-detail-inquiry' });
});

test('invalid ids, slugs, types, and categories are rejected or normalized safely', () => {
  assert.equal(normalizeInquiryContext({ type: 'draft', slug: 'private-story' }), null);
  assert.equal(normalizeInquiryContext({ type: 'place', slug: '../private' }), null);
  assert.equal(normalizeInquiryContext({ type: 'place', slug: 'valid', id: 'undefined' }), null);
  assert.equal(normalizeInquiryContext({ type: 'event', slug: 'festival', inquiryCategory: 'admin' }).inquiryCategory, 'event-or-activity');
});

test('tourism categories cover all public inquiry choices', () => {
  assert.deepEqual(TOURISM_INQUIRY_CATEGORIES.map(([key]) => key), ['destination-information', 'event-or-activity', 'local-product', 'tourism-question', 'correction-or-concern']);
  assert.equal(defaultTourismInquiryCategory('activity'), 'event-or-activity');
  assert.equal(defaultTourismInquiryCategory('local_product'), 'local-product');
});
