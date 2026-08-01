import Vue from 'vue'
import { getDefaultState } from './index'
import { MutationTree } from 'vuex'
import { PrinterState } from '@/store/printer/types'

export const mutations: MutationTree<PrinterState> = {
    reset(state) {
        const defaultState = getDefaultState()

        for (const key of Object.keys(state)) {
            // 'kapat' isn't a Mainsail-native object (it's only present
            // because Klipper's own printer.objects.list generically
            // includes whatever klippy_extras register, see
            // initSubscripts()) so it's never in getDefaultState() --
            // without this exemption it got wiped by a plain `delete`
            // on every reconnect/klippy-ready reset. Vue 2 can't detect
            // property removal via plain `delete` (only Vue.delete()),
            // so nothing watching this key got notified of the wipe --
            // but the *later* re-subscription re-adds it via Vue.set(),
            // creating a brand-new reactive property with a fresh,
            // unrelated dependency. Any watcher that had already
            // subscribed to the old 'kapat' property (e.g. KAPAT's own
            // sweep-completion detector) silently stopped receiving any
            // future updates for it at all, permanently, for the rest
            // of that page's lifetime -- confirmed live: KAPAT history
            // logging worked for exactly one sweep per page load (the
            // one before the first reconnect) and silently stopped
            // after that, with real completed sweeps in Klipper's own
            // log but nothing making it into history.json.
            if (!(key in defaultState) && key !== 'tempHistory' && key !== 'kapat') {
                delete state[key]
            }
        }

        for (const [key, value] of Object.entries(defaultState)) {
            Vue.set(state, key, value)
        }
    },

    setData(state, payload) {
        Object.keys(payload).forEach((key) => {
            const value = payload[key]

            if (typeof value !== 'object' || value === null || !(key in state)) {
                Vue.set(state, key, value)
                return
            }

            if (typeof value === 'object') {
                Object.keys(value).forEach((subkey) => {
                    Vue.set(state[key], subkey, value[subkey])
                })
            }
        })
    },

    setBedMeshProfiles(state, payload) {
        if ('bed_mesh' in state) {
            Vue.set(state.bed_mesh, 'profiles', payload)
        }
    },

    clearCurrentFile(state) {
        Vue.set(state, 'current_file', {})
    },

    setEndstopStatus(state, payload) {
        delete payload.requestParams

        Vue.set(state, 'endstops', payload)
    },

    removeBedMeshProfile(state, payload) {
        if ('bed_mesh ' + payload.name in state.configfile.config) {
            Object.assign(state.configfile.config['bed_mesh ' + payload.name], { deleted: true })
        }
    },

    clearScrewsTiltAdjust(state) {
        Vue.set(state.screws_tilt_adjust, 'error', false)
        Vue.set(state.screws_tilt_adjust, 'results', {})
    },
}
