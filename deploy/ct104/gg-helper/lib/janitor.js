'use strict';

const crypto = require('crypto');

// Written to a room before it is deleted, so players can be told why
const CLOSED_REASON = 'inactivity';

const hashOf = (room) => crypto.createHash('sha1').update(JSON.stringify(room)).digest('hex');

/**
 * Closes multiplayer rooms in the local Firebase Realtime Database emulator.
 * Upstream GeoGuess relies on a Google Cloud Function for this, which the emulator does not have.
 *
 * - Idle room: nothing in it changed for `idleMs` (no join, setting, guess or round).
 *   It is first marked with `closedReason` so every player's browser shows a notice and
 *   leaves, then deleted once the notice has been up for `noticeMs`.
 * - Finished or abandoned game: started, and every player left (`active` gone) for
 *   `abandonedMs`. Deleted directly; nobody is there to notify.
 */
class RoomJanitor {
    constructor({
        databaseUrl = 'http://127.0.0.1:9000',
        namespace = 'geoguess',
        idleMs = 5 * 60e3,
        abandonedMs = 60e3,
        noticeMs = 10e3,
        fetch = globalThis.fetch,
        now = Date.now,
        log = console.log,
    } = {}) {
        this.databaseUrl = databaseUrl.replace(/\/$/, '');
        this.namespace = namespace;
        this.idleMs = idleMs;
        this.abandonedMs = abandonedMs;
        this.noticeMs = noticeMs;
        this.fetch = fetch;
        this.now = now;
        this.log = log;
        this.seen = new Map();
    }

    _url(path, query = '') {
        const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
        return `${this.databaseUrl}/${encoded}.json?ns=${this.namespace}${query}`;
    }

    async _request(method, path, { query, body } = {}) {
        const res = await this.fetch(this._url(path, query), {
            method,
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
        return method === 'GET' ? res.json() : null;
    }

    async sweep() {
        const now = this.now();
        const root = (await this._request('GET', '', { query: '&shallow=true' })) || {};
        const closed = [];

        for (const name of Object.keys(root)) {
            if (name.startsWith('__')) {
                // Internal nodes, e.g. heartbeats written by older versions of the game
                await this._request('DELETE', name);
                continue;
            }
            const room = await this._request('GET', name);
            if (room === null) {
                this.seen.delete(name);
                continue;
            }

            const hash = hashOf(room);
            let seen = this.seen.get(name);
            if (!seen || seen.hash !== hash) {
                seen = { hash, changedAt: now };
                this.seen.set(name, seen);
            }
            const quietFor = now - seen.changedAt;

            if (room.closedReason) {
                if (quietFor >= this.noticeMs) {
                    await this._delete(name, closed, 'closed after notice');
                }
            } else if (room.started && !room.active && quietFor >= this.abandonedMs) {
                await this._delete(name, closed, 'game over, everyone left');
            } else if (quietFor >= this.idleMs) {
                await this._request('PATCH', name, { body: { closedReason: CLOSED_REASON } });
                // The notice period starts now, not when the next sweep notices the change
                this.seen.set(name, {
                    hash: hashOf({ ...room, closedReason: CLOSED_REASON }),
                    changedAt: now,
                });
                this.log(`closing room "${name}" (no activity), players notified`);
            }
        }

        for (const name of [...this.seen.keys()]) {
            if (!(name in root)) this.seen.delete(name);
        }
        return closed;
    }

    async _delete(name, closed, why) {
        await this._request('DELETE', name);
        this.seen.delete(name);
        closed.push(name);
        this.log(`deleted room "${name}" (${why})`);
    }
}

module.exports = { RoomJanitor, CLOSED_REASON };
