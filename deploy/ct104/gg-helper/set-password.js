#!/usr/bin/env node
'use strict';

// Set the GeoGuess password. Also rotates the session secret, which logs everyone out.
// Usage: node set-password.js            (asks for the password, input hidden)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { hashPassword } = require('./lib/auth');

const CONFIG_PATH = process.env.GG_HELPER_CONFIG || '/etc/gg-helper/config.json';

function askHidden(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl.stdoutMuted = false;
        rl._writeToOutput = function (text) {
            if (!rl.stdoutMuted || text.includes('\n')) rl.output.write(text);
        };
        rl.question(question, (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
        rl.stdoutMuted = true;
    });
}

async function main() {
    const password = await askHidden('New GeoGuess password: ');
    const again = await askHidden('Repeat it: ');
    if (!password || password !== again) {
        console.error('Passwords are empty or do not match. Nothing changed.');
        process.exit(1);
    }

    let config = {};
    if (fs.existsSync(CONFIG_PATH)) {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    config.passwordHash = hashPassword(password);
    config.sessionSecret = crypto.randomBytes(32).toString('hex');

    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o640 });
    console.log(`Saved to ${CONFIG_PATH}. Restart the helper: systemctl restart gg-helper`);
}

main();
