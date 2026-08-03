// Builds the KAPAT_SWEEP / KAPAT_APPLY command lines from the sweep form's
// params. Mirrors the args klipper_extras/kapat/__init__.py's
// cmd_KAPAT_SWEEP accepts -- see cmd_KAPAT_SWEEP_help there for the
// authoritative list. Ported verbatim from the standalone KAPAT app's
// web/src/lib/gcode.js.

export interface KapatSweepParams {
    vfr?: number
    vfrLow?: number
    tslow?: number
    tfast?: number
    cycles?: number
    kstart?: number
    kend?: number
    kstep?: number
    warmup?: number
    wobbleAxis?: string
    wobble?: number
    accel?: number
    apply?: boolean
    filament?: string
    // Not a sweep param the user edits in the form -- the selected
    // profile's own temp field, passed through so the backend can home/
    // move/heat entirely server-side before running the sweep. See
    // cmd_KAPAT_SWEEP's TARGET_TEMP handling and kapatController.ts's
    // handleStart() for why this moved out of the web UI's own
    // orchestration.
    targetTemp?: number
    // 'grid' (default, omitted from the command -- byte-identical to the
    // pre-bisection command line) or 'bisect' (adds MODE=BISECT, KSTEP
    // becomes a stop-tolerance rather than a grid step server-side).
    mode?: 'grid' | 'bisect'
}

const PARAM_MAP: Record<string, string> = {
    vfr: 'VFR',
    vfrLow: 'VFR_LOW',
    tslow: 'TSLOW',
    tfast: 'TFAST',
    cycles: 'CYCLES',
    kstart: 'KSTART',
    kend: 'KEND',
    kstep: 'KSTEP',
    warmup: 'WARMUP',
    wobbleAxis: 'WOBBLE_AXIS',
    wobble: 'WOBBLE',
    accel: 'ACCEL',
    apply: 'APPLY',
}

export function buildSweepCommand(params: KapatSweepParams): string {
    const parts = ['KAPAT_SWEEP']
    for (const [jsKey, gcodeKey] of Object.entries(PARAM_MAP)) {
        const value = (params as Record<string, unknown>)[jsKey]
        if (value === undefined || value === null) continue
        parts.push(`${gcodeKey}=${value}`)
    }
    if (params.filament) {
        // Gcode params split on whitespace, so a raw "PET G" would be
        // parsed as two tokens -- collapse to the same safe charset
        // __init__.py's _save_capture slugifies into anyway.
        const safe = params.filament.trim().replace(/[^A-Za-z0-9_+-]+/g, '_')
        if (safe) parts.push(`FILAMENT=${safe}`)
    }
    if (params.targetTemp != null) {
        parts.push(`TARGET_TEMP=${params.targetTemp}`)
    }
    if (params.mode === 'bisect') {
        parts.push('MODE=BISECT')
    }
    return parts.join(' ')
}

export function buildApplyCommand(k?: number | null): string {
    return k === undefined || k === null ? 'KAPAT_APPLY' : `KAPAT_APPLY K=${k}`
}
