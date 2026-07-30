<template>
    <div>
        <div class="kapat-section-title">{{ $t('Kapat.AnalysisPanel.Title') }}</div>
        <div>
            <div class="d-flex align-center" style="gap: 0.5rem">
                <v-select
                    :value="selectedId"
                    :items="captureItems"
                    item-text="text"
                    item-value="value"
                    :placeholder="$t('Kapat.AnalysisPanel.Capture')"
                    outlined
                    dense
                    hide-details="auto"
                    style="flex: 1; min-width: 0"
                    @change="selectCapture" />
                <v-btn small outlined color="error" :disabled="!captures.length || deletingAll" @click="deleteAll">
                    {{ $t('Kapat.AnalysisPanel.DeleteAll') }}
                </v-btn>
            </div>

            <p v-if="loadingList" class="text--disabled mt-2">{{ $t('Kapat.AnalysisPanel.LoadingList') }}</p>
            <p v-else-if="!captures.length" class="text--disabled mt-2">{{ $t('Kapat.AnalysisPanel.NoCaptures') }}</p>
            <p v-if="loadError" class="error--text mt-2">{{ $t('Kapat.AnalysisPanel.LoadError', { err: loadError }) }}</p>
            <p v-if="loadingCapture" class="text--disabled mt-2">{{ $t('Kapat.AnalysisPanel.LoadingCapture') }}</p>

            <template v-if="capture">
                <p v-if="capture.meta.wobble === 0" class="error--text mt-2">
                    {{ $t('Kapat.AnalysisPanel.CapturedNoPa') }}
                </p>

                <div class="kapat-bd-browser">
                    <div class="kapat-bd-k-list">
                        <div
                            v-for="s in ksSummary"
                            :key="s.k"
                            class="kapat-bd-k-row"
                            :class="{ active: isSelectedK(s.k), 'k-opt': isKOpt(s.k) }"
                            @click="selectK(s.k)">
                            <span>{{ s.k.toFixed(4) }}</span>
                            <span :class="segColorClass(s)">{{ s.included }}/{{ s.total }}</span>
                        </div>
                    </div>

                    <div class="kapat-bd-segment-pane">
                        <p v-if="!segsForK.length" class="text--disabled">{{ $t('Kapat.AnalysisPanel.NoCaptures') }}</p>
                        <template v-else>
                            <div class="d-flex flex-column" style="gap: 0.5rem; margin-bottom: 0.6rem">
                                <div class="d-flex align-center" style="gap: 0.75rem">
                                    <v-btn x-small outlined :disabled="selectedSegIdx === 0" @click="prevSeg">
                                        {{ $t('Kapat.AnalysisPanel.Prev') }}
                                    </v-btn>
                                    <span class="flex-grow-1 text-center" style="font-size: 0.82rem">
                                        {{
                                            $t('Kapat.AnalysisPanel.Segment', {
                                                i: selectedSegIdx + 1,
                                                n: segsForK.length,
                                            })
                                        }}
                                    </span>
                                    <v-btn x-small outlined :disabled="selectedSegIdx === segsForK.length - 1" @click="nextSeg">
                                        {{ $t('Kapat.AnalysisPanel.Next') }}
                                    </v-btn>
                                </div>
                                <div v-if="activeSeg && !activeSeg.included" class="kapat-bd-excluded">
                                    {{ $t('Kapat.AnalysisPanel.Excluded', { reason: activeSeg.exclude_reason || '' }) }}
                                </div>
                                <div class="d-flex flex-wrap" style="gap: 0.6rem 0.9rem">
                                    <v-checkbox
                                        v-model="showTransitions"
                                        :label="$t('Kapat.AnalysisPanel.ToggleTransitions').toString()"
                                        hide-details
                                        dense
                                        class="ma-0" />
                                    <v-checkbox v-model="showLevels" label="baseline/plateau" hide-details dense class="ma-0" />
                                    <v-checkbox
                                        v-model="showRegions"
                                        :label="$t('Kapat.AnalysisPanel.ToggleRegions').toString()"
                                        hide-details
                                        dense
                                        class="ma-0" />
                                    <v-checkbox
                                        v-model="showPeaks"
                                        :label="$t('Kapat.AnalysisPanel.TogglePeaks').toString()"
                                        hide-details
                                        dense
                                        class="ma-0" />
                                    <v-checkbox
                                        v-model="showLabels"
                                        :label="$t('Kapat.AnalysisPanel.ToggleLabels').toString()"
                                        hide-details
                                        dense
                                        class="ma-0" />
                                </div>
                            </div>

                            <div ref="chart" class="kapat-segment-chart"></div>

                            <div class="d-flex flex-wrap mt-2" style="gap: 0.9rem">
                                <span v-for="r in regions" :key="r.name" class="d-flex align-center text--disabled" style="gap: 0.35rem; font-size: 0.74rem">
                                    <span class="kapat-swatch" :style="{ background: r.color }"></span>{{ r.name }}
                                </span>
                            </div>

                            <div v-if="statsBlocks.length" class="kapat-bd-stats">
                                <div v-for="b in statsBlocks" :key="b.name" class="kapat-bd-region" :style="{ borderLeftColor: b.color }">
                                    <div class="kapat-region-name" :style="{ color: b.color }">{{ b.name }}</div>
                                    <div v-for="[name, val] in b.rows" :key="name" class="d-flex justify-space-between text--disabled" style="font-size: 0.72rem">
                                        <span>{{ name }}</span>
                                        <span>{{ fmt(val) }}</span>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>

                <p class="text--disabled mt-3" style="font-size: 0.8rem">
                    {{ capture.meta.n_samples }} {{ $t('Kapat.AnalysisPanel.NSamples') }} · TSLOW={{ capture.meta.tslow }} TFAST={{
                        capture.meta.tfast
                    }}
                </p>
            </template>
        </div>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { KlippyBridge } from '@/lib/kapatBridge'
import { kapatChartColors } from '@/lib/kapatChartColors'

interface KapatSegment {
    k: number
    included: boolean
    exclude_reason?: string
    t_start: number
    t_rise: number
    t_fall: number
    t_end: number
    metrics?: Record<string, number>
}

interface KapatCaptureMeta {
    ks: number[]
    cycles: number
    k_opt?: number
    kstep?: number
    wobble: number
    wobble_axis?: string
    vfr: number
    vfr_low: number
    filament?: string
    temp?: number
    n_samples: number
    tslow: number
    tfast: number
    segments: KapatSegment[]
}

interface KapatCaptureListItem {
    id: string
    created?: number
    wobble: number
    wobble_axis?: string
    filament?: string
    temp?: number
    vfr_low: number
    vfr: number
    cycles: number
    ks?: number[]
}

interface KapatCapture {
    meta: KapatCaptureMeta
    t: number[]
    force: number[]
}

interface KSummary {
    k: number
    included: number
    total: number
}

interface Region {
    name: string
    from: number
    to: number
    color: string
}

const REGION_METRICS: [string, string[]][] = [
    ['1 · baseline', ['baseline_median', 'baseline_noise_std']],
    ['2 · rise_edge', ['rise_delay', 'rise_error_area']],
    ['3 · overshoot', ['overshoot']],
    ['4 · plateau', ['high_level']],
    ['5 · plateau_creep', ['plateau_slope', 'plateau_creep']],
    ['6 · fall_edge', ['fall_delay', 'fall_error_area']],
    ['7 · undershoot', ['undershoot']],
    ['8 · tail', ['tail_area', 'settling_time']],
]

const REGION_LEGEND_COLOR = [
    'rgba(160,160,160,0.9)',
    'rgba(61,139,253,0.9)',
    'rgba(155,107,222,0.9)',
    'rgba(210,153,34,0.9)',
    'rgba(224,185,140,0.9)',
    'rgba(240,71,71,0.9)',
    'rgba(224,90,155,0.9)',
    'rgba(77,208,196,0.9)',
]

@Component
export default class KapatAnalysisPanel extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bridge: KlippyBridge

    captures: KapatCaptureListItem[] = []
    loadingList = false
    selectedId = ''

    capture: KapatCapture | null = null
    loadingCapture = false
    loadError = ''
    deletingAll = false

    selectedK: number | null = null
    selectedSegIdx = 0

    showTransitions = true
    showLevels = true
    showRegions = false
    showPeaks = true
    showLabels = false

    plot: uPlot | null = null
    resizeObserver: ResizeObserver | null = null

    mounted(): void {
        window.addEventListener('focus', this.loadList)
        window.addEventListener('keydown', this.onKeydown)
    }

    beforeDestroy(): void {
        window.removeEventListener('focus', this.loadList)
        window.removeEventListener('keydown', this.onKeydown)
        if (this.resizeObserver) this.resizeObserver.disconnect()
        if (this.plot) this.plot.destroy()
    }

    @Watch('bridge', { immediate: true })
    onBridgeChange(): void {
        if (this.bridge) this.loadList()
    }

    async loadList(): Promise<void> {
        if (!this.bridge) return
        this.loadingList = true
        try {
            this.captures = (await this.bridge.listCaptures()) as KapatCaptureListItem[]
        } catch (err) {
            this.loadError = (err as Error).message
        } finally {
            this.loadingList = false
        }
    }

    async deleteAll(): Promise<void> {
        if (!this.captures.length || !window.confirm(this.$t('Kapat.AnalysisPanel.ConfirmDeleteAll') as string)) return
        this.deletingAll = true
        try {
            await this.bridge.deleteAllCaptures()
            this.captures = []
            this.selectedId = ''
            this.capture = null
            this.$toast.success(this.$t('Kapat.AnalysisPanel.DeletedAllToast').toString())
        } catch (err) {
            this.loadError = (err as Error).message
        } finally {
            this.deletingAll = false
        }
    }

    get captureItems() {
        return this.captures.map((c) => ({ value: c.id, text: this.fmtCaptureLabel(c) }))
    }

    async selectCapture(id: string): Promise<void> {
        this.selectedId = id
        this.capture = null
        this.loadError = ''
        if (!id) return
        this.loadingCapture = true
        try {
            this.capture = (await this.bridge.getCapture(id)) as KapatCapture
            this.selectedK = this.capture.meta.ks?.[0] ?? null
            this.selectedSegIdx = 0
        } catch (err) {
            this.loadError = (err as Error).message
        } finally {
            this.loadingCapture = false
        }
        this.$nextTick(() => this.drawChart())
    }

    fmtCaptureLabel(c: KapatCaptureListItem): string {
        const date = new Date(c.created ?? Number(c.id)).toLocaleString()
        const wob = c.wobble > 0 ? `${c.wobble_axis}-wobble ${c.wobble}mm` : 'PURE-E'
        const filament = c.filament ? `${c.filament} @${Math.round(c.temp ?? 0)}°C — ` : ''
        return `${filament}${date} — VFR ${c.vfr_low}/${c.vfr}, ${c.cycles}x, ${(c.ks || []).length} K, ${wob}`
    }

    fmt(v: number | null | undefined, digits = 3): string {
        return v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits)
    }

    get allSegments(): KapatSegment[] {
        return Array.isArray(this.capture?.meta?.segments) ? (this.capture as KapatCapture).meta.segments : []
    }

    get ksSummary(): KSummary[] {
        return (this.capture?.meta?.ks || []).map((k) => {
            const segs = this.allSegments.filter((c) => Math.abs(c.k - k) < 1e-9)
            const included = segs.filter((c) => c.included).length
            return { k, included, total: segs.length }
        })
    }

    isSelectedK(k: number): boolean {
        return this.selectedK !== null && Math.abs(k - this.selectedK) < 1e-9
    }

    segColorClass(s: KSummary): string {
        if (!s.total) return 'error--text'
        const frac = s.included / s.total
        return frac >= 0.75 ? 'success--text' : frac >= 0.4 ? 'warning--text' : 'error--text'
    }

    isKOpt(k: number): boolean {
        const kOpt = this.capture?.meta?.k_opt
        if (kOpt == null) return false
        const tol = (this.capture?.meta?.kstep || 0.005) * 0.5
        return Math.abs(k - kOpt) <= tol
    }

    selectK(k: number): void {
        this.selectedK = k
        this.selectedSegIdx = 0
    }

    get segsForK(): KapatSegment[] {
        if (this.selectedK === null) return []
        return this.allSegments.filter((c) => Math.abs(c.k - (this.selectedK as number)) < 1e-9)
    }

    get activeSeg(): KapatSegment | null {
        if (this.selectedSegIdx >= this.segsForK.length) return this.segsForK[0] || null
        return this.segsForK[this.selectedSegIdx] || null
    }

    prevSeg(): void {
        if (this.selectedSegIdx > 0) this.selectedSegIdx -= 1
    }

    nextSeg(): void {
        if (this.selectedSegIdx < this.segsForK.length - 1) this.selectedSegIdx += 1
    }

    onKeydown(e: KeyboardEvent): void {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
        if (!this.segsForK.length) return
        if (e.key === 'ArrowLeft') this.prevSeg()
        else if (e.key === 'ArrowRight') this.nextSeg()
    }

    // The five regions bd_pressure.py's bd_segment_metrics actually
    // computes over (rise_frac/fall_frac=0.2, hardcoded there) --
    // replicated as-is so the shading matches what the metrics function
    // really measured.
    regionsFor(c: KapatSegment | null): Region[] {
        if (!c) return []
        const highDur = c.t_fall - c.t_rise
        const tailDur = c.t_end - c.t_fall
        const riseEdgeEnd = c.t_rise + Math.max(highDur * 0.2, 1e-3)
        const fallEdgeEnd = c.t_fall + Math.max(tailDur * 0.2, 1e-3)
        return [
            { name: 'baseline', from: c.t_start, to: c.t_rise, color: 'rgba(140,140,140,0.10)' },
            { name: 'rise_edge', from: c.t_rise, to: riseEdgeEnd, color: 'rgba(61,139,253,0.18)' },
            { name: 'plateau', from: riseEdgeEnd, to: c.t_fall, color: 'rgba(76,175,80,0.12)' },
            { name: 'fall_edge', from: c.t_fall, to: fallEdgeEnd, color: 'rgba(240,71,71,0.16)' },
            { name: 'tail', from: fallEdgeEnd, to: c.t_end, color: 'rgba(140,140,140,0.10)' },
        ]
    }

    get regions(): Region[] {
        return this.regionsFor(this.activeSeg)
    }

    get statsBlocks() {
        const seg = this.activeSeg
        if (!seg?.metrics) return []
        return REGION_METRICS.map(([name, metrics], i) => ({
            name,
            color: REGION_LEGEND_COLOR[i],
            rows: metrics.map((m): [string, number | undefined] => [m, seg.metrics?.[m]]),
        }))
    }

    // Windowed slice of the full sweep's raw trace, padded a bit either
    // side of the segment so the shaded regions have context.
    sliceForSeg(c: KapatSegment | null): [number[], number[]] {
        if (!c || !this.capture) return [[], []]
        const pad = Math.max((c.t_end - c.t_start) * 0.15, 0.15)
        const lo = c.t_start - pad
        const hi = c.t_end + pad
        const xs: number[] = []
        const ys: number[] = []
        const t = this.capture.t
        const f = this.capture.force
        for (let i = 0; i < t.length; i++) {
            if (t[i] >= lo && t[i] <= hi) {
                xs.push(t[i])
                ys.push(f[i])
            }
        }
        return [xs, ys]
    }

    get chartData(): [number[], number[]] {
        return this.sliceForSeg(this.activeSeg)
    }

    // Peak/trough marker times -- bd_segment_metrics only keeps the
    // overshoot/undershoot MAGNITUDE, not when it happened, so the marker
    // position is reconstructed here via argmax/argmin of the raw trace
    // within the rise/fall edge window (same math the metric itself used).
    extremeInWindow(from: number, to: number, wantMax: boolean): { t: number; v: number } | null {
        const [xs, ys] = this.chartData
        let bestT: number | null = null
        let bestV = wantMax ? -Infinity : Infinity
        for (let i = 0; i < xs.length; i++) {
            if (xs[i] < from || xs[i] > to) continue
            if ((wantMax && ys[i] > bestV) || (!wantMax && ys[i] < bestV)) {
                bestV = ys[i]
                bestT = xs[i]
            }
        }
        return bestT === null ? null : { t: bestT, v: bestV }
    }

    get peakPoint() {
        return this.activeSeg?.metrics && this.regions.length ? this.extremeInWindow(this.regions[1].from, this.regions[1].to, true) : null
    }

    get troughPoint() {
        return this.activeSeg?.metrics && this.regions.length
            ? this.extremeInWindow(this.regions[3].from, this.regions[3].to, false)
            : null
    }

    drawOverlays = (u: uPlot): void => {
        const ctx = u.ctx
        const c = kapatChartColors(this.$vuetify.theme.dark)
        ctx.save()
        if (this.showRegions) {
            for (const r of this.regions) {
                const x0 = u.valToPos(r.from, 'x', true)
                const x1 = u.valToPos(r.to, 'x', true)
                const left = Math.max(u.bbox.left, Math.min(x0, x1))
                const right = Math.min(u.bbox.left + u.bbox.width, Math.max(x0, x1))
                if (right <= left) continue
                ctx.fillStyle = r.color
                ctx.fillRect(left, u.bbox.top, right - left, u.bbox.height)
            }
        }
        if (this.showTransitions && this.activeSeg) {
            ctx.strokeStyle = c.text
            ctx.setLineDash([3, 3])
            ctx.lineWidth = 1
            for (const tv of [this.activeSeg.t_rise, this.activeSeg.t_fall]) {
                const x = u.valToPos(tv, 'x', true)
                if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue
                ctx.beginPath()
                ctx.moveTo(x, u.bbox.top)
                ctx.lineTo(x, u.bbox.top + u.bbox.height)
                ctx.stroke()
            }
        }
        if (this.showLevels && this.activeSeg?.metrics) {
            ctx.setLineDash([2, 3])
            ctx.lineWidth = 1
            const baseline = this.activeSeg.metrics.baseline_median
            const high = this.activeSeg.metrics.high_level
            for (const [val, color] of [
                [baseline, c.focus],
                [high, c.accentSoft],
            ] as [number | undefined, string][]) {
                if (val == null) continue
                const y = u.valToPos(val, 'y', true)
                if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) continue
                ctx.strokeStyle = color
                ctx.beginPath()
                ctx.moveTo(u.bbox.left, y)
                ctx.lineTo(u.bbox.left + u.bbox.width, y)
                ctx.stroke()
            }
        }
        ctx.setLineDash([])
        if (this.showPeaks) {
            for (const [pt, color] of [
                [this.peakPoint, 'rgba(61,139,253,1)'],
                [this.troughPoint, 'rgba(240,71,71,1)'],
            ] as [{ t: number; v: number } | null, string][]) {
                if (!pt) continue
                const x = u.valToPos(pt.t, 'x', true)
                const y = u.valToPos(pt.v, 'y', true)
                ctx.fillStyle = color
                ctx.beginPath()
                ctx.arc(x, y, 4, 0, Math.PI * 2)
                ctx.fill()
            }
        }
        if (this.showLabels && this.activeSeg?.metrics) {
            ctx.font = '11px sans-serif'
            ctx.fillStyle = c.text
            if (this.peakPoint) {
                const x = u.valToPos(this.peakPoint.t, 'x', true)
                const y = u.valToPos(this.peakPoint.v, 'y', true)
                ctx.fillText(`Δ=${this.fmt(this.activeSeg.metrics.overshoot, 1)}`, x + 6, y - 6)
            }
            if (this.troughPoint) {
                const x = u.valToPos(this.troughPoint.t, 'x', true)
                const y = u.valToPos(this.troughPoint.v, 'y', true)
                ctx.fillText(`Δ=${this.fmt(this.activeSeg.metrics.undershoot, 1)}`, x + 6, y + 14)
            }
        }
        ctx.restore()
    }

    @Watch('activeSeg')
    @Watch('showTransitions')
    @Watch('showLevels')
    @Watch('showRegions')
    @Watch('showPeaks')
    @Watch('showLabels')
    onRedrawTriggers(): void {
        this.$nextTick(() => this.drawChart())
    }

    drawChart(): void {
        const el = this.$refs.chart as HTMLElement | undefined
        if (!el) return
        const data: uPlot.AlignedData = [this.chartData[0], this.chartData[1]]
        if (this.plot) {
            this.plot.setData(data, true)
            return
        }
        const c = kapatChartColors(this.$vuetify.theme.dark)
        this.plot = new uPlot(
            {
                width: el.clientWidth,
                height: 260,
                legend: { show: false },
                cursor: { show: true },
                scales: { x: { time: false } },
                axes: [
                    { stroke: c.muted, grid: { stroke: c.grid } },
                    { stroke: c.muted, grid: { stroke: c.grid }, label: 'force (g)' },
                ],
                series: [{}, { label: 'force', stroke: c.accent, width: 1.5, points: { show: false } }],
                hooks: { draw: [this.drawOverlays] },
            },
            data,
            el
        )
        this.resizeObserver = new ResizeObserver(() => {
            this.plot?.setSize({ width: el.clientWidth, height: 260 })
        })
        this.resizeObserver.observe(el)
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
.kapat-bd-browser {
    display: grid;
    grid-template-columns: 11rem 1fr;
    gap: 0.75rem;
    margin-top: 0.9rem;
}
@media (max-width: 700px) {
    .kapat-bd-browser {
        grid-template-columns: 1fr;
    }
}

.kapat-bd-k-list {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    overflow-y: auto;
    max-height: 420px;
}
.kapat-bd-k-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.6rem;
    font-size: 0.76rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
}
.kapat-bd-k-row:last-child {
    border-bottom: none;
}
.kapat-bd-k-row:hover {
    background: rgba(255, 255, 255, 0.05);
}
.kapat-bd-k-row.active {
    background: rgba(255, 152, 0, 0.12);
    border-left: 3px solid var(--v-warning-base);
}
.kapat-bd-k-row.k-opt {
    box-shadow: inset 0 0 0 1px var(--v-warning-base);
}

.kapat-bd-segment-pane {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 0.7rem;
    min-width: 0;
}

.kapat-bd-excluded {
    background: rgba(240, 71, 71, 0.12);
    border: 1px solid #f04747;
    color: #f04747;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    font-size: 0.78rem;
}

.kapat-segment-chart {
    width: 100%;
    height: 260px;
}

.kapat-swatch {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 3px;
    display: inline-block;
}

.kapat-bd-stats {
    margin-top: 0.7rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem;
}
.kapat-bd-region {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 3px solid #8a8d91;
    border-radius: 4px;
    padding: 0.4rem 0.55rem;
    font-size: 0.72rem;
}
.kapat-region-name {
    font-weight: 600;
    margin-bottom: 0.3rem;
}
</style>
