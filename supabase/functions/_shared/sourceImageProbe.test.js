import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOURCE_IMAGE_PROBE_LIMITS,
  inspectSourceImageProbe,
  readBoundedResponsePrefix,
} from './sourceImageProbe.js';

const webp = new Uint8Array([82,73,70,70,24,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,0,0,0]);
const jpeg = new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1,0,1,0,0,255,219,0,67,0,1,1,1,1,1,1,1]);

function responseFromChunks(chunks, { status = 206, contentType = 'image/webp', total = 4096, contentLength, onCancel, onPull } = {}) {
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      onPull?.(index);
      if (index >= chunks.length) { controller.close(); return; }
      controller.enqueue(chunks[index++]);
    },
    cancel() { onCancel?.(); },
  });
  const headers = { 'content-type': contentType };
  if (status === 206) headers['content-range'] = `bytes 0-31/${total}`;
  if (contentLength !== undefined) headers['content-length'] = String(contentLength);
  return new Response(body, { status, headers });
}

function split(bytes, sizes) {
  const chunks = []; let offset = 0;
  for (const size of sizes) { chunks.push(bytes.slice(offset, offset + size)); offset += size; }
  if (offset < bytes.length) chunks.push(bytes.slice(offset));
  return chunks;
}

test('WebP signature split across short stream chunks is accepted', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks(split(webp, [2, 3, 1, 4, 2]), { contentType: 'image/webp' }));
  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.bytes.length, 32);
});

test('PNG signature split across stream chunks is accepted', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks(split(png, [1, 2, 2, 3, 4]), { contentType: 'image/png' }));
  assert.equal(result.mimeType, 'image/png');
});

test('JPEG signature split across stream chunks is accepted', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks(split(jpeg, [1, 1, 1, 2, 3]), { contentType: 'image/jpeg' }));
  assert.equal(result.mimeType, 'image/jpeg');
});

test('a first chunk shorter than twelve bytes does not cause a false mismatch', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks(split(webp, [4, 4, 3, 1, 2]), { contentType: 'image/webp' }));
  assert.equal(result.diagnostics.headerBytesRead, 32);
});

test('206 Partial Content uses the total from Content-Range', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks([webp], { status: 206, total: 98765, contentLength: 32 }));
  assert.equal(result.sizeBytes, 98765);
  assert.equal(result.diagnostics.sizeSource, 'content-range');
});

test('200 OK is accepted when Range is ignored and Content-Length is trustworthy', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks([webp], { status: 200, total: 0, contentLength: 98765 }));
  assert.equal(result.sizeBytes, 98765);
  assert.equal(result.diagnostics.sizeSource, 'content-length');
});

test('partial response without a trustworthy total size fails closed', async () => {
  const response = responseFromChunks([webp], { status: 206, total: 100 });
  response.headers.delete('content-range');
  await assert.rejects(() => inspectSourceImageProbe(response), { code: 'SOURCE_PROBE_SIZE_UNKNOWN' });
});

test('JSON error response with status 200 is classified as non-image', async () => {
  const body = new TextEncoder().encode('{"error":"expired"}');
  await assert.rejects(() => inspectSourceImageProbe(responseFromChunks([body], { status: 200, contentType: 'application/json', contentLength: body.length })), { code: 'SOURCE_PROBE_NON_IMAGE_RESPONSE' });
});

test('HTML error response is classified as non-image', async () => {
  const body = new TextEncoder().encode('<!doctype html><title>Error</title>');
  await assert.rejects(() => inspectSourceImageProbe(responseFromChunks([body], { status: 200, contentType: 'text/html', contentLength: body.length })), { code: 'SOURCE_PROBE_NON_IMAGE_RESPONSE' });
});

test('a JSON body mislabeled as an image is still detected before signature validation', async () => {
  const body = new TextEncoder().encode('{"message":"not an image response"}');
  await assert.rejects(() => inspectSourceImageProbe(responseFromChunks([body], { status: 200, contentType: 'image/webp', contentLength: body.length })), { code: 'SOURCE_PROBE_NON_IMAGE_RESPONSE' });
});

test('too-short image response has a dedicated error', async () => {
  const body = webp.slice(0, 8);
  await assert.rejects(() => inspectSourceImageProbe(responseFromChunks([body], { status: 200, contentType: 'image/webp', contentLength: body.length })), { code: 'SOURCE_PROBE_TOO_SHORT' });
});

test('a real signature mismatch has a dedicated error', async () => {
  await assert.rejects(() => inspectSourceImageProbe(responseFromChunks([new Uint8Array(32)], { contentType: 'image/webp' })), { code: 'SOURCE_SIGNATURE_MISMATCH' });
});

test('reader is cancelled as soon as enough header bytes are collected', async () => {
  let cancelCalls = 0;
  const result = await readBoundedResponsePrefix(responseFromChunks([webp, new Uint8Array(32)], { onCancel: () => { cancelCalls += 1; } }));
  assert.equal(result.bytes.length, SOURCE_IMAGE_PROBE_LIMITS.targetHeaderBytes);
  assert.equal(result.cancelled, true);
  assert.equal(cancelCalls, 1);
});

test('probe never buffers the full response when many chunks remain', async () => {
  let pulls = 0; let cancelled = 0;
  const chunks = Array.from({ length: 1000 }, () => new Uint8Array([1,2,3,4]));
  const result = await readBoundedResponsePrefix(responseFromChunks(chunks, { onPull: () => { pulls += 1; }, onCancel: () => { cancelled += 1; } }));
  assert.equal(result.bytes.length, 32);
  assert.ok(pulls < 20);
  assert.equal(cancelled, 1);
});

test('safe diagnostics contain no signed URL, token, authorization, or object path', async () => {
  const result = await inspectSourceImageProbe(responseFromChunks([webp], { total: 500 }));
  const diagnostics = JSON.stringify(result.diagnostics).toLowerCase();
  for (const secretField of ['url', 'token', 'authorization', 'path']) assert.equal(diagnostics.includes(secretField), false);
  assert.deepEqual(Object.keys(result.diagnostics).sort(), ['contentType','headerBytesRead','httpStatus','readerCancelled','sizeSource'].sort());
});
