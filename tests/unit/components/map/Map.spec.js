import Map from '@/components/map/Map';
import { createLocalVue, shallowMount } from '@vue/test-utils';
import appInit from '../../testutils/appInit';
import createGoogleMapsMock from 'jest-google-maps-mock';

const args = appInit(createLocalVue());
global.google = {
    maps: {
        ...createGoogleMapsMock(),
        InfoWindow: jest.fn().mockImplementation(function () {
            return {
                open: jest.fn(),
            };
        }),
        Polyline: jest.fn().mockImplementation(function () {
            return {
                setMap: jest.fn(),
            };
        }),
    },
};
describe('Map.vue', () => {
    it('test methods', () => {
        const wrapper = shallowMount(Map, {
            ...args,
            propsData: {
                bbox: [0, 10, 20, 30],
            },
        });
        expect(wrapper.vm.markers).toHaveLength(0);
        wrapper.vm.putMarker({ lat: 0, lng: 1 });
        wrapper.vm.putMarker({ lat: 0, lng: 1 }, true);
        wrapper.vm.putMarker({ lat: 0, lng: 1 }, false, 'l');
        expect(wrapper.vm.markers).toHaveLength(3);

        expect(global.google.maps.Marker).toHaveBeenCalledTimes(3);

        wrapper.vm.setInfoWindow('Mickey', 10, 5000);
        wrapper.vm.setInfoWindow('Mickey', 10000, 5000);
        expect(global.google.maps.InfoWindow).toHaveBeenCalledTimes(2);

        wrapper.vm.removeMarkers();
        expect(wrapper.vm.markers).toHaveLength(0);

        wrapper.vm.drawPolyline({ lat: 0, lng: 1 }, 1, { lat: 1, lng: 1 });
        expect(global.google.maps.Polyline).toHaveBeenCalledTimes(1);
        expect(wrapper.vm.polylines).toHaveLength(1);
    });

    describe('play area circle', () => {
        let setMap;
        beforeEach(() => {
            setMap = jest.fn();
            global.google.maps.Circle = jest.fn().mockImplementation(function () {
                return { setMap };
            });
        });

        const mountWithMap = (propsData) => {
            const wrapper = shallowMount(Map, { ...args, propsData });
            wrapper.vm.map = {};
            return wrapper;
        };

        it('should draw the circle when a play area is set', () => {
            const wrapper = mountWithMap({
                playArea: { lat: 3.1, lng: 101.7, radius: 10 },
            });
            wrapper.vm.drawPlayArea();

            expect(global.google.maps.Circle).toHaveBeenCalledWith(
                expect.objectContaining({
                    center: { lat: 3.1, lng: 101.7 },
                    radius: 10000,
                    clickable: false,
                })
            );
        });

        it('should hide the circle when toggled off', async () => {
            const wrapper = mountWithMap({
                playArea: { lat: 3.1, lng: 101.7, radius: 10 },
            });
            wrapper.vm.drawPlayArea();
            await wrapper.setProps({ showPlayArea: false });

            expect(setMap).toHaveBeenCalledWith(null);
            expect(wrapper.vm.playAreaCircle).toBeNull();
        });

        it('should not draw anything without a play area', () => {
            const wrapper = mountWithMap({});
            wrapper.vm.drawPlayArea();

            expect(global.google.maps.Circle).not.toHaveBeenCalled();
        });
    });
});
