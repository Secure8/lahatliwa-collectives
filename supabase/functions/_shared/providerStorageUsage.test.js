import assert from 'node:assert/strict';
import test from 'node:test';
import { parseR2ListObjectsPage, readR2BucketUsage } from './providerStorageUsage.js';

const xml = ({ sizes = [], truncated = false, token = '' } = {}) => `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${sizes.map((size, index) => `<Contents><Key>file-${index}</Key><Size>${size}</Size></Contents>`).join('')}<IsTruncated>${truncated}</IsTruncated>${token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ''}</ListBucketResult>`;

test('R2 list parsing sums authoritative object sizes', () => {
  assert.deepEqual(parseR2ListObjectsPage(xml({ sizes: [100, 250] })), { bytes: 350, objects: 2, truncated: false, continuationToken: '' });
});

test('R2 list parsing decodes safe continuation tokens', () => {
  const page = parseR2ListObjectsPage(xml({ sizes: [10], truncated: true, token: 'next&amp;page' }));
  assert.equal(page.continuationToken, 'next&page');
});

test('R2 bucket usage follows every page and never substitutes ledger totals', async () => {
  const responses = [xml({ sizes: [100, 200], truncated: true, token: 'page-2' }), xml({ sizes: [300] })];
  const calls = [];
  const result = await readR2BucketUsage(async (url) => {
    calls.push(url);
    return new Response(responses.shift(), { status: 200, headers: { 'content-type': 'application/xml' } });
  }, { configured: true, accountId: 'account', accessKeyId: 'access-key-123', secretAccessKey: 'secret-key-that-is-long-enough', bucketName: 'media-bucket' });
  assert.equal(result.totalBytes, 600);
  assert.equal(result.objectCount, 3);
  assert.equal(result.pages, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /continuation-token=page-2/);
});

test('R2 usage fails closed when a truncated page has no continuation token', () => {
  assert.throws(() => parseR2ListObjectsPage(xml({ sizes: [100], truncated: true })), { code: 'R2_USAGE_TOKEN_MISSING' });
});

test('R2 usage rejects a successful HTML response instead of reporting zero bytes', async () => {
  await assert.rejects(() => readR2BucketUsage(async () => new Response('<html>upstream error</html>', { status: 200, headers: { 'content-type': 'text/html' } }), {
    configured: true, accountId: 'account', accessKeyId: 'access-key-123', secretAccessKey: 'secret-key-that-is-long-enough', bucketName: 'media-bucket',
  }), { code: 'R2_USAGE_NON_XML_RESPONSE' });
});

test('R2 usage refuses incomplete measurements instead of displaying a partial total', async () => {
  await assert.rejects(() => readR2BucketUsage(async () => new Response(xml({ sizes: [100], truncated: true, token: 'more' }), { status: 200, headers: { 'content-type': 'application/xml' } }), {
    configured: true, accountId: 'account', accessKeyId: 'access-key-123', secretAccessKey: 'secret-key-that-is-long-enough', bucketName: 'media-bucket',
  }, { maxPages: 1 }), { code: 'R2_USAGE_INCOMPLETE' });
});
