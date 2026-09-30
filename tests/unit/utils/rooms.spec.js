import { isRoomClosing, listRooms } from '@/utils/rooms';

const snapshotOf = (data) => ({
    forEach: (cb) =>
        Object.entries(data).forEach(([key, value]) =>
            cb({ key, val: () => value })
        ),
});

describe('utils/rooms', () => {
    it('listRooms: should list rooms with players, newest first, skipping internal and closing rooms', () => {
        const rooms = listRooms(
            snapshotOf({
                __heartbeats: { old: { player1: 1 } },
                old: { createdAt: 10, playerName: { player1: 'A' }, started: true },
                empty: { createdAt: 30 },
                closing: { createdAt: 40, playerName: { player1: 'D' }, closedReason: 'inactivity' },
                fresh: { createdAt: 20, playerName: { player1: 'B', player2: 'C' } },
            })
        );

        expect(rooms).toEqual([
            { name: 'fresh', players: 2, started: false, createdAt: 20 },
            { name: 'old', players: 1, started: true, createdAt: 10 },
        ]);
    });

    it('isRoomClosing: should detect the closing flag', () => {
        const room = (flag) => ({ child: () => ({ exists: () => flag }) });
        expect(isRoomClosing(room(true))).toBe(true);
        expect(isRoomClosing(room(false))).toBe(false);
        expect(isRoomClosing(null)).toBe(false);
    });
});
