// Shared KAPAT state + sweep orchestration, extracted out of Kapat.vue
// so it can be used both by the full KAPAT tab (Kapat.vue) AND by
// independent mini-panels on the main dashboard (KapatLoadPanel /
// KapatSweepPanel / KapatProfilePanel) -- these are separate,
// unrelated component instances (no shared parent other than the
// dashboard page itself), so a plain component-instance `data()` field
// wouldn't be visible across them. `Vue.observable()` makes this a
// genuinely shared, reactive singleton instead -- selecting a profile
// in one panel updates sweepParams that another panel reads, exactly
// like when they were props on one page.
//
// `i18n`/`Vue.$socket` are used directly here (their underlying plain
// instances, not `this.$t`/`this.$socket`) since this module has no
// Vue component instance of its own. The Vuex store, deliberately, is
// NOT statically imported here (see setStore()'s comment below) --
// each component passes its own `this.$store` in instead.
import Vue from 'vue'
import type { Store } from 'vuex'
import i18n from '@/plugins/i18n'
import { KlippyBridge } from './kapatBridge'
import { loadList, saveList } from './kapatData'
import { buildApplyCommand, buildSweepCommand, KapatSweepParams } from './kapatGcode'
import { BdKResult } from './kapatBdCost'
import { kapatSweepState, persistSweepState, clearPersistedSweepState } from './kapatSweepState'
import type { RootState } from '@/store/types'

export interface KapatStatus {
    has_load_cell?: boolean
    load_cell_name?: string
    activity?: { state?: string }
    last?: {
        k_opt?: number
        k_opt_source?: string
        applied?: boolean
        bd_per_k?: BdKResult[]
        bd_weights?: Record<string, number>
        [key: string]: unknown
    }
}

interface KapatHistoryEntry {
    id: string
    time: string
    temp: number | null
    kOpt: number | null
    source?: string
    applied?: boolean
    params: KapatSweepParams | null
    filament: string | null
    filamentType?: string
    brand?: string
    color?: string
}

const DEFAULT_SWEEP_PARAMS: KapatSweepParams = {
    vfr: 19.24,
    vfrLow: 1.92,
    tslow: 1.0,
    tfast: 0.25,
    cycles: 8,
    kstart: 0.0,
    kend: 0.08,
    kstep: 0.005,
    wobble: 0.05,
}

export interface KapatControllerState {
    bridge: KlippyBridge
    sweepParams: KapatSweepParams
    profileLabel: string
    profileTemp: number
    profileFilamentType: string
    profileBrand: string
    profileColor: string
    profileId: string
    calibX: number
    calibY: number
    calibZ: number
    preflightBusy: boolean
    // Transient override for a status line, used only while an
    // imperative action (preflight homing/heating, apply) is in flight
    // or just failed -- see Kapat.vue's original comment (still true
    // here): `null` falls back to a computed idle/running readout.
    actionStatus: string | null
    actionError: boolean
    confirmVisible: boolean
    confirmTitle: string
    confirmText: string
}

// Kapat.vue (and this module along with it) is imported *eagerly* by
// routes/index.ts to build the route table, which runs at app
// bootstrap. An earlier version of this file also did `import store
// from '@/store'` at the top level, which closed a real circular
// dependency (routes/index.ts -> Kapat.vue -> this module -> '@/store'
// -> store/actions.ts -> '@/plugins/router' -> routes/index.ts) and left
// the router with an empty route table app-wide. That's now fixed by
// threading the store in via ensureKapatController()'s argument instead
// of importing it here (see storeRef below) -- plain object/class
// construction below has no such dependency and is safe to do eagerly:
// `new KlippyBridge()` only stores hostname/port in its constructor, it
// doesn't open the socket until `.connect()`, which stays deferred to
// ensureKapatController() same as before.
//
// (A previous attempt at this wrapped the state in a lazy-init Proxy
// with only `get`/`set` traps. That broke Vue's own `.sync`/`Vue.set`
// machinery, which relies on `in`/`ownKeys` reflection to decide
// whether a property already exists -- those fell through to the
// Proxy's empty placeholder target instead of the real state, so
// updates from KapatSweepForm/KapatProfilePicker silently vanished.
// Confirmed live: editing a sweep param and saving a profile kept
// writing the *default* value to disk even though the input visibly
// showed the edited one. Plain eager construction has none of that.)
export const kapatController: KapatControllerState = Vue.observable({
    bridge: new KlippyBridge(),
    sweepParams: { ...DEFAULT_SWEEP_PARAMS },
    profileLabel: '',
    profileTemp: 210,
    profileFilamentType: '',
    profileBrand: '',
    profileColor: '',
    profileId: '',
    calibX: 0,
    calibY: 0,
    calibZ: 10,
    preflightBusy: false,
    actionStatus: null,
    actionError: false,
    confirmVisible: false,
    confirmTitle: '',
    confirmText: '',
})

let confirmResolver: ((value: boolean) => void) | null = null
let initialized = false
let wasSweeping = false

// The Vuex store instance, captured from whichever component calls
// ensureKapatController() first (every KAPAT-touching component does,
// in created() -- see below) instead of `import store from '@/store'`
// at this module's top level. A static import of `@/store` here used
// to close a real circular-dependency loop: routes/index.ts eagerly
// imports Kapat.vue (to build the route table) -> this module ->
// '@/store' -> store/actions.ts -> '@/plugins/router' -> routes/index.ts.
// In that cycle, `@/plugins/router.ts`'s `import routes from
// '@/routes'` resolved to `undefined` at the moment `new VueRouter(...)`
// ran (routes/index.ts's own module body hadn't finished yet), so the
// router ended up with an EMPTY route table app-wide -- confirmed via
// `router.getRoutes()` -- with no thrown exception anywhere to point at
// it. Every component already has a `this.$store` reference available
// at `created()` time regardless of import order, so threading it in
// as a plain argument sidesteps the whole problem.
let storeRef: Store<RootState> | null = null

export function getKapatStatus(): KapatStatus {
    return (storeRef?.state.printer?.kapat as KapatStatus) ?? {}
}

export function isKapatSweeping(): boolean {
    const state = getKapatStatus().activity?.state
    return !!state && state !== 'idle'
}

export function kapatHasData(): boolean {
    return storeRef?.state.printer?.kapat !== undefined
}

// Mirrors BaseMixin's printerIsPrinting (printing OR paused -- a
// paused print can resume at any moment, and a sweep mid-print would
// move the toolhead and wreck it either way). Re-derived here instead
// of reused directly since this module has no Vue component instance
// of its own to read `this.printerIsPrinting` from.
export function isPrinterPrinting(): boolean {
    const state = storeRef?.state.printer?.print_stats?.state ?? storeRef?.state.printer?.idle_timeout?.state ?? ''
    return ['printing', 'paused'].includes(state as string)
}

export function setStatus(text: string, isError = false): void {
    kapatController.actionStatus = text
    kapatController.actionError = isError
}

async function logHistory(): Promise<void> {
    const status = getKapatStatus()
    const entry: KapatHistoryEntry = {
        id: `${Date.now()}`,
        time: new Date().toISOString(),
        temp: (storeRef?.state.printer?.extruder?.temperature as number | undefined) ?? null,
        kOpt: status.last?.k_opt ?? null,
        source: status.last?.k_opt_source,
        applied: status.last?.applied,
        params: kapatSweepState.params,
        filament: kapatSweepState.label || null,
        filamentType: kapatSweepState.filamentType || undefined,
        brand: kapatSweepState.brand || undefined,
        color: kapatSweepState.color || undefined,
    }
    const list = await loadList<KapatHistoryEntry>(kapatController.bridge, 'history')
    // Multiple browser tabs/windows open against the same printer (the
    // Dashboard panels in one tab, the dedicated KAPAT tab in another,
    // say) each run their own independent copy of this whole module,
    // each with their own poll -- all of them observe the exact same
    // real sweep completion and each try to log it. Confirmed live: 3
    // tabs open produced 3 history entries with byte-identical k_opt
    // (0.03843268611250361, full precision) at :26, :29, and :60
    // seconds apart -- not a tight race, so the dedupe window needs
    // real headroom, not just a couple of seconds. There's no
    // cross-tab coordination possible (each tab's kapatSweepState/
    // wasSweeping is separate in-memory state), so dedupe against the
    // data itself instead: if the most recent saved entry already has
    // this *exact* k_opt (17 significant digits -- two genuinely
    // different sweeps matching by coincidence is not a real
    // possibility) and was written within the last 5 minutes, some
    // other tab/poller already logged this same completion -- skip.
    const DEDUPE_WINDOW_MS = 5 * 60 * 1000
    const mostRecent = list[0]
    if (
        mostRecent &&
        mostRecent.kOpt === entry.kOpt &&
        Date.now() - new Date(mostRecent.time).getTime() < DEDUPE_WINDOW_MS
    ) {
        return
    }
    list.unshift(entry)
    await saveList(kapatController.bridge, 'history', list.slice(0, 200))
}

function onSweepingChange(sweeping: boolean): void {
    // Kept permanently, not just for this investigation -- this area
    // (detecting sweep completion reliably enough to log history) has
    // broken silently more than once, and a plain debug-level trace of
    // every edge this poll detects is cheap insurance against the next
    // one being just as hard to reproduce.
    window.console.debug(`[kapat] sweeping -> ${sweeping} (was ${wasSweeping})`)
    if (wasSweeping && !sweeping) {
        // A cancelled sweep also makes `sweeping` go false, but
        // kapatStatus.last was never updated for this run -- it's
        // still whatever the previous successful sweep left there.
        // Without this check, logHistory() would re-log that stale
        // result as if a new sweep had just completed.
        if (!kapatSweepState.cancelled && getKapatStatus().last?.k_opt != null) {
            logHistory().then(
                () => window.console.debug('[kapat] history entry saved'),
                (err) => window.console.error('[kapat] failed to save history entry', err)
            )
        } else {
            window.console.debug('[kapat] sweep end: not logging (cancelled, or no k_opt yet)')
        }
        kapatSweepState.cancelled = false
        clearPersistedSweepState()
        Vue.$socket.emitAndWait('printer.gcode.script', { script: 'M104 S0' }).catch(() => {})
        kapatController.actionStatus = null
    }
    wasSweeping = sweeping
}

// Called from created() of every KAPAT-touching component -- the full
// tab (Kapat.vue) AND every dashboard mini-panel. Idempotent (guarded
// by `initialized`), so it doesn't matter which one mounts first or
// how many are mounted at once: the poll below is registered exactly
// once for the app's whole lifetime. This matters because up to 3
// independent dashboard panels (load chart, sweep form, profile
// picker) can all be visible on screen simultaneously -- unlike
// Kapat.vue's old per-component @Watch('sweeping'), which would have
// fired once per mounted panel and logged 2-3 duplicate history
// entries for a single completed sweep if copied naively into each one.
//
// A plain 1s poll rather than `store.watch(() => isKapatSweeping(),
// cb)` -- confirmed live that the watch approach silently stops
// working after the *first* sweep completes each page load, and only
// the first. Root cause: `printer/mutations.ts`'s `reset()` (which
// re-runs on every websocket reconnect, and a KAPAT_SWEEP long enough
// to trip Mainsail's own 10s socket heartbeat WILL reconnect mid-sweep)
// used a plain `delete state.kapat` for any key not in its default
// state shape -- Vue 2 can't track property removal via plain `delete`,
// and the *later* re-subscription re-adds 'kapat' as a brand-new
// reactive property with a fresh dependency, orphaning any watcher
// still subscribed to the old one. Fixed at the source too (see that
// mutation's own comment) but polling here doesn't depend on getting
// every future Mainsail-core reconnect-handling edge case right --
// each tick just re-reads the current value fresh, no stale dependency
// possible by construction.
export function ensureKapatController(store: Store<RootState>): void {
    storeRef = store
    if (initialized) return
    initialized = true
    wasSweeping = isKapatSweeping()
    if (!wasSweeping) {
        // No sweep is actually running right now according to the
        // printer -- any snapshot sitting in kapatSweepState (restored
        // from localStorage by its own module-load merge) is stale
        // leftover from a sweep that already finished (and got logged,
        // or errored out) while nothing was open to consume and clear
        // it. Don't let it get mistakenly attached to some future,
        // unrelated sweep.
        clearPersistedSweepState()
        kapatSweepState.label = ''
        kapatSweepState.filamentType = ''
        kapatSweepState.brand = ''
        kapatSweepState.color = ''
        kapatSweepState.profileId = ''
        kapatSweepState.params = null
    }
    kapatController.bridge.connect()
    kapatController.bridge
        .getData('settings')
        .then((res) => {
            const s = (res?.value as Record<string, number>) || {}
            if (s.calibX !== undefined) kapatController.calibX = s.calibX
            if (s.calibY !== undefined) kapatController.calibY = s.calibY
            if (s.calibZ !== undefined) kapatController.calibZ = s.calibZ
        })
        .catch(() => {})
    // 250ms, not 1s -- confirmed live that an artificially short test
    // (a couple of K values, 1 cycle each) can start and finish inside
    // a single 1s gap, meaning neither poll tick ever observes
    // `sweeping === true` and the true->false edge is never detected
    // at all. A real calibration run is realistically much longer than
    // that, but there's no reason to leave the race narrower than it
    // needs to be for the cost of one extra boolean check per tick.
    window.setInterval(() => {
        const sweeping = isKapatSweeping()
        if (sweeping !== wasSweeping) onSweepingChange(sweeping)
    }, 250)
    // (No beforeunload guard here anymore -- there used to be one,
    // warning against closing the tab mid home->heat->sweep sequence.
    // That sequence is now entirely server-side (see
    // cmd_KAPAT_SWEEP's TARGET_TEMP handling / _prepare_for_sweep in
    // klipper_extras/kapat/__init__.py), so the risk it existed for --
    // stranding the printer homed/heated with the sweep itself never
    // issued because the browser tab that would send it had closed --
    // no longer exists. Removed rather than left in as harmless
    // caution: it would have kept firing for the entire confirm-dialog
    // wait too (preflightBusy is true from the moment Start is clicked,
    // not just while a command is actually in flight), warning the user
    // even when closing the tab genuinely loses nothing.)
}

export function handleLoadParams(params: KapatSweepParams): void {
    kapatController.sweepParams = { ...kapatController.sweepParams, ...params }
}

export function showConfirm(title: string, text: string): Promise<boolean> {
    kapatController.confirmTitle = title
    kapatController.confirmText = text
    kapatController.confirmVisible = true
    return new Promise((resolve) => {
        confirmResolver = resolve
    })
}

export function onConfirmAction(): void {
    confirmResolver?.(true)
    confirmResolver = null
}

export function onConfirmVisibleChange(visible: boolean): void {
    if (!visible && confirmResolver) {
        confirmResolver(false)
        confirmResolver = null
    }
}

async function runGcode(script: string): Promise<void> {
    await Vue.$socket.emitAndWait('printer.gcode.script', { script })
}

// Confirmation dialogs only -- the actual home/move/heat sequence now
// happens entirely server-side inside cmd_KAPAT_SWEEP itself (see
// klipper_extras/kapat/__init__.py's _prepare_for_sweep(), passed
// TARGET_TEMP= below), NOT by this function awaiting G28/G1/M109 one
// at a time the way it used to. That used to mean the whole
// home->move->heat->sweep sequence was orchestrated by *this page's
// own JavaScript* -- exactly the kind of multi-step sequence every
// other Mainsail feature implements as one server-side macro
// (PRINT_START and friends), never as a chain of browser-issued
// commands. Confirmed live: closing the browser tab right after
// confirming the heat-up dialog left the nozzle heated with no
// calibration ever having started, since the JavaScript that would
// have sent KAPAT_SWEEP next no longer existed anywhere once the tab
// closed. Moving the actual sequence server-side means that's no
// longer possible -- once KAPAT_SWEEP is sent, Klipper runs the whole
// thing to completion regardless of what the browser does afterward.
//
// The confirmation UX is unchanged: agreeing to the homing confirm
// still implies "go ahead and prep the printer", so the heat confirm
// is skipped when homing was just confirmed, shown on its own only if
// the printer was already homed.
export async function handleStart(params: KapatSweepParams, resetChart?: () => void): Promise<void> {
    const status = getKapatStatus()
    if (!status.has_load_cell) {
        setStatus(i18n.t('Kapat.Status.NoLoadCell') as string, true)
        return
    }
    if (isPrinterPrinting()) {
        setStatus(i18n.t('Kapat.Status.PrinterBusy') as string, true)
        return
    }
    if (kapatController.preflightBusy || isKapatSweeping()) return
    kapatController.preflightBusy = true
    try {
        const homedAxes = (storeRef?.state.printer?.toolhead?.homed_axes as string | undefined) ?? ''
        const homed = ['x', 'y', 'z'].every((a) => homedAxes.includes(a))
        let justHomed = false
        if (!homed) {
            const ok = await showConfirm(i18n.t('Kapat.Confirm.HomeTitle') as string, i18n.t('Kapat.Confirm.HomeBody') as string)
            if (!ok) return
            justHomed = true
        }

        const extruderTemp = (storeRef?.state.printer?.extruder?.temperature as number | undefined) ?? null
        const targetTemp = kapatController.profileTemp || 210
        if (!justHomed && (extruderTemp == null || extruderTemp < targetTemp - 5)) {
            const ok = await showConfirm(
                i18n.t('Kapat.Confirm.HeatTitle') as string,
                i18n.t('Kapat.Confirm.HeatBody', { temp: targetTemp }) as string
            )
            if (!ok) return
        }

        resetChart?.()
        // Snapshot into the module-level singleton, not just this
        // controller's own state -- kapatSweepState specifically exists
        // to survive Vue Router destroying/recreating whichever page is
        // watching, and a mid-sweep page reload (see kapatSweepState.ts).
        //
        // label/filamentType/brand/color are ALSO snapshotted by
        // KapatProfilePicker itself (from its own authoritative data,
        // the moment it observes `sweeping` actually go true -- see its
        // onSweepingChange/snapshotForSweep). That path is more
        // reliable than this controller's own *mirrored* copies
        // (profileLabel etc.), but a real sweep on real hardware still
        // ended up with `filament: null` in history despite both paths
        // supposedly covering it -- root cause not fully nailed down.
        // Writing here too is deliberately redundant/defensive.
        kapatSweepState.params = params
        kapatSweepState.label = kapatController.profileLabel
        kapatSweepState.filamentType = kapatController.profileFilamentType
        kapatSweepState.brand = kapatController.profileBrand
        kapatSweepState.color = kapatController.profileColor
        kapatSweepState.profileId = kapatController.profileId
        persistSweepState()
        setStatus(i18n.t('Kapat.Status.SweepStarting') as string)
        const cmd = buildSweepCommand({ ...params, filament: kapatController.profileLabel, targetTemp })
        runGcode(cmd).catch((err: Error) => {
            setStatus(i18n.t('Kapat.Status.SweepFailed', { err: err.message }) as string, true)
        })
    } catch (err) {
        setStatus(i18n.t('Kapat.Status.SweepFailed', { err: (err as Error).message }) as string, true)
    } finally {
        kapatController.preflightBusy = false
    }
}

export function handleApply(k: number): void {
    runGcode(buildApplyCommand(k))
        .then(() => setStatus(i18n.t('Kapat.Status.Applied', { k: Number(k).toFixed(4) }) as string))
        .catch((err: Error) => setStatus(i18n.t('Kapat.Status.ApplyFailed', { err: err.message }) as string, true))
}
