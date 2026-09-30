<template>
    <v-card class="map-card my-area-card" rounded="lg" width="200">
        <v-sheet
            class="my-area-card__banner"
            height="150px"
            color="secondary"
            dark
        >
            <v-icon class="my-area-card__icon" size="80">
                mdi-map-marker-radius
            </v-icon>
            <v-card-title class="map-card__title">
                {{ $t('MyArea.title') }}
            </v-card-title>
        </v-sheet>
        <v-card-actions class="map-card__actions">
            <v-subheader>{{ $t('MyArea.radius') }}</v-subheader>
            <v-text-field
                v-model.number="radius"
                class="my-area-card__radius"
                type="number"
                :min="minRadius"
                :max="maxRadius"
                suffix="km"
                dense
                outlined
                hide-details
            />
            <v-spacer />
            <v-btn
                text
                color="darkGreen"
                :disabled="!isRadiusValid"
                @click="open"
            >
                {{ $t('Home.play') }}
            </v-btn>
        </v-card-actions>

        <v-dialog
            v-model="visible"
            max-width="600"
            :fullscreen="$viewport.width < 450"
        >
            <v-card>
                <v-card-title>
                    {{ $t('MyArea.dialogTitle', { radius }) }}
                </v-card-title>
                <v-card-text>
                    <v-alert v-if="locating" type="info" dense text>
                        {{ $t('MyArea.locating') }}
                    </v-alert>
                    <v-alert
                        v-else-if="locationError"
                        type="warning"
                        dense
                        text
                    >
                        {{ $t('MyArea.locationError.' + locationError) }}
                    </v-alert>

                    <v-text-field
                        v-model="place"
                        :label="$t('MyArea.searchLabel')"
                        :placeholder="$t('MyArea.searchPlaceholder')"
                        :error-messages="placeError ? $t('MyArea.placeNotFound') : []"
                        :loading="searching"
                        prepend-inner-icon="mdi-magnify"
                        append-outer-icon="mdi-send"
                        filled
                        dense
                        @keyup.enter="searchPlace"
                        @click:append-outer="searchPlace"
                    />

                    <GmapMap
                        :center="center || defaultCenter"
                        :zoom="center ? zoom : 1"
                        map-type-id="roadmap"
                        style="width: 100%; height: 320px"
                        :options="{
                            gestureHandling: 'greedy',
                            streetViewControl: false,
                            styles: $vuetify.theme.dark
                                ? $vuetify.theme.themes.dark.gmap
                                : $vuetify.theme.themes.light.gmap,
                        }"
                        @click="onClickMap"
                    >
                        <template v-if="center">
                            <GmapMarker
                                :position="center"
                                draggable
                                @dragend="onClickMap"
                            />
                            <GmapCircle
                                :center="center"
                                :radius="radius * 1000"
                                :options="circleOptions"
                            />
                        </template>
                    </GmapMap>
                    <p class="caption mt-2 mb-0">
                        {{ $t('MyArea.dropPinHint') }}
                    </p>
                </v-card-text>
                <v-card-actions>
                    <v-btn color="error" text @click="visible = false">
                        {{ $t('cancel') }}
                    </v-btn>
                    <v-spacer />
                    <v-btn
                        color="primary"
                        :disabled="!canPlay"
                        @click="play(true)"
                    >
                        {{ $t('DialogRoom.singlePlayer') }}
                    </v-btn>
                    <v-btn
                        color="secondary"
                        :dark="canPlay"
                        :disabled="!canPlay"
                        @click="play(false)"
                    >
                        {{ $t('DialogRoom.withFriends') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-card>
</template>

<script>
import { mapActions } from 'vuex';
import axios from '@/plugins/axios';
import { GeoMapCustom } from '@/models/GeoMap';
import { createCircleGeoJson } from '@/utils/circle';

const DEFAULT_RADIUS = 10;
const RADIUS_STORAGE_KEY = 'myAreaRadius';

function loadRadius() {
    try {
        const saved = parseFloat(localStorage.getItem(RADIUS_STORAGE_KEY));
        return saved > 0 ? saved : DEFAULT_RADIUS;
    } catch (e) {
        return DEFAULT_RADIUS;
    }
}

export default {
    name: 'MyAreaCard',
    data() {
        return {
            radius: loadRadius(),
            minRadius: 1,
            maxRadius: 500,
            visible: false,
            center: null,
            defaultCenter: { lat: 10, lng: 10 },
            locating: false,
            locationError: null,
            place: '',
            searching: false,
            placeError: false,
            circleOptions: {
                strokeColor: '#1565C0',
                strokeWeight: 2,
                fillColor: '#1E88E5',
                fillOpacity: 0.2,
                clickable: false,
            },
        };
    },
    computed: {
        isRadiusValid() {
            return (
                typeof this.radius === 'number' &&
                this.radius >= this.minRadius &&
                this.radius <= this.maxRadius
            );
        },
        canPlay() {
            return this.isRadiusValid && this.center !== null;
        },
        zoom() {
            // Fit roughly two diameters of the circle in the map
            const zoom = Math.round(Math.log2(40075 / (this.radius * 4)));
            return Math.min(Math.max(zoom, 2), 16);
        },
    },
    watch: {
        radius(value) {
            if (!this.isRadiusValid) return;
            try {
                localStorage.setItem(RADIUS_STORAGE_KEY, value);
            } catch (e) {
                // Storage unavailable, the radius is simply not remembered
            }
        },
    },
    methods: {
        ...mapActions(['setMapLoaded']),
        ...mapActions('settingsStore', ['openDialogRoom']),
        open() {
            this.visible = true;
            if (!this.center) {
                this.locate();
            }
        },
        locate() {
            this.locationError = null;
            if (!navigator.geolocation) {
                this.locationError = 'unsupported';
                return;
            }
            this.locating = true;
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.locating = false;
                    this.center = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    };
                },
                (error) => {
                    this.locating = false;
                    this.locationError =
                        error.code === 1 ? 'denied' : 'unavailable';
                },
                { timeout: 10000, maximumAge: 600000 }
            );
        },
        async searchPlace() {
            if (!this.place || this.searching) return;
            this.searching = true;
            this.placeError = false;
            try {
                const res = await axios.get(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
                        this.place
                    )}&format=json&limit=1&accept-language=en`
                );
                if (res && res.data && res.data.length > 0) {
                    this.center = {
                        lat: parseFloat(res.data[0].lat),
                        lng: parseFloat(res.data[0].lon),
                    };
                } else {
                    this.placeError = true;
                }
            } catch (e) {
                this.placeError = true;
            } finally {
                this.searching = false;
            }
        },
        onClickMap(event) {
            if (!event || !event.latLng) return;
            this.center = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng(),
            };
        },
        play(isSinglePlayer) {
            if (!this.canPlay) return;
            const map = new GeoMapCustom();
            map.name = `${this.$t('MyArea.title')} (${this.radius} km)`;
            map.geojson = createCircleGeoJson(
                this.center.lat,
                this.center.lng,
                this.radius
            );
            this.setMapLoaded(map);
            this.visible = false;
            this.openDialogRoom(isSinglePlayer);
        },
    },
};
</script>

<style lang="scss" scoped>
.my-area-card {
    &__banner {
        position: relative;
        display: flex;
        align-items: flex-end;
    }
    &__icon {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        margin: auto;
        opacity: 0.8;
    }
    &__radius {
        max-width: 90px;
    }
}
</style>
