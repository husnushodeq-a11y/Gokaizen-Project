const test = require('node:test');
const assert = require('node:assert/strict');

const { hasGoKaizenTagline, extractServerTag } = require('../utils/taglineRoleSync');

test('matches GoKaizen tagline variants', () => {
  assert.equal(hasGoKaizenTagline('GoKaizen'), true);
  assert.equal(hasGoKaizenTagline('gokaizen'), true);
  assert.equal(hasGoKaizenTagline('GKZN'), true);
  assert.equal(hasGoKaizenTagline('Go Kaizen'), true);
  assert.equal(hasGoKaizenTagline('hello • GKZN • he/him'), true);
});

test('matches Discord server tag values', () => {
  const member = { user: { primaryGuild: { tag: 'GKZN' } } };
  assert.equal(extractServerTag(member), 'GKZN');
  assert.equal(hasGoKaizenTagline(extractServerTag(member)), true);
});

test('normalizes whitespace in server tag values', () => {
  const member = { user: { primaryGuild: { tag: '  gkzn  ' } } };
  assert.equal(extractServerTag(member), 'gkzn');
  assert.equal(hasGoKaizenTagline(extractServerTag(member)), true);
});

test('rejects non-GoKaizen taglines', () => {
  assert.equal(hasGoKaizenTagline('hello world'), false);
  assert.equal(hasGoKaizenTagline('He/Him • 1906'), false);
  assert.equal(hasGoKaizenTagline('Suka main game'), false);
});
