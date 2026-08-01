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
//
// A module-level object does NOT, however, survive an actual full page
// reload (browser refresh, tab discarded and reloaded, etc.) -- that
// re-runs this module from scratch, resetting everything back to the
// empty defaults below. Confirmed this is a real, separate recurrence
// of the same symptom on real hardware: a completed sweep logged
// `params: null` to history despite `params` being unconditionally set
// from a real (never-null) object at sweep-start, which is only
// possible if this whole module got reinitialized mid-sweep. Mirrored
// to localStorage (same pattern KapatProfilePicker already uses for
// just the selected profile id) so a mid-sweep reload can restore it.
import { KapatSweepParams } from './kapatGcode'

export interface KapatInFlightSweep {
    label: string
    filamentType: string
    brand: string
    color: string
    profileId: string
    params: KapatSweepParams | null
    // Set by the Cancel button right before calling bridge.cancelSweep().
    // The backend still reports `sweeping` going false when a cancelled
    // sweep unwinds (same as a normal completion), but `kapatStatus.last`
    // never got updated for THIS run -- it still holds whatever the
    // previous successful sweep's result was. Without this flag,
    // Kapat.vue's completion handler would see that stale (but non-null)
    // k_opt and incorrectly re-log the previous sweep's result to
    // history a second time. Deliberately NOT persisted to localStorage
    // (see PERSIST_KEYS below) -- a stale `true` surviving a reload
    // could wrongly suppress logging a real, unrelated future sweep.
    cancelled: boolean
}

const STORAGE_KEY = 'kapat-inflight-sweep'
const PERSIST_KEYS = ['label', 'filamentType', 'brand', 'color', 'profileId', 'params'] as const

function loadPersisted(): Partial<KapatInFlightSweep> {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

export const kapatSweepState: KapatInFlightSweep = {
    label: '',
    filamentType: '',
    brand: '',
    color: '',
    profileId: '',
    params: null,
    cancelled: false,
    ...loadPersisted(),
}

// Call after mutating any of the snapshot fields above (handleStart,
// snapshotForSweep) so a mid-sweep page reload can restore them via
// the loadPersisted() merge above.
export function persistSweepState(): void {
    try {
        const toSave: Partial<KapatInFlightSweep> = {}
        for (const key of PERSIST_KEYS) (toSave as Record<string, unknown>)[key] = kapatSweepState[key]
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
        // best-effort -- if localStorage is unavailable, this simply
        // degrades back to the pre-existing in-tab-navigation-only
        // behavior, nothing crashes.
    }
}

export function clearPersistedSweepState(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY)
    } catch {
        // best-effort, see persistSweepState()
    }
}
