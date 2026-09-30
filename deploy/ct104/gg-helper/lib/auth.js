'use strict';

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;

/** Hash a password for the config file: scrypt$<salt>$<hash> (base64) */
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;
    const [scheme, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
}

function sign(secret, value) {
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

/** Session token "<expiry ms>.<hmac>", valid until expiry, no server-side state */
function createSession(secret, maxAgeMs, now = Date.now()) {
    const expires = String(now + maxAgeMs);
    return `${expires}.${sign(secret, expires)}`;
}

function verifySession(secret, token, now = Date.now()) {
    if (typeof token !== 'string') return false;
    const [expires, mac] = token.split('.');
    if (!expires || !mac || !/^\d+$/.test(expires)) return false;
    if (Number(expires) <= now) return false;
    const expected = Buffer.from(sign(secret, expires));
    const actual = Buffer.from(mac);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function parseCookies(header) {
    const cookies = {};
    for (const part of (header || '').split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const name = part.slice(0, index).trim();
        if (name) cookies[name] = part.slice(index + 1).trim();
    }
    return cookies;
}

/**
 * Per-client lockout for wrong passwords.
 * The first `freeAttempts` wrong passwords are free. Every wrong password after that
 * locks the client for the next duration in `lockDurationsMs`, repeating the last one.
 * With the defaults: 3 tries, then 3 min, 3 min, then 10 min for every further miss.
 */
class LoginLimiter {
    constructor({
        freeAttempts = 3,
        lockDurationsMs = [3 * 60e3, 3 * 60e3, 10 * 60e3],
        forgetAfterMs = 24 * 60 * 60e3,
        now = Date.now,
    } = {}) {
        this.freeAttempts = freeAttempts;
        this.lockDurationsMs = lockDurationsMs;
        this.forgetAfterMs = forgetAfterMs;
        this.now = now;
        this.clients = new Map();
    }

    _entry(client) {
        const entry = this.clients.get(client);
        if (!entry) return null;
        const now = this.now();
        if (entry.lockedUntil <= now && now - entry.lastFailure >= this.forgetAfterMs) {
            this.clients.delete(client);
            return null;
        }
        return entry;
    }

    /** @returns {{locked: boolean, retryAfter: number, attemptsLeft: number}} */
    status(client) {
        const entry = this._entry(client);
        if (!entry) return { locked: false, retryAfter: 0, attemptsLeft: this.freeAttempts };
        const remaining = entry.lockedUntil - this.now();
        if (remaining > 0) {
            return { locked: true, retryAfter: Math.ceil(remaining / 1000), attemptsLeft: 0 };
        }
        return {
            locked: false,
            retryAfter: 0,
            attemptsLeft: Math.max(this.freeAttempts - entry.failures, 1),
        };
    }

    fail(client) {
        const now = this.now();
        const entry = this._entry(client) || { failures: 0, locks: 0, lockedUntil: 0, lastFailure: 0 };
        entry.failures += 1;
        entry.lastFailure = now;
        if (entry.failures >= this.freeAttempts) {
            const index = Math.min(entry.locks, this.lockDurationsMs.length - 1);
            entry.lockedUntil = now + this.lockDurationsMs[index];
            entry.locks += 1;
        }
        this.clients.set(client, entry);
        return this.status(client);
    }

    succeed(client) {
        this.clients.delete(client);
    }

    /** Drop clients that have not failed for a long time */
    prune() {
        for (const client of [...this.clients.keys()]) this._entry(client);
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    createSession,
    verifySession,
    parseCookies,
    LoginLimiter,
};
