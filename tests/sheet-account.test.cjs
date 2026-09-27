const { test } = require('node:test');
const assert = require('node:assert/strict');

test('new Sheet grants require the signed-in verified Google address', async () => {
  const { requiresAccountMatch, matchesVerifiedGoogleEmail } = await import('../supabase/functions/_shared/googleAccount.mjs');
  assert.equal(requiresAccountMatch(true, undefined, ''), true);
  assert.equal(requiresAccountMatch(false, undefined, 'new-sheet'), true);
  assert.equal(matchesVerifiedGoogleEmail({ email: ' Person@Gmail.com ', email_verified: true }, 'person@gmail.com'), true);
  assert.equal(matchesVerifiedGoogleEmail({ email: 'other@gmail.com', email_verified: true }, 'person@gmail.com'), false);
  assert.equal(matchesVerifiedGoogleEmail({ email: 'person@gmail.com', email_verified: false }, 'person@gmail.com'), false);
});

test('renewing an existing Sheet grant preserves legacy connections', async () => {
  const { requiresAccountMatch } = await import('../supabase/functions/_shared/googleAccount.mjs');
  assert.equal(requiresAccountMatch(false, 'existing-sheet', 'existing-sheet'), false);
  assert.equal(requiresAccountMatch(false, 'existing-sheet', 'another-sheet'), true);
});
