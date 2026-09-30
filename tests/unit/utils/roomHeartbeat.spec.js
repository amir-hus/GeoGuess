const mockSet = jest.fn();
const mockRef = jest.fn(() => ({ set: mockSet }));
jest.mock('firebase/app', () => {
    const database = () => ({ ref: mockRef });
    database.ServerValue = { TIMESTAMP: 'SERVER_TIMESTAMP' };
    return { database };
});
jest.mock('firebase/database', () => ({}));

import {
    HEARTBEAT_INTERVAL,
    listRooms,
    startRoomHeartbeat,
} from '@/utils/roomHeartbeat';

const snapshotOf = (data) => ({
    forEach: (cb) =>
        Object.entries(data).forEach(([key, value]) =>
            cb({ key, val: () => value })
        ),
});

describe('utils/roomHeartbeat', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockSet.mockClear();
        mockRef.mockClear();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('startRoomHeartbeat: should beat now and every interval until stopped', () => {
        const stop = startRoomHeartbeat('myroom', 2);

        expect(mockRef).toBeCalledWith('__heartbeats/myroom/player2');
        expect(mockSet).toBeCalledTimes(1);
        expect(mockSet).toBeCalledWith('SERVER_TIMESTAMP');

        jest.advanceTimersByTime(HEARTBEAT_INTERVAL * 2);
        expect(mockSet).toBeCalledTimes(3);

        stop();
        jest.advanceTimersByTime(HEARTBEAT_INTERVAL * 2);
        expect(mockSet).toBeCalledTimes(3);
    });

    it('startRoomHeartbeat: should do nothing without a room or player', () => {
        startRoomHeartbeat('', 1)();
        startRoomHeartbeat('room', 0)();
        expect(mockRef).not.toBeCalled();
    });

    it('listRooms: should list rooms with players, newest first, skipping internal nodes', () => {
        const rooms = listRooms(
            snapshotOf({
                __heartbeats: { old: { player1: 1 } },
                old: { createdAt: 10, playerName: { player1: 'A' }, started: true },
                empty: { createdAt: 30 },
                fresh: { createdAt: 20, playerName: { player1: 'B', player2: 'C' } },
            })
        );

        expect(rooms).toEqual([
            { name: 'fresh', players: 2, started: false, createdAt: 20 },
            { name: 'old', players: 1, started: true, createdAt: 10 },
        ]);
    });
});
