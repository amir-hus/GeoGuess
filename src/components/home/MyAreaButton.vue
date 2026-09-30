<template>
    <div class="my-area">
        <v-btn
            class="my-area__btn"
            rounded
            large
            dark
            color="darkGreen"
            @click="open"
        >
            {{ $t('MyArea.button') }}
        </v-btn>

        <v-dialog
            v-model="visible"
            max-width="600"
            :fullscreen="$viewport.width < 450"
        >
            <v-card>
                <v-card-title>{{ $t('MyArea.title') }}</v-card-title>
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

                    <div class="my-area__radius">
                        <span class="my-area__radius__label">
                            {{ $t('MyArea.radius') }}
                        </span>
                        <v-slider
                            v-model="sliderRadius"
                            :min="minRadius"
                            :max="sliderMax"
                            hide-details
                            class="mx-3"
                        />
                        <v-text-field
                            v-model.number="radius"
                            class="my-area__radius__input"
                            type="number"
                            :min="minRadius"
                            :max="maxRadius"
                            suffix="km"
                            dense
                            outlined
                            hide-details
                            :error="!isRadiusValid"
                        />
                    </div>

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
                                v-if="isRadiusValid"
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
    </div>
</template>

<script>
import { mapActions, mapMutations } from 'vuex';
import axios from '@/plugins/axios';
import { GeoMapCustom } from '@/models/GeoMap';
import { SETTINGS_SET_SKIP_MAP_STEP } from '@/store/mutation-types';
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
    name: 'MyAreaButton',
    data() {
        return {
            radius: loadRadius(),
            minRadius: 1,
            sliderMax: 100,
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
        // The slider covers the common range; larger radii are typed in the field
        sliderRadius: {
            get() {
                return this.isRadiusValid
                    ? Math.min(this.radius, this.sliderMax)
                    : this.minRadius;
            },
            set(value) {
                this.radius = value;
            },
        },
        canPlay() {
            return this.isRadiusValid && this.center !== null;
        },
        zoom() {
            // Fit roughly two diameters of the circle in the map
            const radius = this.isRadiusValid ? this.radius : DEFAULT_RADIUS;
            const zoom = Math.round(Math.log2(40075 / (radius * 4)));
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
        ...mapMutations('settingsStore', {
            setSkipMapStep: SETTINGS_SET_SKIP_MAP_STEP,
        }),
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
            // Lets the guess map draw the circle during the game
            map.geojson.properties = {
                playArea: {
                    lat: this.center.lat,
                    lng: this.center.lng,
                    radius: this.radius,
                },
            };
            this.setMapLoaded(map);
            this.visible = false;
            // The circle is already the map, so go straight to the game settings
            this.setSkipMapStep(true);
            this.openDialogRoom(isSinglePlayer);
        },
    },
};
</script>

<style lang="scss" scoped>
.my-area {
    // Same width as the Single player / With friends row so the pill sits centred under it
    width: calc(100% - 50px);
    margin: 1.25rem auto 0;
    text-align: center;

    &__btn {
        padding: 0 2.5em !important;
    }

    &__radius {
        display: flex;
        align-items: center;
        margin-bottom: 1rem;

        &__input {
            max-width: 100px;
        }
    }
}

@media (max-width: 410px) {
    .my-area {
        width: 100%;
        margin-top: 0;

        &__btn {
            width: 80%;
            margin: 2% auto;
        }
    }
}
</style>
