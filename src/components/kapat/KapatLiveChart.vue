<template>
    <panel :title="$t('Kapat.LiveChart.Title')" card-class="kapat-live-chart" :margin-bottom="true">
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
                        <v-slider v-model="avgWindowMs" min="0" max="400" step="10" :disabled="!smoothEnabled" hide-details dense style="width: 220px" />
                    </v-list-item>
                    <v-list-item class="minHeight36 flex-column align-start">
                        <span class="text--disabled" style="font-size: 0.78rem">{{ $t('Kapat.LiveChart.Buffer') }}: {{ bufferSeconds }}s</span>
                        <v-slider v-model="bufferSeconds" min="3" max="30" step="1" hide-details dense style="width: 220px" />
                    </v-list-item>
                </v-list>
            </v-menu>
        </template>
        <div ref="container" class="kapat-chart-wrap"></div>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KlippyBridge } from '@/lib/kapatBridge'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { mdiCog } from '@mdi/js'

const CHART_HEIGHT = 224

@Component
export default class KapatLiveChart extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bridge: KlippyBridge
    @Prop({ default: 'load_cell' }) declare readonly sensorName: string

    mdiCog = mdiCog

    plot: uPlot | null = null
    unsubscribe: (() => void) | null = null
    subscribedSensor: string | null = null
    resizeObserver: ResizeObserver | null = null
    tickTimer: number | null = null

    xs: number[] = []
    ys: number[] = []
    t0: number | null = null
    dirty = false

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

    get colors() {
        const dark = this.$vuetify.theme.dark
        return {
            muted: dark ? '#8a8d91' : '#5f6368',
            grid: dark ? '#2c2f33' : '#dcdfe3',
            raw: 'rgba(201,138,82,0.2)',
            smoothed: dark ? '#e0b98c' : '#b3701f',
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

    @Watch('smoothEnabled')
    onSmoothToggle(show: boolean): void {
        this.plot?.setSeries(2, { show })
        this.dirty = true
    }

    @Watch('avgWindowMs')
    @Watch('bufferSeconds')
    onKnobChange(): void {
        this.dirty = true
    }

    pushSample(t: number, force_g: number): void {
        if (this.t0 === null) this.t0 = t
        const rel = t - this.t0
        this.xs.push(rel)
        this.ys.push(force_g)
        let cut = 0
        const floor = rel - this.bufferSeconds
        while (cut < this.xs.length && this.xs[cut] < floor) cut++
        if (cut > 0) {
            this.xs = this.xs.slice(cut)
            this.ys = this.ys.slice(cut)
        }
        this.dirty = true
    }

    // Time-windowed moving average -- averages together every raw sample
    // within +-halfWindow seconds of each point (the load cell's rate
    // varies by sensor/config, so "N samples" isn't a stable notion of
    // "how much time"). O(n) via a two-pointer sweep since xs is
    // monotonically increasing.
    computeSmoothed(xs: number[], ys: number[], windowMs: number): number[] {
        const n = xs.length
        if (windowMs <= 0 || n === 0) return ys
        const half = windowMs / 2000
        const out = new Array(n)
        let lo = 0,
            hi = 0,
            sum = 0
        for (let i = 0; i < n; i++) {
            while (hi < n && xs[hi] <= xs[i] + half) {
                sum += ys[hi]
                hi++
            }
            while (lo < i && xs[lo] < xs[i] - half) {
                sum -= ys[lo]
                lo++
            }
            out[i] = sum / (hi - lo)
        }
        return out
    }

    tick(): void {
        if (this.dirty && this.plot) {
            const smoothed = this.smoothEnabled ? this.computeSmoothed(this.xs, this.ys, this.avgWindowMs) : this.ys
            this.plot.setData([this.xs, this.ys, smoothed], true)
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
                    { stroke: c.muted, grid: { stroke: c.grid }, label: 'force (g)' },
                ],
                series: [
                    {},
                    { label: 'force', stroke: c.raw, width: 1, points: { show: false } },
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
        this.t0 = null
        this.dirty = true
    }
}
</script>

<style scoped>
.kapat-chart-wrap {
    width: 100%;
    height: 224px;
}
</style>
