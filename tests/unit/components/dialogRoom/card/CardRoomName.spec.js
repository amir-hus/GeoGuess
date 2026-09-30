const mockOn = jest.fn();
const mockOff = jest.fn();
jest.mock('firebase/app', () => ({
    database: () => ({ ref: () => ({ on: mockOn, off: mockOff }) }),
}));
jest.mock('firebase/database', () => ({}));

import CardRoomName from '@/components/dialogroom/card/CardRoomName.vue';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import Vuex from 'vuex';
import appInit from '../../../testutils/appInit';

const args = appInit(createLocalVue());

describe('CardRoomName.vue', () => {
    let store, actions;
    beforeEach(() => {
        mockOn.mockClear();
        mockOff.mockClear();
        actions = { searchRoom: jest.fn() };
        store = new Vuex.Store({
            modules: {
                homeStore: { state: { streamerMode: false } },
                settingsStore: {
                    namespaced: true,
                    state: { roomErrorMessage: null, loadRoom: false, roomName: '' },
                    actions,
                },
            },
        });
    });

    it('should list active rooms and stop listening when closed', () => {
        const wrapper = shallowMount(CardRoomName, { ...args, store });
        expect(mockOn).toBeCalledWith('value', wrapper.vm.onRooms);

        wrapper.vm.onRooms({
            forEach: (cb) =>
                cb({
                    key: 'friday',
                    val: () => ({ createdAt: 1, playerName: { player1: 'A' } }),
                }),
        });
        expect(wrapper.vm.rooms).toEqual([
            { name: 'friday', players: 1, started: false, createdAt: 1 },
        ]);

        wrapper.destroy();
        expect(mockOff).toBeCalledWith('value', expect.any(Function));
    });
});
