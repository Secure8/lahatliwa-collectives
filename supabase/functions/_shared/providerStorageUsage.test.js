import assert from 'node:assert/strict';
import test from 'node:test';
import { parseR2ListObjectsPage, readR2BucketUsage } from './providerStorageUsage.js';

const config = {
  configured: true,
  accountId: 'account',
  accessKeyId: 'access-key-123',
  secretAccessKey: 'secret-key-that-is-long-enough',
  bucketName: 'lahat-media',
};

const xml = ({ sizes = [], truncated = false, token = '', includeKeyCount = true } = {}) => `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${includeKeyCount ? `<KeyCount>${sizes.length}</KeyCount>` : ''}${sizes.map((size, index) => `<Contents><Key>file-${index}</Key><Size>${size}</Size></Contents>`).join('')}<IsTruncated>${truncated}</IsTruncated>${token ? `<NextContinuationToken>${token}</NextContinuationToken>` : ''}</ListBucketResult>`;
const response = (body) => new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });

test('R2 one-page reading returns the exact configured bucket, bytes, objects, and completion diagnostics', async () => {
  const result = await readR2BucketUsage(async () => response(xml({ sizes: [100, 250] })), config);
  assert.equal(result.bucket, 'lahat-media');
  assert.equal(result.totalBytes, 350);
  assert.equal(result.objectCount, 2);
  assert.equal(result.pagesScanned, 1);
  assert.equal(result.complete, true);
  assert.equal(result.available, true);
  assert.equal(result.source, 'r2_list_objects_v2');
  assert.ok(Date.parse(result.checkedAt));
});

test('R2 pagination follows every page and sums all objects', async () => {
  const responses = [xml({ sizes: [100, 200], truncated: true, token: 'page-2' }), xml({ sizes: [300] })];
  const calls = [];
  const result = await readR2BucketUsage(async (url) => {
    calls.push(url);
    return response(responses.shift());
  }, config);
  assert.equal(result.totalBytes, 600);
  assert.equal(result.objectCount, 3);
  assert.equal(result.pagesScanned, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /continuation-token=page-2/);
});

test('R2 accepts a complete page containing fewer than 1,000 objects', async () => {
  const result = await readR2BucketUsage(async () => response(xml({ sizes: [1, 2, 3] })), config);
  assert.deepEqual({ bytes: result.totalBytes, objects: result.objectCount, pages: result.pagesScanned }, { bytes: 6, objects: 3, pages: 1 });
});

test('R2 empty bucket is a complete zero reading', async () => {
  const result = await readR2BucketUsage(async () => response(xml()), config);
  assert.equal(result.totalBytes, 0);
  assert.equal(result.objectCount, 0);
  assert.equal(result.complete, true);
});

test('R2 list parsing decodes continuation tokens safely', () => {
  const page = parseR2ListObjectsPage(xml({ sizes: [10], truncated: true, token: 'next&amp;page' }));
  assert.equal(page.continuationToken, 'next&page');
});

test('R2 fails closed when a truncated page omits its continuation token', () => {
  assert.throws(() => parseR2ListObjectsPage(xml({ sizes: [100], truncated: true })), { code: 'R2_USAGE_TOKEN_MISSING' });
});

test('R2 fails closed on a repeated continuation token without returning a partial total', async () => {
  await assert.rejects(
    () => readR2BucketUsage(async () => response(xml({ sizes: [100], truncated: true, token: 'same-token' })), config),
    (error) => error.code === 'R2_USAGE_TOKEN_REPEATED' && error.complete === false && error.pagesScanned === 2 && !('totalBytes' in error),
  );
});

test('R2 rejects missing, nonnumeric, negative, and unsafe object sizes', () => {
  for (const size of ['', 'invalid', '-1', '9007199254740992']) {
    assert.throws(() => parseR2ListObjectsPage(xml({ sizes: [size] })), { code: 'R2_USAGE_SIZE_INVALID' });
  }
});

test('R2 rejects partial or malformed XML responses', () => {
  assert.throws(() => parseR2ListObjectsPage('<ListBucketResult><Contents><Size>10</Size></Contents>'), { code: 'R2_USAGE_RESPONSE_INVALID' });
  assert.throws(() => parseR2ListObjectsPage('<ListBucketResult><Contents><Size>10</Size><IsTruncated>false</IsTruncated></ListBucketResult>'), { code: 'R2_USAGE_RESPONSE_INCOMPLETE' });
});

test('R2 rejects a successful non-XML provider response', async () => {
  await assert.rejects(() => readR2BucketUsage(async () => new Response('<html>upstream error</html>', { status: 200, headers: { 'content-type': 'text/html' } }), config), { code: 'R2_USAGE_NON_XML_RESPONSE' });
});

test('R2 bounded scans expose safe incomplete diagnostics and no secrets', async () => {
  await assert.rejects(
    () => readR2BucketUsage(async () => response(xml({ sizes: [100], truncated: true, token: 'more' })), config, { maxPages: 1 }),
    (error) => {
      assert.equal(error.code, 'R2_USAGE_INCOMPLETE');
      assert.equal(error.complete, false);
      assert.equal(error.bucket, 'lahat-media');
      assert.equal(error.pagesScanned, 1);
      const diagnostic = JSON.stringify(error, Object.getOwnPropertyNames(error));
      assert.doesNotMatch(diagnostic, /secret-key|access-key|authorization/i);
      return true;
    },
  );
});
