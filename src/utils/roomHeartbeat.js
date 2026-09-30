import firebase from 'firebase/app';
import 'firebase/database';

// Heartbeats live outside the room nodes so room listeners are not triggered every minute
export const HEARTBEAT_ROOT = '__heartbeats';
export const HEARTBEAT_INTERVAL = 60 * 1000;

/**
 * Tell the server this player is still in the room, once now and then every minute.
 * The room janitor on the server closes rooms nobody has been in for a while.
 * @param {string} roomName
 * @param {number} playerNumber
 * @returns {function} stops the heartbeat
 */
export function startRoomHeartbeat(roomName, playerNumber) {
    if (!roomName || !playerNumber) {
        return () => {};
    }
    const ref = firebase
        .database()
        .ref(`${HEARTBEAT_ROOT}/${roomName}/player${playerNumber}`);
    const beat = () => ref.set(firebase.database.ServerValue.TIMESTAMP);

    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
}

/**
 * Turn the database root into the list of rooms shown when joining a game
 * @param {object} snapshot firebase snapshot of the database root
 * @returns {Array<{name: string, players: number, started: boolean, createdAt: number}>}
 */
export function listRooms(snapshot) {
    const rooms = [];
    snapshot.forEach((child) => {
        if (child.key.startsWith('__')) return;
        const room = child.val() || {};
        const players = room.playerName ? Object.keys(room.playerName).length : 0;
        if (players === 0) return;
        rooms.push({
            name: child.key,
            players,
            started: !!room.started,
            createdAt: room.createdAt || 0,
        });
    });
    return rooms.sort((a, b) => b.createdAt - a.createdAt);
}
