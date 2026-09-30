'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { RoomJanitor } = require('../lib/janitor');

// Minimal in-memory stand-in for the emulator's REST API
function fakeDatabase(initial) {
    const db = JSON.parse(JSON.stringify(initial));
    const deleted = [];
    const fetch = async (url, options = {}) => {
        const { pathname, searchParams } = new URL(url);
        const parts = pathname.replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
        if (options.method === 'DELETE') {
            deleted.push(parts.join('/'));
            let node = db;
            parts.slice(0, -1).forEach((p) => (node = node && node[p]));
            if (node) delete node[parts[parts.length - 1]];
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
    return { db, deleted, fetch };
}

test('closes rooms with no activity for 5 minutes, keeps rooms with recent heartbeats', async () => {
    let now = 0;
    const { db, fetch } = fakeDatabase({
        quiet: { createdAt: 0, playerName: { player1: 'A' } },
        busy: { createdAt: 0, playerName: { player1: 'B' } },
        __heartbeats: { busy: { player1: 0 } },
    });
    const janitor = new RoomJanitor({ fetch, now: () => now, log: () => {} });

    await janitor.sweep();
    now = 4 * 60e3;
    db.__heartbeats.busy.player1 = now;
    assert.deepStrictEqual(await janitor.sweep(), []);

    now = 5 * 60e3;
    assert.deepStrictEqual(await janitor.sweep(), ['quiet']);
    assert.ok(!('quiet' in db));
    assert.ok('busy' in db);
});

test('a change in the room counts as activity', async () => {
    let now = 0;
    const { db, fetch } = fakeDatabase({ room: { playerName: { player1: 'A' } } });
    const janitor = new RoomJanitor({ fetch, now: () => now, log: () => {} });

    await janitor.sweep();
    now = 4 * 60e3;
    db.room.playerName.player2 = 'B';
    await janitor.sweep();
    now = 8 * 60e3;
    assert.deepStrictEqual(await janitor.sweep(), []);
    now = 9 * 60e3;
    assert.deepStrictEqual(await janitor.sweep(), ['room']);
});

test('closes a started game within a minute once everyone left', async () => {
    let now = 0;
    const { db, fetch } = fakeDatabase({
        over: { started: true, playerName: { player1: 'A' } },
        playing: { started: true, active: true, playerName: { player1: 'B' } },
        __heartbeats: { over: { player1: 0 } },
    });
    const janitor = new RoomJanitor({ fetch, now: () => now, log: () => {} });

    await janitor.sweep();
    now = 60e3;
    assert.deepStrictEqual(await janitor.sweep(), ['over']);
    assert.ok(!('over' in db.__heartbeats));
    assert.ok('playing' in db);
});

test('removes heartbeats of rooms that no longer exist', async () => {
    const { db, fetch } = fakeDatabase({ __heartbeats: { gone: { player1: 0 } } });
    const janitor = new RoomJanitor({ fetch, now: () => 0, log: () => {} });
    await janitor.sweep();
    assert.ok(!('gone' in db.__heartbeats));
});
