const test = require('node:test');
const assert = require('node:assert');
const { freeName } = require('../dist/shared/downloads');

const pick = (name, ...existing) => freeName(name, (candidate) => existing.includes(candidate));

test('a free name is kept', () => {
  assert.strictEqual(pick('report.pdf'), 'report.pdf');
});

test('a taken name gets the next free number before the extension', () => {
  assert.strictEqual(pick('report.pdf', 'report.pdf'), 'report (1).pdf');
  assert.strictEqual(pick('report.pdf', 'report.pdf', 'report (1).pdf'), 'report (2).pdf');
  assert.strictEqual(pick('src.tar.gz', 'src.tar.gz'), 'src (1).tar.gz');
});

test('names without an extension get the number at the end', () => {
  assert.strictEqual(pick('LICENSE', 'LICENSE'), 'LICENSE (1)');
  assert.strictEqual(pick('.env', '.env'), '.env (1)');
});
