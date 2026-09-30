# CT 104 deployment helpers

Files for the self-hosted GeoGuess on Proxmox CT 104 (nginx + local Firebase emulator behind a Cloudflare Tunnel).

| File | Installed to | Purpose |
|---|---|---|
| `gg-helper/` | runs from here | Node service on `127.0.0.1:9100`: password login with lockouts, and the multiplayer room janitor. No npm dependencies. |
| `gg-helper.service` | `/etc/systemd/system/` | Runs the helper as the `gg-helper` user. |
| `nginx-geoguess.conf` | `/etc/nginx/sites-available/geoguess` | Every request needs a valid `gg_session` cookie (nginx `auth_request` → helper). |
| `login.html` | `/var/www/gg-login/` | Password page with lockout countdown. |
| `install.sh` | — | Installs or updates all of the above. Safe to re-run. |

## Install or update

```bash
bash /opt/geoguess/deploy/ct104/install.sh
```

First run asks for the password. It is stored as an scrypt hash in `/etc/gg-helper/config.json`.

## Change the password (logs everyone out)

```bash
GG_HELPER_CONFIG=/etc/gg-helper/config.json node /opt/geoguess/deploy/ct104/gg-helper/set-password.js
systemctl restart gg-helper
```

## Login lockout

Per visitor IP (`CF-Connecting-IP` through the tunnel): 3 wrong passwords, then a 3-minute lock, another 3-minute lock after the next miss, then 10 minutes for every further miss. A correct password, or 24 hours without a miss, resets it. Lockouts are kept in memory, so restarting the helper clears them. Tune with `freeAttempts` and `lockMinutes` in the config file.

## Room janitor

Every 30 s the helper checks the rooms in the emulator and deletes a room when:

- nothing changed and no player heartbeat arrived for 5 minutes (`roomIdleMinutes`), or
- its game started and every player has left for 60 s (`roomAbandonedSeconds`).

Players' browsers write a heartbeat to `__heartbeats/<room>/<player>` every minute while they are in a room or game.

## Tests

```bash
node --test /opt/geoguess/deploy/ct104/gg-helper/test/*.test.js
```
