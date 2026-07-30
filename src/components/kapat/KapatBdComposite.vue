<template>
    <div v-if="bdPerK.length">
        <div class="kapat-section-title">{{ $t('Kapat.BdComposite.Title') }}</div>

        <div class="kapat-big-k">
            {{ $t('Kapat.BdComposite.RecommendedK') }}
            <span class="warning--text">{{ fmt(composite ? composite.kOpt : null) }}</span>
        </div>

        <div class="kapat-weight-grid mb-2">
            <div v-for="name in weightedMetrics" :key="name">
                <span class="text--disabled" style="font-size: 0.8rem">{{ name }} ({{ fmt(weights[name], 2) }})</span>
                <v-slider v-model="weights[name]" min="0" max="3" step="0.1" hide-details dense />
            </div>
        </div>

        <div ref="chart" style="height: 200px"></div>

        <ul v-if="notes.length" class="text--disabled mt-3" style="font-size: 0.8rem">
            <li v-for="(n, i) in notes" :key="i">{{ n }}</li>
        </ul>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { BdKResult, CompositeResult, recomputeComposite } from '@/lib/kapatBdCost'
import { kapatChartColors } from '@/lib/kapatChartColors'

@Component
export default class KapatBdComposite extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bdPerK: BdKResult[]
    @Prop({ required: true }) declare readonly defaultWeights: Record<string, number>
    @Prop({ default: () => [] }) declare readonly notes: string[]

    weights: Record<string, number> = {}
    plot: uPlot | null = null
    resizeObserver: ResizeObserver | null = null

    get weightedMetrics(): string[] {
        return Object.keys(this.defaultWeights)
    }

    get composite(): CompositeResult | null {
        return this.bdPerK.length ? recomputeComposite(this.bdPerK, this.weights) : null
    }

    fmt(v: number | null | undefined, digits = 4): string {
        return v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits)
    }

    @Watch('defaultWeights', { immediate: true })
    onDefaultWeightsChange(): void {
        if (this.bdPerK.length && Object.keys(this.weights).length === 0) {
            this.weights = { ...this.defaultWeights }
        }
    }

    drawKOptLine = (u: uPlot): void => {
        const kOpt = this.composite?.kOpt
        if (kOpt == null) return
        const x = u.valToPos(kOpt, 'x', true)
        if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return
        const ctx = u.ctx
        ctx.save()
        ctx.strokeStyle = kapatChartColors(this.$vuetify.theme.dark).accentSoft
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, u.bbox.top)
        ctx.lineTo(x, u.bbox.top + u.bbox.height)
        ctx.stroke()
        ctx.restore()
    }

    @Watch('composite')
    onCompositeChange(): void {
        this.drawChart()
    }

    mounted(): void {
        this.drawChart()
    }

    drawChart(): void {
        const el = this.$refs.chart as HTMLElement | undefined
        if (!el || !this.composite) return
        const data: uPlot.AlignedData = [this.composite.ks, this.composite.cost]
        if (this.plot) {
            this.plot.setData(data, true)
            return
        }
        const c = kapatChartColors(this.$vuetify.theme.dark)
        this.plot = new uPlot(
            {
                width: el.clientWidth,
                height: 200,
                legend: { show: false },
                scales: { x: { time: false } },
                axes: [
                    { stroke: c.muted, grid: { stroke: c.grid }, label: 'K' },
                    { stroke: c.muted, grid: { stroke: c.grid }, label: 'composite cost' },
                ],
                series: [{}, { stroke: c.accent, width: 1.5, points: { show: true, size: 4 } }],
                hooks: { draw: [this.drawKOptLine] },
            },
            data,
            el
        )
        this.resizeObserver = new ResizeObserver(() => {
            this.plot?.setSize({ width: el.clientWidth, height: 200 })
        })
        this.resizeObserver.observe(el)
    }

    beforeDestroy(): void {
        if (this.resizeObserver) this.resizeObserver.disconnect()
        if (this.plot) this.plot.destroy()
    }
}
</script>

<style scoped>
/* auto-fill/minmax responds to this container's own width rather than
   the viewport's -- see KapatBdMetricGrid.vue's .kapat-metric-grid
   comment. 8 weighted metrics land as 4 columns x 2 rows on a wide
   panel, filling the available width instead of stacking in one
   narrow column. */
.kapat-weight-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem 1.5rem;
}
@media (max-width: 900px) {
    .kapat-weight-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}
@media (max-width: 500px) {
    .kapat-weight-grid {
        grid-template-columns: 1fr;
    }
}
.kapat-big-k {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 1rem;
}
.kapat-section-title {
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--v-warning-base);
    margin-bottom: 0.9rem;
}
</style>
