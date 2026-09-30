/**
 * Set on a room by the server when it closes the room for inactivity.
 * The room is deleted shortly after, so players must leave and be told why.
 */
export const ROOM_CLOSED_REASON_KEY = 'closedReason';

// Toast shown on the home page after a room was closed for inactivity
export const ROOM_CLOSED_ALERT = {
    title: 'RoomClosed.title',
    subtitle: 'RoomClosed.inactivity',
    color: 'orange darken-3',
    icon: 'mdi-timer-off-outline',
    timeout: 10000,
};

/**
 * @param {object} snapshot firebase snapshot of a room
 * @returns {boolean} true when the server is closing this room
 */
export function isRoomClosing(snapshot) {
    return !!snapshot && snapshot.child(ROOM_CLOSED_REASON_KEY).exists();
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
        if (players === 0 || room[ROOM_CLOSED_REASON_KEY]) return;
        rooms.push({
            name: child.key,
            players,
            started: !!room.started,
            createdAt: room.createdAt || 0,
        });
    });
    return rooms.sort((a, b) => b.createdAt - a.createdAt);
}
