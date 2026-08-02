<template>
    <panel :title="$t('Kapat.LiveChart.Title')" card-class="kapat-live-chart" :margin-bottom="true" :collapsible="collapsible">
        <template #buttons>
            <v-menu :offset-y="true" :close-on-content-click="false">
                <template #activator="{ on, attrs }">
                    <v-btn icon tile v-bind="attrs" v-on="on">
                        <v-icon small>{{ mdiCog }}</v-icon>
                    </v-btn>
                </template>
                <v-list>
                    <v-list-item class="minHeight36">
                        <v-checkbox v-model="smoothEnabled" class="mt-0" hide-details :label="$t('Kapat.LiveChart.Smooth').toString()" />
                    </v-list-item>
                    <v-list-item class="minHeight36 flex-column align-start">
                        <span class="text--disabled" style="font-size: 0.78rem">
                            {{ $t('Kapat.LiveChart.SmoothWindow') }}: {{ avgWindowMs }}ms
                        </span>
                        <v-slider v-model="avgWindowMs" min="0" max="3000" step="20" :disabled="!smoothEnabled" hide-details dense style="width: 220px" />
                    </v-list-item>
                    <v-list-item class="minHeight36 flex-column align-start">
                        <span class="text--disabled" style="font-size: 0.78rem">{{ $t('Kapat.LiveChart.Buffer') }}: {{ bufferSeconds }}s</span>
                        <v-slider v-model="bufferSeconds" min="3" max="30" step="1" hide-details dense style="width: 220px" />
                    </v-list-item>
                </v-list>
            </v-menu>
        </template>
        <div class="kapat-chart-wrap">
            <span class="text--disabled kapat-chart-axis-label">{{ $t('Kapat.LiveChart.AxisLabel') }}</span>
            <div ref="container" class="kapat-chart-canvas"></div>
        </div>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import ThemeMixin from '@/components/mixins/theme'
import { KlippyBridge } from '@/lib/kapatBridge'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { mdiCog } from '@mdi/js'

const CHART_HEIGHT = 224

@Component
export default class KapatLiveChart extends Mixins(BaseMixin, ThemeMixin) {
    @Prop({ required: true }) declare readonly bridge: KlippyBridge
    @Prop({ default: 'load_cell' }) declare readonly sensorName: string
    @Prop({ type: Boolean, default: false }) declare readonly collapsible: boolean

    mdiCog = mdiCog

    plot: uPlot | null = null
    unsubscribe: (() => void) | null = null
    subscribedSensor: string | null = null
    resizeObserver: ResizeObserver | null = null
    tickTimer: number | null = null

    xs: number[] = []
    ys: number[] = []
    smoothedYs: number[] = []
    t0: number | null = null
    dirty = false

    // Cascaded-EMA running state -- see pushSample() for the algorithm.
    private stageValues: number[] | null = null
    private lastSampleRelT: number | null = null

    // Persisted as a Mainsail UI setting (same gui/saveSetting mechanism
    // TemperaturePanelSettings.vue uses) rather than plain component
    // data, so the smoothing/buffer knobs survive a reload instead of
    // resetting to their defaults every time.
    get smoothEnabled(): boolean {
        return this.$store.state.gui.view.kapatChart.smoothEnabled
    }

    set smoothEnabled(value: boolean) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.kapatChart.smoothEnabled', value })
    }

    get avgWindowMs(): number {
        return this.$store.state.gui.view.kapatChart.avgWindowMs
    }

    set avgWindowMs(value: number) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.kapatChart.avgWindowMs', value })
    }

    get bufferSeconds(): number {
        return this.$store.state.gui.view.kapatChart.bufferSeconds
    }

    set bufferSeconds(value: number) {
        this.$store.dispatch('gui/saveSetting', { name: 'view.kapatChart.bufferSeconds', value })
    }

    // Axis chrome (grid lines, tick labels) reuses the same
    // theme-derived colors as Mainsail's own TempChart.vue
    // (fgColorFaint/fgColorLow via ThemeMixin) so this chart reads as
    // part of the same visual system instead of a bolted-on widget with
    // its own hardcoded palette. `smoothed` uses Vuetify's theme
    // `success` color -- the same green used everywhere else in
    // Mainsail for a positive/good readout -- per explicit request to
    // match "the green from Mainsail" instead of KAPAT's own tan/brown.
    get colors() {
        return {
            muted: this.fgColorLow,
            grid: this.fgColorFaint,
            raw: 'rgba(201,138,82,0.2)',
            smoothed: this.$vuetify.theme.currentTheme.success as string,
        }
    }

    @Watch('bridge', { immediate: true })
    @Watch('sensorName')
    onBridgeOrSensorChange(): void {
        if (!this.bridge || !this.sensorName || this.subscribedSensor === this.sensorName) return
        if (this.unsubscribe) this.unsubscribe()
        this.unsubscribe = this.bridge.subscribeLoadCellForce(this.sensorName, (t: number, force_g: number) =>
            this.pushSample(t, force_g)
        )
        this.subscribedSensor = this.sensorName
    }

    // The raw trace is only useful as a reference while smoothing is
    // off -- with it on, the raw series' own noise visually swamps the
    // clean averaged line sitting inside it (spikes all around the main
    // curve), so hide the raw series whenever the smoothed one is shown
    // instead of layering both.
    @Watch('smoothEnabled')
    onSmoothToggle(show: boolean): void {
        this.plot?.setSeries(1, { show: !show })
        this.plot?.setSeries(2, { show })
        this.dirty = true
    }

    @Watch('bufferSeconds')
    onBufferChange(): void {
        this.dirty = true
    }

    // Unlike bufferSeconds, changing the smoothing window resmooths the
    // whole *visible* buffer once (mirrors autopa's LiveChart.svelte --
    // "a static one-time transient that scrolls off"), not just future
    // samples -- otherwise the curve would show an abrupt kink where old
    // (differently-smoothed) history meets new, and dragging the slider
    // wouldn't visibly do anything until enough new samples arrived to
    // scroll the old ones out. `stages` resets so this replay starts
    // clean rather than continuing from state computed under the old
    // alpha.
    @Watch('avgWindowMs')
    onWindowChange(): void {
        const n = this.xs.length
        if (n === 0) return
        this.stageValues = null
        // Use the buffer's own average sample interval for this one-time
        // replay's alpha -- currentAlpha(dt=0) means "no smoothing at
        // all" (see its own comment), which is only correct for the
        // very first live sample, not for reprocessing history.
        const avgDt = n > 1 ? (this.xs[n - 1] - this.xs[0]) / (n - 1) : 0
        const alpha = this.currentAlpha(avgDt)
        for (let i = 0; i < n; i++) {
            this.smoothedYs[i] = this.stepCascade(this.ys[i], alpha)
        }
        this.dirty = true
    }

    // Minimum number of samples to let age past `bufferSeconds` before
    // actually trimming the arrays -- trimming is an O(remaining
    // length) array copy (.slice()), and doing it on literally every
    // single incoming sample (the previous behavior) meant that cost
    // scaled with *both* the load cell's sample rate *and*
    // bufferSeconds at once. Batching it means the buffer briefly holds
    // up to this many samples more than bufferSeconds asks for, which
    // is invisible for a live strip-chart.
    private static readonly TRIM_BATCH = 32

    // 3 cascaded EMA passes (each stage's output feeds the next) instead
    // of a single pole -- ported from autopa's LiveChart.svelte after
    // its "smooth" line visibly looked much cleaner than a single-EMA
    // pass at a comparable settling time. A single pole's frequency
    // response rolls off gently (6dB/octave); cascading gives a much
    // steeper rolloff for the same nominal time constant, which is
    // exactly the "still looks jerky" gap a plain EMA couldn't close
    // without pushing the window uncomfortably long. Kept the existing
    // ms-based "smoothing window" framing (autopa instead exposes a
    // unitless 0-1 "strength" slider mapped exponentially to alpha) --
    // avgWindowMs still maps to a time constant, just fed through the
    // cascade 3 times per sample instead of once.
    private static readonly STAGES = 3

    private currentAlpha(dt = 0): number {
        const tau = Math.max(this.avgWindowMs, 1) / 1000
        return dt > 0 ? 1 - Math.exp(-dt / tau) : 1
    }

    private stepCascade(x: number, alpha: number): number {
        if (this.stageValues === null) this.stageValues = new Array(KapatLiveChart.STAGES).fill(x)
        let v = x
        for (let k = 0; k < KapatLiveChart.STAGES; k++) {
            this.stageValues[k] += alpha * (v - this.stageValues[k])
            v = this.stageValues[k]
        }
        return v
    }

    pushSample(t: number, force_g: number): void {
        if (this.t0 === null) this.t0 = t
        const rel = t - this.t0

        // O(1) per sample (well, O(STAGES)) regardless of buffer size or
        // window length -- replaces a previous from-scratch boxcar-
        // average recompute (an O(n) two-pointer sweep over the *entire*
        // buffer, redone every 50ms tick regardless of how many new
        // samples actually arrived). That became a real, visible
        // whole-Mainsail-UI performance problem once bufferSeconds was
        // pushed past a few seconds on a load cell sampling at a real
        // rate: both that recompute and the per-sample buffer trim
        // below scaled directly with buffer size and ran up to
        // 20x/second.
        const dt = this.lastSampleRelT === null ? 0 : rel - this.lastSampleRelT
        this.lastSampleRelT = rel
        const smoothed = this.stepCascade(force_g, this.currentAlpha(dt))

        this.xs.push(rel)
        this.ys.push(force_g)
        this.smoothedYs.push(smoothed)

        const floor = rel - this.bufferSeconds
        let cut = 0
        while (cut < this.xs.length && this.xs[cut] < floor) cut++
        if (cut >= KapatLiveChart.TRIM_BATCH) {
            this.xs = this.xs.slice(cut)
            this.ys = this.ys.slice(cut)
            this.smoothedYs = this.smoothedYs.slice(cut)
        }
        this.dirty = true
    }

    tick(): void {
        if (this.dirty && this.plot) {
            this.plot.setData([this.xs, this.ys, this.smoothedYs], true)
            this.dirty = false
        }
    }

    mounted(): void {
        const container = this.$refs.container as HTMLElement
        const c = this.colors
        this.plot = new uPlot(
            {
                width: container.clientWidth,
                height: CHART_HEIGHT,
                legend: { show: false },
                cursor: { show: true },
                scales: { x: { time: false } },
                axes: [
                    { stroke: c.muted, grid: { stroke: c.grid } },
                    { stroke: c.muted, grid: { stroke: c.grid } },
                ],
                series: [
                    {},
                    { label: 'force', stroke: c.raw, width: 1, points: { show: false }, show: !this.smoothEnabled },
                    { label: 'smoothed', stroke: c.smoothed, width: 2, points: { show: false }, show: this.smoothEnabled },
                ],
            },
            [[], [], []],
            container
        )

        this.resizeObserver = new ResizeObserver(() => {
            this.plot?.setSize({ width: container.clientWidth, height: CHART_HEIGHT })
        })
        this.resizeObserver.observe(container)

        // A plain interval rather than a self-rescheduling
        // requestAnimationFrame chain -- this is a background instrument
        // readout, not something that needs vsync-precision, and a fixed
        // ~20fps tick is plenty smooth for a strip-chart while being
        // simpler and more robust than juggling rAF handles across
        // Vue's reactivity/component lifecycle.
        this.tickTimer = window.setInterval(() => this.tick(), 50)
    }

    beforeDestroy(): void {
        if (this.unsubscribe) this.unsubscribe()
        if (this.tickTimer !== null) window.clearInterval(this.tickTimer)
        if (this.resizeObserver) this.resizeObserver.disconnect()
        if (this.plot) this.plot.destroy()
    }

    reset(): void {
        this.xs = []
        this.ys = []
        this.smoothedYs = []
        this.t0 = null
        this.stageValues = null
        this.lastSampleRelT = null
        this.dirty = true
    }
}
</script>

<style scoped>
.kapat-chart-wrap {
    position: relative;
    width: 100%;
    height: 224px;
}
.kapat-chart-canvas {
    width: 100%;
    height: 100%;
}
/* Positioned like ECharts' yAxis.name in TempChart.vue (top-left,
   "Name [unit]") instead of uPlot's own rotated axis label, so this
   chart's header reads the same way as the temperature chart next to
   it on the main dashboard. */
.kapat-chart-axis-label {
    position: absolute;
    top: 4px;
    left: 48px;
    font-size: 0.7rem;
    pointer-events: none;
    z-index: 1;
}
</style>
