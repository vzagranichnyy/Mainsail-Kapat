// Client-side mirror of klipper_extras/kapat/bd_pressure.py's
// bd_compute_normalised / bd_compute_cost / argmin_with_parabolic. Kept in
// sync by hand -- this is what lets the weight sliders recompute K_opt
// instantly. Ported from the standalone KAPAT app's web/src/lib/bdCost.js.

export const BD_ZERO_ANCHORED = new Set([
    'rise_error_area',
    'overshoot',
    'plateau_slope',
    'plateau_creep',
    'fall_error_area',
    'undershoot',
    'tail_area',
])

export const BD_METRIC_NAMES = [
    'baseline_median',
    'baseline_noise_std',
    'rise_delay',
    'rise_error_area',
    'overshoot',
    'high_level',
    'plateau_slope',
    'plateau_creep',
    'fall_delay',
    'fall_error_area',
    'undershoot',
    'tail_area',
    'settling_time',
]

export interface BdKResult {
    k: number
    medians?: Record<string, number>
    lo?: Record<string, number>
    hi?: Record<string, number>
    segments?: unknown[]
}

/** bdPerK: [{k, medians: {metric: value, ...}}, ...] (from kapatStatus.last.bd_per_k) */
export function computeNormalised(bdPerK: BdKResult[], metricNames: string[] = BD_METRIC_NAMES): Record<string, number[]> {
    const normalised: Record<string, number[]> = {}
    for (const name of metricNames) {
        const raw = bdPerK.map((kr) => kr.medians?.[name] ?? NaN)
        const finite = raw.filter((v) => Number.isFinite(v))
        if (!finite.length) {
            normalised[name] = raw.map(() => NaN)
            continue
        }
        if (BD_ZERO_ANCHORED.has(name)) {
            const denom = Math.max(...finite.map(Math.abs))
            normalised[name] = raw.map((v) => (denom > 0 ? Math.abs(v) / denom : 0))
        } else {
            const lo = Math.min(...finite)
            const hi = Math.max(...finite)
            const span = hi - lo
            normalised[name] = raw.map((v) => (span > 0 ? (v - lo) / span : 0))
        }
    }
    return normalised
}

export function computeCost(normalised: Record<string, number[]>, weights: Record<string, number>): number[] {
    const names = Object.keys(weights)
    if (!names.length) return []
    const n = normalised[names[0]]?.length ?? 0
    const total = new Array(n).fill(0)
    for (const name of names) {
        const weight = weights[name]
        if (!weight || !normalised[name]) continue
        for (let i = 0; i < n; i++) {
            const v = normalised[name][i]
            total[i] += (Number.isFinite(v) ? v : 0) * weight
        }
    }
    return total
}

/** Same shape as pa_analysis_core.argmin_with_parabolic. */
export function argminWithParabolic(ks: number[], cost: number[]): number | null {
    const finiteIdx = cost.map((c, i): [number, number] => [c, i]).filter(([c]) => Number.isFinite(c))
    if (!finiteIdx.length) return null
    let bestI = 0
    let bestC = finiteIdx[0][0]
    for (const [c, i] of finiteIdx) {
        if (c < bestC) {
            bestC = c
            bestI = i
        }
    }
    const i = bestI
    if (cost.length < 3 || i === 0 || i === cost.length - 1) return ks[i]
    const x0 = ks[i - 1]
    const x1 = ks[i]
    const x2 = ks[i + 1]
    const y0 = cost[i - 1]
    const y1 = cost[i]
    const y2 = cost[i + 1]
    const denom = (x0 - x1) * (x0 - x2) * (x1 - x2)
    if (denom === 0) return x1
    const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / denom
    const b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / denom
    if (a <= 0) return x1
    const vertex = -b / (2 * a)
    return Math.max(Math.min(vertex, x2), x0)
}

export interface CompositeResult {
    ks: number[]
    cost: number[]
    kOpt: number | null
}

/** Convenience: recompute composite K_opt from bdPerK + a weights map. */
export function recomputeComposite(bdPerK: BdKResult[], weights: Record<string, number>): CompositeResult {
    const ks = bdPerK.map((kr) => kr.k)
    const normalised = computeNormalised(bdPerK)
    const cost = computeCost(normalised, weights)
    const kOpt = argminWithParabolic(ks, cost)
    return { ks, cost, kOpt }
}

/** Per-metric K_opt (argmin over |value| for zero-anchored metrics, raw
 * value otherwise) -- mirrors bd_pressure.analyse_bd's metric_k_opt. */
export function perMetricKOpt(bdPerK: BdKResult[], metricNames: string[] = BD_METRIC_NAMES): Record<string, number | null> {
    const ks = bdPerK.map((kr) => kr.k)
    const result: Record<string, number | null> = {}
    for (const name of metricNames) {
        const raw = bdPerK.map((kr) => kr.medians?.[name] ?? NaN)
        if (!raw.some(Number.isFinite)) {
            result[name] = null
            continue
        }
        const scored = BD_ZERO_ANCHORED.has(name) ? raw.map(Math.abs) : raw
        result[name] = argminWithParabolic(ks, scored)
    }
    return result
}
