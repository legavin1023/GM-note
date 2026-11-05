const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/player-login/index.ts'), 'utf8')
  .replace(/^import .*;\n/, '')
  .split('async function createPlayerSession')[0]
  .replace('body: unknown', 'body').replace('req: Request', 'req');

for (const [result, error, expected] of [
  ['valid', null, 200], ['invalid', null, 401], ['blocked', null, 429],
  [null, { code: 'database_unavailable' }, 500], [null, null, 401],
]) {
  test('PIN verification result ' + result + ' / ' + expected, async () => {
    let handler; let sessions = 0; const calls = [];
    const admin = {
      from: () => ({ select: () => ({ eq: () => ({ not: async () => ({data: [{is_active: true}], error: null}) }) }) }),
      rpc: async (name, args) => { calls.push({name, args}); return {data: result, error}; },
    };
    vm.runInNewContext(source, {
      Deno: { serve: fn => {handler = fn;}, env: {get: () => 'configured'} },
      createClient: () => admin, Response, console: {error: () => {}},
      createPlayerSession: async () => {sessions++; return Response.json({token_hash: 'session'});},
    });
    const response = await handler(new Request('https://example.test', {
      method: 'POST', body: JSON.stringify({username: ' player ', pin: '1234'}),
    }));
    assert.equal(response.status, expected);
    assert.equal(sessions, result === 'valid' && !error ? 1 : 0);
    assert.deepEqual(calls.map(c => c.name), ['verify_player_pin_limited']);
    assert.equal(calls[0].args.p_username, 'player');
  });
}
