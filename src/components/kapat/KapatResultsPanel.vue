<template>
    <div v-if="perK.length">
        <div class="kapat-section-title">{{ $t('Kapat.ResultsPanel.FitsTitle') }}</div>
        <p class="text--disabled" style="font-size: 0.82rem">{{ $t('Kapat.ResultsPanel.FitsBody') }}</p>
        <div class="kapat-fit-grid">
            <div v-for="f in FITS" :key="f.key" class="kapat-fit-cell">
                <div class="d-flex justify-space-between" style="font-size: 0.78rem">
                    <span>{{ $t(f.titleKey) }}</span>
                    <span class="warning--text">K_opt={{ fmt(last[f.key] ? last[f.key].k_opt : null) }}</span>
                </div>
                <div class="text--disabled mb-1" style="font-size: 0.7rem">
                    slope={{ fmt(last[f.key] ? last[f.key].slope : null, 2) }} · R²={{
                        fmt(last[f.key] ? last[f.key].r_squared : null, 3)
                    }}
                </div>
                <div :ref="'fit_' + f.key" style="height: 170px"></div>
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
import { kapatChartColors } from '@/lib/kapatChartColors'

interface KapatFit {
    k_opt: number
    slope: number
    intercept: number
    r_squared: number
}

interface KapatPerK {
    k: number
    phase_lag_ms?: number
    integral_area?: number
    integral_area_legacy?: number
    [key: string]: unknown
}

interface KapatLast {
    k_opt?: number | null
    per_k?: KapatPerK[]
    notes?: string[]
    phase_fit?: KapatFit
    integral_fit?: KapatFit
    integral_legacy_fit?: KapatFit
    [key: string]: unknown
}

const FITS = [
    { key: 'phase_fit', metric: 'phase_lag_ms', titleKey: 'Kapat.ResultsPanel.PhaseFit', yLabel: 'lag (ms)' },
    { key: 'integral_fit', metric: 'integral_area', titleKey: 'Kapat.ResultsPanel.IntegralFit', yLabel: 'area' },
    {
        key: 'integral_legacy_fit',
        metric: 'integral_area_legacy',
        titleKey: 'Kapat.ResultsPanel.IntegralLegacyFit',
        yLabel: 'area (legacy)',
    },
] as const

@Component
export default class KapatResultsPanel extends Mixins(BaseMixin) {
    @Prop({ default: null }) declare readonly last: KapatLast | null

    FITS = FITS
    plots: Record<string, uPlot> = {}

    get perK(): KapatPerK[] {
        return this.last?.per_k ?? []
    }

    fmt(v: number | null | undefined, digits = 4): string {
        return v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits)
    }

    makeFitDrawHook(fitKey: string) {
        return (u: uPlot): void => {
            const fit = this.last?.[fitKey] as KapatFit | undefined
            if (!fit || !Number.isFinite(fit.slope)) return
            const ctx = u.ctx
            ctx.save()
            const xMin = u.scales.x.min as number
            const xMax = u.scales.x.max as number
            const y0 = fit.slope * xMin + fit.intercept
            const y1 = fit.slope * xMax + fit.intercept
            const px0 = u.valToPos(xMin, 'x', true)
            const px1 = u.valToPos(xMax, 'x', true)
            const py0 = u.valToPos(y0, 'y', true)
            const py1 = u.valToPos(y1, 'y', true)
            const c = kapatChartColors(this.$vuetify.theme.dark)
            ctx.strokeStyle = c.accentSoft
            ctx.setLineDash([5, 4])
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(px0, py0)
            ctx.lineTo(px1, py1)
            ctx.stroke()

            if (Number.isFinite(fit.k_opt)) {
                const mx = u.valToPos(fit.k_opt, 'x', true)
                const my = u.valToPos(0, 'y', true)
                ctx.setLineDash([])
                ctx.strokeStyle = c.success
                ctx.lineWidth = 2
                const r = 5
                ctx.beginPath()
                ctx.moveTo(mx - r, my - r)
                ctx.lineTo(mx + r, my + r)
                ctx.moveTo(mx - r, my + r)
                ctx.lineTo(mx + r, my - r)
                ctx.stroke()
            }
            ctx.restore()
        }
    }

    @Watch('last')
    onLastChange(): void {
        this.$nextTick(() => this.drawFitCharts())
    }

    mounted(): void {
        this.drawFitCharts()
    }

    drawFitCharts(): void {
        const c = kapatChartColors(this.$vuetify.theme.dark)
        for (const f of FITS) {
            const refs = this.$refs['fit_' + f.key] as HTMLElement[] | HTMLElement | undefined
            const el = Array.isArray(refs) ? refs[0] : refs
            if (!el) continue
            const ks = this.perK.map((r) => r.k)
            const vals = this.perK.map((r) => (r[f.metric] as number) ?? NaN)
            const data: uPlot.AlignedData = [ks, vals]
            if (this.plots[f.key]) {
                this.plots[f.key].setData(data, true)
                continue
            }
            this.plots[f.key] = new uPlot(
                {
                    width: el.clientWidth,
                    height: 170,
                    legend: { show: false },
                    scales: { x: { time: false } },
                    axes: [
                        { stroke: c.muted, grid: { stroke: c.grid }, size: 30, label: 'K' },
                        { stroke: c.muted, grid: { stroke: c.grid }, size: 44, label: f.yLabel },
                    ],
                    series: [{}, { stroke: c.accent, width: 1.3, points: { show: true, size: 4 } }],
                    hooks: { draw: [this.makeFitDrawHook(f.key)] },
                },
                data,
                el
            )
            const ro = new ResizeObserver(() => this.plots[f.key].setSize({ width: el.clientWidth, height: 170 }))
            ro.observe(el)
        }
    }

    beforeDestroy(): void {
        for (const key of Object.keys(this.plots)) this.plots[key].destroy()
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

/* auto-fill/minmax responds to this container's own width rather than
   the viewport's, so the grid stays correct when the sidebar expands/
   collapses -- see KapatBdMetricGrid.vue's .kapat-metric-grid comment. */
.kapat-fit-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
}
.kapat-fit-cell {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
}
</style>
