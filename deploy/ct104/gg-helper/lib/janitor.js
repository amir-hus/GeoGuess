'use strict';

const crypto = require('crypto');

const HEARTBEAT_ROOT = '__heartbeats';

/**
 * Closes multiplayer rooms in the local Firebase Realtime Database emulator.
 * A room is deleted when:
 *  - nothing happened in it (no change, no heartbeat) for `idleMs`, or
 *  - its game started and every player left (`active` gone) for `abandonedMs`.
 * Upstream GeoGuess relies on a Google Cloud Function for this, which the emulator does not have.
 */
class RoomJanitor {
    constructor({
        databaseUrl = 'http://127.0.0.1:9000',
        namespace = 'geoguess',
        idleMs = 5 * 60e3,
        abandonedMs = 60e3,
        fetch = globalThis.fetch,
        now = Date.now,
        log = console.log,
    } = {}) {
        this.databaseUrl = databaseUrl.replace(/\/$/, '');
        this.namespace = namespace;
        this.idleMs = idleMs;
        this.abandonedMs = abandonedMs;
        this.fetch = fetch;
        this.now = now;
        this.log = log;
        this.seen = new Map();
    }

    _url(path, query = '') {
        const encoded = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
        return `${this.databaseUrl}/${encoded}.json?ns=${this.namespace}${query}`;
    }

    async _get(path, query) {
        const res = await this.fetch(this._url(path, query));
        if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
        return res.json();
    }

    async _delete(path) {
        const res = await this.fetch(this._url(path), { method: 'DELETE' });
        if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
    }

    async sweep() {
        const now = this.now();
        const root = (await this._get('', '&shallow=true')) || {};
        const heartbeats = (await this._get(HEARTBEAT_ROOT)) || {};
        const closed = [];

        for (const name of Object.keys(root)) {
            if (name.startsWith('__')) continue;
            const room = await this._get(name);
            if (room === null) {
                this.seen.delete(name);
                continue;
            }

            const hash = crypto.createHash('sha1').update(JSON.stringify(room)).digest('hex');
            let seen = this.seen.get(name);
            if (!seen || seen.hash !== hash) {
                seen = { hash, changedAt: now };
                this.seen.set(name, seen);
            }

            const beats = Object.values(heartbeats[name] || {}).filter(Number.isFinite);
            const lastActivity = Math.max(seen.changedAt, ...beats);
            const abandoned = !!room.started && !room.active && now - seen.changedAt >= this.abandonedMs;
            const idle = now - lastActivity >= this.idleMs;

            if (abandoned || idle) {
                await this._delete(name);
                await this._delete(`${HEARTBEAT_ROOT}/${name}`);
                this.seen.delete(name);
                closed.push(name);
                this.log(`closed room "${name}" (${abandoned ? 'game over, everyone left' : 'no activity'})`);
            }
        }

        // Heartbeats of rooms that no longer exist
        for (const name of Object.keys(heartbeats)) {
            if (!(name in root)) await this._delete(`${HEARTBEAT_ROOT}/${name}`);
        }
        for (const name of [...this.seen.keys()]) {
            if (!(name in root)) this.seen.delete(name);
        }
        return closed;
    }
}

module.exports = { RoomJanitor, HEARTBEAT_ROOT };
