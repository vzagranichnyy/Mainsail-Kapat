<template>
    <div>
        <v-row>
            <v-col cols="12">
                <span class="text--disabled">{{ $t('Kapat.Tagline') }}</span>
                <span class="ml-3" :class="statusError ? 'error--text' : 'success--text'">{{ statusLine }}</span>
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12">
                <kapat-live-chart ref="chart" :bridge="bridge" :sensor-name="kapatStatus.load_cell_name || 'load_cell'" />
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12" md="8">
                <kapat-sweep-form
                    :disabled="sweeping || preflightBusy"
                    :params.sync="sweepParams"
                    @start="handleStart" />
            </v-col>
            <v-col cols="12" md="4">
                <kapat-profile-picker
                    :bridge="bridge"
                    :sweep-params="sweepParams"
                    :label.sync="profileLabel"
                    :temp.sync="profileTemp"
                    :filament-type.sync="profileFilamentType"
                    :brand.sync="profileBrand"
                    :color.sync="profileColor"
                    :calib-x.sync="calibX"
                    :calib-y.sync="calibY"
                    :calib-z.sync="calibZ"
                    @apply="handleApply"
                    @loadParams="handleLoadParams" />
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12">
                <kapat-history-panel :bridge="bridge" @apply="handleApply" />
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12">
                <panel :title="$t('Kapat.AnalysisSection.Title')" card-class="kapat-analysis-section" :collapsible="true">
                    <v-card-text>
                        <kapat-analysis-panel :bridge="bridge" />

                        <template v-if="bdPerK.length">
                            <v-divider class="my-4" />
                            <kapat-bd-composite :bd-per-k="bdPerK" :default-weights="bdWeights" :notes="kapatStatus.last && kapatStatus.last.notes ? kapatStatus.last.notes : []" />

                            <v-divider class="my-4" />
                            <kapat-bd-metric-k-opt-table :bd-per-k="bdPerK" :default-weights="bdWeights" />

                            <v-divider class="my-4" />
                            <kapat-bd-metric-grid :bd-per-k="bdPerK" />
                        </template>

                        <template v-if="kapatStatus.last && kapatStatus.last.per_k && kapatStatus.last.per_k.length">
                            <v-divider class="my-4" />
                            <kapat-results-panel :last="kapatStatus.last" />
                        </template>
                    </v-card-text>
                </panel>
            </v-col>
        </v-row>

        <confirmation-dialog
            v-model="confirmVisible"
            :title="confirmTitle"
            :text="confirmText"
            :action-button-text="$t('Kapat.Confirm.Continue').toString()"
            action-button-color="primary"
            @action="onConfirmAction" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KlippyBridge } from '@/lib/kapatBridge'
import { loadList, saveList } from '@/lib/kapatData'
import { buildApplyCommand, buildSweepCommand, KapatSweepParams } from '@/lib/kapatGcode'
import { BdKResult } from '@/lib/kapatBdCost'
import { kapatSweepState } from '@/lib/kapatSweepState'

interface KapatStatus {
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

@Component
export default class PageKapat extends Mixins(BaseMixin) {
    bridge: KlippyBridge = new KlippyBridge()

    sweepParams: KapatSweepParams = { ...DEFAULT_SWEEP_PARAMS }
    profileLabel = ''
    profileTemp = 210
    profileFilamentType = ''
    profileBrand = ''
    profileColor = ''
    wasSweeping = false

    calibX = 0
    calibY = 0
    calibZ = 10

    preflightBusy = false

    // Transient override for the status line, used only while an
    // imperative action (preflight homing/heating, apply) is in flight or
    // just failed. `null` falls back to the computed idle/running/
    // connecting readout derived straight from Vuex's `printer.kapat`
    // state -- using a plain mutable field for the *whole* status line
    // (set once in `created()`) meant it only ever changed on the next
    // `sweeping` transition and got stuck on "connecting..." forever if
    // the kapat object was already idle on first render (watchers don't
    // fire for the initial value).
    actionStatus: string | null = null
    actionError = false

    confirmVisible = false
    confirmTitle = ''
    confirmText = ''
    private confirmResolver: ((value: boolean) => void) | null = null

    created(): void {
        // If the page got recreated (user navigated away and back)
        // while a sweep was already running, `sweeping` is true right
        // from this first evaluation -- seed `wasSweeping` to match
        // instead of the class-field default `false`, or the eventual
        // true->false completion never satisfies
        // `onSweepingChange`'s `wasSweeping && !sweeping` check and
        // logHistory() silently never runs at all.
        this.wasSweeping = this.sweeping
        this.bridge.connect()
        this.bridge
            .getData('settings')
            .then((res) => {
                const s = (res?.value as Record<string, number>) || {}
                if (s.calibX !== undefined) this.calibX = s.calibX
                if (s.calibY !== undefined) this.calibY = s.calibY
                if (s.calibZ !== undefined) this.calibZ = s.calibZ
            })
            .catch(() => {})
    }

    get kapatStatus(): KapatStatus {
        return (this.$store.state.printer.kapat as KapatStatus) ?? {}
    }

    get bdPerK(): BdKResult[] {
        return this.kapatStatus.last?.bd_per_k ?? []
    }

    get bdWeights(): Record<string, number> {
        return this.kapatStatus.last?.bd_weights ?? {}
    }

    get extruderTemp(): number | null {
        return this.$store.state.printer.extruder?.temperature ?? null
    }

    get homedAxes(): string {
        return this.$store.state.printer.toolhead?.homed_axes ?? ''
    }

    get kapatHasData(): boolean {
        return this.$store.state.printer.kapat !== undefined
    }

    get sweeping(): boolean {
        const state = this.kapatStatus.activity?.state
        return !!state && state !== 'idle'
    }

    get statusLine(): string {
        if (this.actionStatus !== null) return this.actionStatus
        if (!this.kapatHasData) return this.$t('Kapat.Status.Connecting') as string
        return this.sweeping ? (this.$t('Kapat.Status.Running') as string) : (this.$t('Kapat.Status.Idle') as string)
    }

    get statusError(): boolean {
        return this.actionStatus !== null && this.actionError
    }

    setStatus(text: string, isError = false): void {
        this.actionStatus = text
        this.actionError = isError
    }

    @Watch('sweeping')
    onSweepingChange(sweeping: boolean): void {
        if (this.wasSweeping && !sweeping) {
            if (this.kapatStatus.last?.k_opt != null) this.logHistory()
            this.$socket.emitAndWait('printer.gcode.script', { script: 'M104 S0' }).catch(() => {})
            this.actionStatus = null
        }
        this.wasSweeping = sweeping
    }

    async logHistory(): Promise<void> {
        const entry: KapatHistoryEntry = {
            id: `${Date.now()}`,
            time: new Date().toISOString(),
            temp: this.extruderTemp,
            kOpt: this.kapatStatus.last?.k_opt ?? null,
            source: this.kapatStatus.last?.k_opt_source,
            applied: this.kapatStatus.last?.applied,
            params: kapatSweepState.params,
            filament: kapatSweepState.label || null,
            filamentType: kapatSweepState.filamentType || undefined,
            brand: kapatSweepState.brand || undefined,
            color: kapatSweepState.color || undefined,
        }
        const list = await loadList<KapatHistoryEntry>(this.bridge, 'history')
        list.unshift(entry)
        await saveList(this.bridge, 'history', list.slice(0, 200))
    }

    handleLoadParams(params: KapatSweepParams): void {
        this.sweepParams = { ...this.sweepParams, ...params }
    }

    showConfirm(title: string, text: string): Promise<boolean> {
        this.confirmTitle = title
        this.confirmText = text
        this.confirmVisible = true
        return new Promise((resolve) => {
            this.confirmResolver = resolve
        })
    }

    onConfirmAction(): void {
        this.confirmResolver?.(true)
        this.confirmResolver = null
    }

    @Watch('confirmVisible')
    onConfirmVisibleChange(visible: boolean): void {
        if (!visible && this.confirmResolver) {
            this.confirmResolver(false)
            this.confirmResolver = null
        }
    }

    async runGcode(script: string): Promise<void> {
        await this.$socket.emitAndWait('printer.gcode.script', { script })
    }

    // Home (with confirmation, since it moves the toolhead) if needed, move
    // to the configured calibration position, then heat (also with
    // confirmation, since it's a wait that can take a couple of minutes) if
    // the nozzle is cold -- before finally issuing KAPAT_SWEEP itself.
    // Agreeing to the homing confirmation already implies "go ahead and
    // prep the printer", so the heat confirmation is skipped when homing
    // was just confirmed, and only shown on its own if the printer was
    // already homed.
    async handleStart(params: KapatSweepParams): Promise<void> {
        if (!this.kapatStatus.has_load_cell) {
            this.setStatus(this.$t('Kapat.Status.NoLoadCell') as string, true)
            return
        }
        if (this.preflightBusy || this.sweeping) return
        this.preflightBusy = true
        try {
            const homed = ['x', 'y', 'z'].every((a) => this.homedAxes.includes(a))
            let justHomed = false
            if (!homed) {
                const ok = await this.showConfirm(
                    this.$t('Kapat.Confirm.HomeTitle') as string,
                    this.$t('Kapat.Confirm.HomeBody') as string
                )
                if (!ok) return
                justHomed = true
                this.setStatus(this.$t('Kapat.Status.Homing') as string)
                await this.runGcode('G28')
            }

            this.setStatus(this.$t('Kapat.Status.Moving') as string)
            await this.runGcode(`G1 X${this.calibX} Y${this.calibY} Z${this.calibZ} F3000`)

            const targetTemp = this.profileTemp || 210
            if (this.extruderTemp == null || this.extruderTemp < targetTemp - 5) {
                if (!justHomed) {
                    const ok = await this.showConfirm(
                        this.$t('Kapat.Confirm.HeatTitle') as string,
                        this.$t('Kapat.Confirm.HeatBody', { temp: targetTemp }) as string
                    )
                    if (!ok) return
                }
                this.setStatus(this.$t('Kapat.Status.Heating', { temp: targetTemp }) as string)
                await this.runGcode(`M109 S${targetTemp}`)
            }

            const chart = this.$refs.chart as { reset?: () => void } | undefined
            chart?.reset?.()
            // Snapshot into the module-level singleton, not just local
            // data -- this page can get destroyed and recreated by Vue
            // Router if the user navigates away and back before the
            // sweep finishes (see kapatSweepState.ts), and logHistory()
            // needs this exact snapshot to still be there when it does.
            kapatSweepState.params = params
            kapatSweepState.label = this.profileLabel
            kapatSweepState.filamentType = this.profileFilamentType
            kapatSweepState.brand = this.profileBrand
            kapatSweepState.color = this.profileColor
            this.setStatus(this.$t('Kapat.Status.SweepStarting') as string)
            const cmd = buildSweepCommand({ ...params, filament: this.profileLabel })
            this.runGcode(cmd).catch((err: Error) => {
                this.setStatus(this.$t('Kapat.Status.SweepFailed', { err: err.message }) as string, true)
            })
        } catch (err) {
            this.setStatus(this.$t('Kapat.Status.SweepFailed', { err: (err as Error).message }) as string, true)
        } finally {
            this.preflightBusy = false
        }
    }

    handleApply(k: number): void {
        this.runGcode(buildApplyCommand(k))
            .then(() => this.setStatus(this.$t('Kapat.Status.Applied', { k: Number(k).toFixed(4) }) as string))
            .catch((err: Error) => this.setStatus(this.$t('Kapat.Status.ApplyFailed', { err: err.message }) as string, true))
    }
}
</script>
