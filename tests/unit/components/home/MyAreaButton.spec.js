import MyAreaButton from '@/components/home/MyAreaButton.vue';
import { GeoMapCustom } from '@/models/GeoMap';
import axios from '@/plugins/axios';
import settingsStore from '@/store/modules/settings.store';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import Vuex from 'vuex';
import appInit from '../../testutils/appInit';

const args = appInit(createLocalVue());

describe('MyAreaButton.vue', () => {
    let store, actions, setMapLoaded;
    beforeEach(() => {
        localStorage.clear();
        actions = {
            openDialogRoom: jest.fn(),
        };
        setMapLoaded = jest.fn();
        store = new Vuex.Store({
            modules: {
                settingsStore: {
                    namespaced: true,
                    state: settingsStore.state,
                    getters: settingsStore.getters,
                    mutations: settingsStore.mutations,
                    actions,
                },
                homeStore: {
                    actions: {
                        setMapLoaded,
                    },
                },
            },
        });
    });

    afterEach(() => {
        delete navigator.geolocation;
        jest.restoreAllMocks();
    });

    const mount = () =>
        shallowMount(MyAreaButton, {
            ...args,
            store,
        });

    const mockGeolocation = (impl) => {
        Object.defineProperty(navigator, 'geolocation', {
            value: { getCurrentPosition: jest.fn(impl) },
            configurable: true,
        });
    };

    it('data: should default the radius to 10 km', () => {
        const wrapper = mount();
        expect(wrapper.vm.radius).toEqual(10);
        expect(wrapper.vm.isRadiusValid).toBe(true);
    });

    it('data: should restore and remember the radius', async () => {
        localStorage.setItem('myAreaRadius', '25');
        const wrapper = mount();
        expect(wrapper.vm.radius).toEqual(25);

        await wrapper.setData({ radius: 40 });
        expect(localStorage.getItem('myAreaRadius')).toEqual('40');
    });

    it('computed: should reject invalid radius', async () => {
        const wrapper = mount();
        await wrapper.setData({ radius: 0 });
        expect(wrapper.vm.isRadiusValid).toBe(false);
        await wrapper.setData({ radius: 1000 });
        expect(wrapper.vm.isRadiusValid).toBe(false);
        await wrapper.setData({ radius: '' });
        expect(wrapper.vm.isRadiusValid).toBe(false);
    });

    it('computed: slider should follow the radius and cap at its maximum', async () => {
        const wrapper = mount();
        wrapper.vm.sliderRadius = 35;
        expect(wrapper.vm.radius).toEqual(35);

        await wrapper.setData({ radius: 250 });
        expect(wrapper.vm.sliderRadius).toEqual(100);
        expect(wrapper.vm.isRadiusValid).toBe(true);
    });

    it('open: should center on the browser location when allowed', () => {
        mockGeolocation((success) =>
            success({ coords: { latitude: 3.139, longitude: 101.6869 } })
        );
        const wrapper = mount();
        wrapper.vm.open();

        expect(wrapper.vm.visible).toBe(true);
        expect(wrapper.vm.center).toEqual({ lat: 3.139, lng: 101.6869 });
        expect(wrapper.vm.locationError).toBeNull();
        expect(wrapper.vm.canPlay).toBe(true);
    });

    it('open: should fall back when location is denied', () => {
        mockGeolocation((success, error) => error({ code: 1 }));
        const wrapper = mount();
        wrapper.vm.open();

        expect(wrapper.vm.center).toBeNull();
        expect(wrapper.vm.locationError).toEqual('denied');
        expect(wrapper.vm.canPlay).toBe(false);
    });

    it('open: should fall back when location is unavailable', () => {
        mockGeolocation((success, error) => error({ code: 3 }));
        const wrapper = mount();
        wrapper.vm.open();

        expect(wrapper.vm.locationError).toEqual('unavailable');
    });

    it('open: should fall back when geolocation is unsupported', () => {
        const wrapper = mount();
        wrapper.vm.open();

        expect(wrapper.vm.locationError).toEqual('unsupported');
    });

    it('searchPlace: should center on the place found', async () => {
        jest.spyOn(axios, 'get').mockResolvedValue({
            data: [{ lat: '2.9264', lon: '101.6964' }],
        });
        const wrapper = mount();
        await wrapper.setData({ place: 'Putrajaya' });
        await wrapper.vm.searchPlace();

        expect(axios.get).toBeCalledWith(expect.stringContaining('q=Putrajaya'));
        expect(wrapper.vm.center).toEqual({ lat: 2.9264, lng: 101.6964 });
        expect(wrapper.vm.placeError).toBe(false);
    });

    it('searchPlace: should show an error when nothing is found', async () => {
        jest.spyOn(axios, 'get').mockResolvedValue({ data: [] });
        const wrapper = mount();
        await wrapper.setData({ place: 'nowhere at all' });
        await wrapper.vm.searchPlace();

        expect(wrapper.vm.center).toBeNull();
        expect(wrapper.vm.placeError).toBe(true);
    });

    it('onClickMap: should drop the pin where the map is clicked', () => {
        const wrapper = mount();
        wrapper.vm.onClickMap({
            latLng: { lat: () => 1.5, lng: () => 103.7 },
        });

        expect(wrapper.vm.center).toEqual({ lat: 1.5, lng: 103.7 });
    });

    it('play: should load a circle map and open the room dialog', async () => {
        const wrapper = mount();
        await wrapper.setData({
            visible: true,
            center: { lat: 3.139, lng: 101.6869 },
        });
        wrapper.vm.play(false);

        expect(wrapper.vm.visible).toBe(false);
        expect(setMapLoaded).toBeCalledTimes(1);
        const map = setMapLoaded.mock.calls[0][1];
        expect(map).toBeInstanceOf(GeoMapCustom);
        expect(map.name).toEqual('My Area (10 km)');
        expect(map.geojson.geometry.type).toEqual('Polygon');
        expect(actions.openDialogRoom).toBeCalledWith(expect.anything(), false);
        expect(store.state.settingsStore.skipMapStep).toBe(true);
    });

    it('play: should do nothing without a center', () => {
        const wrapper = mount();
        wrapper.vm.play(true);

        expect(setMapLoaded).not.toBeCalled();
        expect(actions.openDialogRoom).not.toBeCalled();
    });
});
