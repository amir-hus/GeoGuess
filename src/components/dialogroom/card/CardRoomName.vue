<template>
    <v-card id="card-roomname">
        <v-card-title>
            <span id="card-title">{{ $t('CardRoomName.title') }}</span>
        </v-card-title>
        <v-card-text>
            <v-container>
                <v-row>
                    <v-col cols="12">
                        <v-text-field
                            :loading="loadRoom"
                            :disabled="loadRoom"
                            :type="streamerMode ? 'password' : 'text'"
                            id="inputRoomName"
                            v-model="roomInputValue"
                            maxlength="10"
                            autofocus
                            :error-messages="roomErrorMessage"
                            @keyup.enter="searchRoom(roomNameText)"
                        />
                    </v-col>
                </v-row>
                <v-row v-if="!streamerMode && !loadRoom">
                    <v-col cols="12" class="pt-0">
                        <div class="rooms__title">
                            {{ $t('CardRoomName.activeRooms') }}
                        </div>
                        <p v-if="rooms.length === 0" class="rooms__empty">
                            {{ $t('CardRoomName.noActiveRooms') }}
                        </p>
                        <v-list v-else dense class="rooms__list">
                            <v-list-item
                                v-for="room in rooms"
                                :key="room.name"
                                :disabled="room.started"
                                @click="searchRoom(room.name)"
                            >
                                <v-list-item-content>
                                    <v-list-item-title>
                                        {{ room.name }}
                                    </v-list-item-title>
                                    <v-list-item-subtitle>
                                        {{ $tc('CardRoomName.players', room.players) }}
                                        ·
                                        {{
                                            room.started
                                                ? $t('CardRoomName.inGame')
                                                : $t('CardRoomName.waiting')
                                        }}
                                    </v-list-item-subtitle>
                                </v-list-item-content>
                                <v-list-item-action v-if="!room.started">
                                    <span class="rooms__join">
                                        {{ $t('CardRoomName.join') }}
                                    </span>
                                </v-list-item-action>
                            </v-list-item>
                        </v-list>
                    </v-col>
                </v-row>
            </v-container>
        </v-card-text>
        <v-card-actions>
            <div class="flex-grow-1" />
            <v-btn dark depressed color="error" @click="cancel">
                {{ $t('cancel') }}
            </v-btn>
            <v-btn
                dark
                depressed
                color="#43B581"
                @click="searchRoom(roomNameText)"
            >
                {{ $t('next') }}
            </v-btn>
        </v-card-actions>
    </v-card>
</template>

<script>
import firebase from 'firebase/app';
import 'firebase/database';
import { mapState, mapActions } from 'vuex';
import { listRooms } from '@/utils/roomHeartbeat';
import CardRoomMixin from './mixins/CardRoomMixin';
export default {
    mixins: [CardRoomMixin],
    data() {
        return {
            roomNameText: '',
            rooms: [],
            roomsRef: null,
        };
    },
    mounted() {
        this.roomsRef = firebase.database().ref();
        this.roomsRef.on('value', this.onRooms);
    },
    beforeDestroy() {
        if (this.roomsRef) {
            this.roomsRef.off('value', this.onRooms);
        }
    },
    computed: {
        ...mapState({
            streamerMode: (state) => state.homeStore.streamerMode,
        }),
        ...mapState('settingsStore', [
            'roomErrorMessage',
            'loadRoom',
            'roomName',
        ]),
        roomInputValue: {
            get: function () {
                return this.loadRoom ? this.roomName : this.roomNameText;
            },
            set: function (newValue) {
                this.roomNameText = newValue;
            },
        },
    },
    methods: {
        ...mapActions('settingsStore', ['searchRoom']),
        onRooms(snapshot) {
            this.rooms = listRooms(snapshot);
        },
    },
};
</script>

<style lang="scss" scoped>
#card-title {
    font-size: 16px;
    font-weight: 500;
    opacity: 0.9;
}
.rooms {
    &__title {
        font-weight: 500;
        opacity: 0.8;
        margin-bottom: 0.25rem;
    }
    &__empty {
        opacity: 0.7;
        margin: 0;
    }
    &__list {
        max-height: 240px;
        overflow-y: auto;
        background: transparent;
    }
    &__join {
        color: var(--v-primary-base);
        font-weight: 500;
        text-transform: uppercase;
        font-size: 0.8rem;
    }
}
</style>
