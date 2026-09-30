'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { RoomJanitor } = require('../lib/janitor');

const MIN = 60e3;

// Minimal in-memory stand-in for the emulator's REST API
function fakeDatabase(initial) {
    const db = JSON.parse(JSON.stringify(initial));
    const fetch = async (url, options = {}) => {
        const { pathname, searchParams } = new URL(url);
        const parts = pathname.replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
        const parentOf = () => {
            let node = db;
            parts.slice(0, -1).forEach((p) => (node = node && node[p]));
            return node;
        };
        const key = parts[parts.length - 1];
        if (options.method === 'DELETE') {
            const parent = parentOf();
            if (parent) delete parent[key];
            return { ok: true, json: async () => null };
        }
        if (options.method === 'PATCH') {
            Object.assign(parentOf()[key], JSON.parse(options.body));
            return { ok: true, json: async () => null };
        }
        let node = db;
        parts.forEach((p) => (node = node === undefined || node === null ? undefined : node[p]));
        if (node === undefined) node = null;
        if (searchParams.get('shallow') && node) {
            node = Object.fromEntries(Object.keys(node).map((k) => [k, true]));
        }
        return { ok: true, json: async () => node };
    };
    return { db, fetch };
}

const janitorFor = (fetch, clock) =>
    new RoomJanitor({ fetch, now: () => clock.now, log: () => {} });

test('an idle room is first marked closing (players get the notice), then deleted', async () => {
    const clock = { now: 0 };
    const { db, fetch } = fakeDatabase({ quiet: { playerName: { player1: 'A' } } });
    const janitor = janitorFor(fetch, clock);

    await janitor.sweep();
    clock.now = 4 * MIN;
    await janitor.sweep();
    assert.strictEqual(db.quiet.closedReason, undefined);

    clock.now = 5 * MIN;
    assert.deepStrictEqual(await janitor.sweep(), []);
    assert.strictEqual(db.quiet.closedReason, 'inactivity');

    clock.now = 5 * MIN + 5e3;
    assert.deepStrictEqual(await janitor.sweep(), []);
    clock.now = 5 * MIN + 10e3;
    assert.deepStrictEqual(await janitor.sweep(), ['quiet']);
    assert.ok(!('quiet' in db));
});

test('any change in the room counts as activity, even with players only watching', async () => {
    const clock = { now: 0 };
    const { db, fetch } = fakeDatabase({ room: { playerName: { player1: 'A' } } });
    const janitor = janitorFor(fetch, clock);

    await janitor.sweep();
    clock.now = 4 * MIN;
    db.room.guess = { player1: { latitude: 1 } };
    await janitor.sweep();
    clock.now = 8 * MIN;
    await janitor.sweep();
    assert.strictEqual(db.room.closedReason, undefined);
    clock.now = 9 * MIN;
    await janitor.sweep();
    assert.strictEqual(db.room.closedReason, 'inactivity');
});

test('a started game is deleted within a minute once everyone left, without a notice', async () => {
    const clock = { now: 0 };
    const { db, fetch } = fakeDatabase({
        over: { started: true, playerName: { player1: 'A' } },
        playing: { started: true, active: true, playerName: { player1: 'B' } },
    });
    const janitor = janitorFor(fetch, clock);

    await janitor.sweep();
    clock.now = MIN;
    assert.deepStrictEqual(await janitor.sweep(), ['over']);
    assert.ok('playing' in db);
    assert.strictEqual(db.playing.closedReason, undefined);
});

test('internal nodes such as old heartbeats are removed', async () => {
    const { db, fetch } = fakeDatabase({ __heartbeats: { gone: { player1: 0 } }, room: { playerName: {} } });
    await janitorFor(fetch, { now: 0 }).sweep();
    assert.ok(!('__heartbeats' in db));
    assert.ok('room' in db);
});
