// Persistent live-chart buffer state, keyed by sensor name -- survives
// KapatLiveChart.vue being destroyed/recreated when Mainsail's router
// swaps pages. There is no <keep-alive> anywhere in this app (same
// story as kapatSweepState.ts/kapatController.ts, see their own
// comments), so navigating away from the KAPAT tab/dashboard panel and
// back destroys the chart component and, without this, wiped its
// entire sample buffer and cascaded-EMA state along with it. The chart
// then had to "warm up" the smoothing filter again from a cold start
// (stageValues === null -> first sample gets zero smoothing, dt === 0
// for that first sample too), which is exactly what showed up as a
// jagged, unsmoothed zigzag for the first several seconds after every
// navigation -- reported live on real hardware. Moving the buffer into
// a module-level singleton means a remounted chart just keeps appending
// to the same already-smooth history instead of starting over.

export interface KapatChartBuffer {
    xs: number[]
    ys: number[]
    smoothedYs: number[]
    t0: number | null
    stageValues: number[] | null
    lastSampleRelT: number | null
}

const buffers = new Map<string, KapatChartBuffer>()

function makeEmpty(): KapatChartBuffer {
    return { xs: [], ys: [], smoothedYs: [], t0: null, stageValues: null, lastSampleRelT: null }
}

export function getKapatChartBuffer(sensorName: string): KapatChartBuffer {
    let buf = buffers.get(sensorName)
    if (!buf) {
        buf = makeEmpty()
        buffers.set(sensorName, buf)
    }
    return buf
}

// Used when a fresh sweep starts -- unlike navigation, that's a
// deliberate "start over" moment (old data is from a different/no
// sweep), so the buffer genuinely should reset here, not persist.
export function resetKapatChartBuffer(sensorName: string): KapatChartBuffer {
    const buf = makeEmpty()
    buffers.set(sensorName, buf)
    return buf
}
