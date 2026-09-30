#!/usr/bin/env node
'use strict';

// GeoGuess helper for CT 104: password login with lockouts, and the multiplayer room janitor.
// Only listens on 127.0.0.1; nginx proxies /__login and asks /auth before serving the game.

const fs = require('fs');
const http = require('http');
const {
    createSession,
    verifyPassword,
    verifySession,
    parseCookies,
    LoginLimiter,
} = require('./lib/auth');
const { RoomJanitor } = require('./lib/janitor');

const CONFIG_PATH = process.env.GG_HELPER_CONFIG || '/etc/gg-helper/config.json';
const SESSION_COOKIE = 'gg_session';

function loadConfig(path = CONFIG_PATH) {
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (!config.passwordHash || !config.sessionSecret) {
        throw new Error(`${path} needs passwordHash and sessionSecret (run set-password.js)`);
    }
    return {
        port: 9100,
        sessionDays: 30,
        freeAttempts: 3,
        lockMinutes: [3, 3, 10],
        roomIdleMinutes: 5,
        roomAbandonedSeconds: 60,
        sweepSeconds: 30,
        databaseUrl: 'http://127.0.0.1:9000',
        databaseNamespace: 'geoguess',
        ...config,
    };
}

function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...headers,
    });
    res.end(payload);
}

function readBody(req, limit = 1024) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            if (data.length > limit) {
                reject(new Error('body too large'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

function createServer(config, { limiter, now = Date.now } = {}) {
    const loginLimiter =
        limiter ||
        new LoginLimiter({
            freeAttempts: config.freeAttempts,
            lockDurationsMs: config.lockMinutes.map((m) => m * 60e3),
            now,
        });
    const maxAgeMs = config.sessionDays * 24 * 60 * 60e3;

    // nginx passes the visitor's real address (CF-Connecting-IP, or the LAN address)
    const clientOf = (req) => req.headers['x-client-ip'] || req.socket.remoteAddress;

    const server = http.createServer(async (req, res) => {
        const url = req.url.split('?')[0];
        try {
            if (req.method === 'GET' && url === '/auth') {
                const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
                return send(res, verifySession(config.sessionSecret, token, now()) ? 204 : 401);
            }

            if (req.method === 'GET' && url === '/status') {
                return send(res, 200, loginLimiter.status(clientOf(req)));
            }

            if (req.method === 'POST' && url === '/login') {
                const client = clientOf(req);
                const status = loginLimiter.status(client);
                if (status.locked) return send(res, 429, status);

                let password;
                try {
                    password = JSON.parse(await readBody(req)).password;
                } catch (e) {
                    return send(res, 400, { error: 'bad request' });
                }

                if (verifyPassword(password, config.passwordHash)) {
                    loginLimiter.succeed(client);
                    const token = createSession(config.sessionSecret, maxAgeMs, now());
                    return send(res, 200, { ok: true }, {
                        'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=Lax`,
                    });
                }

                const failed = loginLimiter.fail(client);
                console.log(`wrong password from ${client}${failed.locked ? `, locked ${failed.retryAfter}s` : ''}`);
                return send(res, failed.locked ? 429 : 401, { ok: false, ...failed });
            }

            send(res, 404, { error: 'not found' });
        } catch (err) {
            console.error(err);
            if (!res.headersSent) send(res, 500, { error: 'server error' });
        }
    });

    const pruneTimer = setInterval(() => loginLimiter.prune(), 60 * 60e3);
    pruneTimer.unref();
    server.on('close', () => clearInterval(pruneTimer));
    return server;
}

function startJanitor(config) {
    const janitor = new RoomJanitor({
        databaseUrl: config.databaseUrl,
        namespace: config.databaseNamespace,
        idleMs: config.roomIdleMinutes * 60e3,
        abandonedMs: config.roomAbandonedSeconds * 1000,
    });
    // Log a failing database once, not on every sweep
    let lastError = null;
    const run = () =>
        janitor
            .sweep()
            .then(() => {
                if (lastError) console.log('room janitor: database reachable again');
                lastError = null;
            })
            .catch((err) => {
                if (err.message !== lastError) console.error(`room janitor: ${err.message}`);
                lastError = err.message;
            });
    run();
    return setInterval(run, config.sweepSeconds * 1000);
}

if (require.main === module) {
    const config = loadConfig();
    createServer(config).listen(config.port, '127.0.0.1', () => {
        console.log(`gg-helper listening on 127.0.0.1:${config.port}`);
    });
    startJanitor(config);
}

module.exports = { createServer, loadConfig, startJanitor };
