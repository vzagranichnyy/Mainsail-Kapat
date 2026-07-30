// Mainsail's router never keeps page components alive across
// navigation (no <keep-alive> anywhere in this app -- checked) -- every
// time the user leaves the KAPAT tab and comes back, Kapat.vue is fully
// destroyed and recreated, wiping any state kept in its own `data()`.
// A real PA sweep runs for minutes; it's completely normal for a user
// to check another tab while waiting. If they do, whatever profile was
// selected (label/type/brand/color) and the sweep params in flight are
// gone by the time the sweep finishes and Kapat.vue tries to log it to
// history -- producing entries with `filament: null` and `params: null`
// despite a real profile having been selected at start time. Confirmed
// this reproduces just by clicking to another sidebar tab and back.
//
// This plain module-level object is NOT tied to any Vue component
// instance, so it survives exactly that scenario: Kapat.vue snapshots
// into it right before issuing KAPAT_SWEEP (handleStart), and reads
// back from it when the sweep completes (logHistory), regardless of
// whether the page component in between was destroyed and recreated.
import { KapatSweepParams } from './kapatGcode'

export interface KapatInFlightSweep {
    label: string
    filamentType: string
    brand: string
    color: string
    params: KapatSweepParams | null
}

export const kapatSweepState: KapatInFlightSweep = {
    label: '',
    filamentType: '',
    brand: '',
    color: '',
    params: null,
}
