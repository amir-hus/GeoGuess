import HeaderAlert from '@/components/page/HeaderAlert.vue';
import alertStore from '@/store/modules/alert.store';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import Vuex from 'vuex';
import appInit from '../../testutils/appInit';

const args = appInit(createLocalVue());

describe('HeaderAlert.vue', () => {
    let store;
    beforeEach(() => {
        jest.useFakeTimers();
        store = new Vuex.Store({
            modules: {
                alertStore: {
                    namespaced: true,
                    state: { alert: undefined },
                    mutations: alertStore.mutations,
                    actions: alertStore.actions,
                },
            },
        });
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('should close an alert with a timeout by itself', async () => {
        shallowMount(HeaderAlert, { ...args, store });
        await store.dispatch('alertStore/setAlert', { title: 't', subtitle: 's', timeout: 5000 });

        jest.advanceTimersByTime(4999);
        expect(store.state.alertStore.alert).toBeTruthy();
        jest.advanceTimersByTime(1);
        expect(store.state.alertStore.alert).toBeNull();
    });

    it('should keep an alert without a timeout', async () => {
        shallowMount(HeaderAlert, { ...args, store });
        await store.dispatch('alertStore/setAlert', { title: 't', subtitle: 's' });

        jest.advanceTimersByTime(60000);
        expect(store.state.alertStore.alert).toBeTruthy();
    });
});
