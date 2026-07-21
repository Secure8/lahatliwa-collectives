import assert from 'node:assert/strict';
import test from 'node:test';
import { branchProjectsUrl, normalizeBranchQuery, projectBranchKey, projectsForBranch } from './projectBranches.js';

test('current project categories map to the four branches', () => {
  assert.equal(projectBranchKey('Liwa Studio'), 'studio');
  assert.equal(projectBranchKey('Liwa Digital'), 'digital');
  assert.equal(projectBranchKey('Liwa Tech'), 'tech');
  assert.equal(projectBranchKey('Liwa Explore'), 'tech');
  assert.equal(projectBranchKey('Liwa Social'), 'social');
});

test('confirmed legacy service categories map without title inference', () => {
  assert.equal(projectBranchKey('Photography'), 'studio');
  assert.equal(projectBranchKey('Website Development'), 'digital');
  assert.equal(projectBranchKey('IT Support'), 'tech');
  assert.equal(projectBranchKey('Social Media Management'), 'social');
  assert.equal(projectBranchKey('A title that says photography'), null);
});

test('invalid query values fall back safely and links are stable', () => {
  assert.equal(normalizeBranchQuery('unknown'), null);
  assert.equal(branchProjectsUrl('studio'), '/projects?branch=studio');
  assert.equal(branchProjectsUrl('bad'), '/projects');
});

test('branch filtering returns only matching projects and supports empty branches', () => {
  const projects = [{ id: '1', category: 'Liwa Studio' }, { id: '2', category: 'Liwa Tech' }];
  assert.deepEqual(projectsForBranch(projects, 'tech').map(({ id }) => id), ['2']);
  assert.deepEqual(projectsForBranch(projects, 'social'), []);
});
