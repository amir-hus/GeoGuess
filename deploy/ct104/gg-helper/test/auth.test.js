'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
    hashPassword,
    verifyPassword,
    createSession,
    verifySession,
    parseCookies,
    LoginLimiter,
} = require('../lib/auth');

test('password hash verifies only the right password', () => {
    const stored = hashPassword('blue-tiger-42');
    assert.ok(stored.startsWith('scrypt$'));
    assert.strictEqual(verifyPassword('blue-tiger-42', stored), true);
    assert.strictEqual(verifyPassword('blue-tiger-43', stored), false);
    assert.strictEqual(verifyPassword(undefined, stored), false);
    assert.strictEqual(verifyPassword('x', 'garbage'), false);
});

test('session is valid until it expires and cannot be forged', () => {
    const token = createSession('secret', 1000, 0);
    assert.strictEqual(verifySession('secret', token, 500), true);
    assert.strictEqual(verifySession('secret', token, 1000), false);
    assert.strictEqual(verifySession('other-secret', token, 500), false);
    const [, mac] = token.split('.');
    assert.strictEqual(verifySession('secret', `999999.${mac}`, 500), false);
    assert.strictEqual(verifySession('secret', undefined, 0), false);
});

test('parseCookies reads a Cookie header', () => {
    assert.deepStrictEqual(parseCookies('a=1; gg_session=x.y; b'), { a: '1', gg_session: 'x.y' });
    assert.deepStrictEqual(parseCookies(undefined), {});
});

test('limiter: 3 tries, then 3 min, 3 min, then 10 min per miss', () => {
    let now = 0;
    const limiter = new LoginLimiter({ now: () => now });
    const MIN = 60e3;

    assert.deepStrictEqual(limiter.fail('ip'), { locked: false, retryAfter: 0, attemptsLeft: 2 });
    assert.deepStrictEqual(limiter.fail('ip'), { locked: false, retryAfter: 0, attemptsLeft: 1 });
    assert.deepStrictEqual(limiter.fail('ip'), { locked: true, retryAfter: 180, attemptsLeft: 0 });

    now += 3 * MIN;
    assert.strictEqual(limiter.status('ip').locked, false);
    assert.strictEqual(limiter.fail('ip').retryAfter, 180);

    now += 3 * MIN;
    assert.strictEqual(limiter.fail('ip').retryAfter, 600);

    now += 10 * MIN;
    assert.strictEqual(limiter.fail('ip').retryAfter, 600);

    // Other visitors are not affected
    assert.strictEqual(limiter.status('other').locked, false);
});

test('limiter: a correct password or a quiet day resets the count', () => {
    let now = 0;
    const limiter = new LoginLimiter({ now: () => now });
    limiter.fail('ip');
    limiter.fail('ip');
    limiter.succeed('ip');
    assert.strictEqual(limiter.status('ip').attemptsLeft, 3);

    limiter.fail('ip');
    limiter.fail('ip');
    limiter.fail('ip');
    now += 24 * 60 * 60e3;
    assert.deepStrictEqual(limiter.status('ip'), { locked: false, retryAfter: 0, attemptsLeft: 3 });
    limiter.prune();
    assert.strictEqual(limiter.clients.size, 0);
});
