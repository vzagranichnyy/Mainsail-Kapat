<template>
    <div v-if="bdPerK.length">
        <div class="kapat-section-title">{{ $t('Kapat.BdMetricGrid.Title') }}</div>
        <div ref="gridContainer" class="kapat-metric-grid">
            <div v-for="name in BD_METRIC_NAMES" :key="name" class="kapat-metric-cell">
                <div class="kapat-metric-label">
                    <span>{{ name }}</span>
                    <span class="warning--text">K_opt={{ fmt(metricKOpt[name]) }}</span>
                </div>
                <div :ref="'grid_' + name" style="height: 140px"></div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { BD_METRIC_NAMES, BdKResult, perMetricKOpt } from '@/lib/kapatBdCost'
import { kapatChartColors } from '@/lib/kapatChartColors'

@Component
export default class KapatBdMetricGrid extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bdPerK: BdKResult[]

    BD_METRIC_NAMES = BD_METRIC_NAMES
    plots: Record<string, uPlot> = {}
    resizeObserver: ResizeObserver | null = null

    get metricKOpt(): Record<string, number | null> {
        return this.bdPerK.length ? perMetricKOpt(this.bdPerK) : {}
    }

    fmt(v: number | null | undefined, digits = 4): string {
        return v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits)
    }

    makeDrawHook(name: string) {
        return (u: uPlot): void => {
            const ctx = u.ctx
            ctx.save()
            ctx.strokeStyle = 'rgba(160,160,160,0.55)'
            ctx.lineWidth = 1
            for (const kr of this.bdPerK) {
                const lo = kr.lo?.[name]
                const hi = kr.hi?.[name]
                if (lo == null || hi == null || Number.isNaN(lo) || Number.isNaN(hi)) continue
                const x = u.valToPos(kr.k, 'x', true)
                const y0 = u.valToPos(lo, 'y', true)
                const y1 = u.valToPos(hi, 'y', true)
                ctx.beginPath()
                ctx.moveTo(x, y0)
                ctx.lineTo(x, y1)
                ctx.stroke()
            }
            const kOpt = this.metricKOpt[name]
            if (kOpt != null && Number.isFinite(kOpt)) {
                const x = u.valToPos(kOpt, 'x', true)
                if (x >= u.bbox.left && x <= u.bbox.left + u.bbox.width) {
                    ctx.strokeStyle = kapatChartColors(this.$vuetify.theme.dark).success
                    ctx.setLineDash([4, 4])
                    ctx.lineWidth = 1.5
                    ctx.beginPath()
                    ctx.moveTo(x, u.bbox.top)
                    ctx.lineTo(x, u.bbox.top + u.bbox.height)
                    ctx.stroke()
                }
            }
            ctx.restore()
        }
    }

    @Watch('bdPerK')
    onDataChange(): void {
        this.drawGrid()
    }

    mounted(): void {
        this.drawGrid()
        const container = this.$refs.gridContainer as HTMLElement | undefined
        if (container) {
            this.resizeObserver = new ResizeObserver(() => this.resizePlots())
            this.resizeObserver.observe(container)
        }
    }

    resizePlots(): void {
        for (const name of BD_METRIC_NAMES) {
            const refs = this.$refs['grid_' + name] as HTMLElement[] | HTMLElement | undefined
            const el = Array.isArray(refs) ? refs[0] : refs
            if (el && this.plots[name]) this.plots[name].setSize({ width: el.clientWidth, height: 140 })
        }
    }

    drawGrid(): void {
        const c = kapatChartColors(this.$vuetify.theme.dark)
        for (const name of BD_METRIC_NAMES) {
            const refs = this.$refs['grid_' + name] as HTMLElement[] | HTMLElement | undefined
            const el = Array.isArray(refs) ? refs[0] : refs
            if (!el) continue
            const ks = this.bdPerK.map((kr) => kr.k)
            const vals = this.bdPerK.map((kr) => kr.medians?.[name] ?? NaN)
            const data: uPlot.AlignedData = [ks, vals]
            if (this.plots[name]) {
                this.plots[name].setData(data, true)
                continue
            }
            this.plots[name] = new uPlot(
                {
                    width: el.clientWidth,
                    height: 140,
                    legend: { show: false },
                    scales: { x: { time: false } },
                    axes: [
                        { stroke: c.muted, grid: { stroke: c.grid }, size: 30 },
                        { stroke: c.muted, grid: { stroke: c.grid }, size: 40 },
                    ],
                    series: [{}, { stroke: c.accent, width: 1.3, points: { show: true, size: 3 } }],
                    hooks: { draw: [this.makeDrawHook(name)] },
                },
                data,
                el
            )
        }
    }

    beforeDestroy(): void {
        if (this.resizeObserver) this.resizeObserver.disconnect()
        for (const name of Object.keys(this.plots)) this.plots[name].destroy()
    }
}
</script>

<style scoped>
.kapat-section-title {
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--v-warning-base);
    margin-bottom: 0.9rem;
}
/* auto-fill/minmax responds to this container's own width, not the
   viewport's -- a fixed column count plus viewport-width media queries
   (the previous approach) doesn't react to the sidebar expanding/
   collapsing, since that changes how much width THIS panel actually has
   without changing the viewport itself, leaving stale columns that
   overflow the panel. */
.kapat-metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 0.6rem;
}
.kapat-metric-cell {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.4rem 0.5rem;
}
.kapat-metric-label {
    font-size: 0.72rem;
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.2rem;
}
</style>
