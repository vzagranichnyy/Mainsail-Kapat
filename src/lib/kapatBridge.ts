// KAPAT's raw bridge to Klippy's own webhooks API, exposed by Moonraker at
// :7125/klippysocket -- NOT the same as Mainsail's /websocket, and NOT
// proxied by nginx in a typical install. This is the only path
// `load_cell/dump_force` (and any other Klippy-native webhook, including
// all `kapat/*` endpoints) is reachable on. Ported near-verbatim from the
// standalone KAPAT app's web/src/lib/bridge.js -- kept as an independent
// second WebSocket connection rather than folded into Mainsail's typed
// `$socket` (see webSocketClient.ts), since Mainsail has no notion of this
// endpoint at all.
//
// Messages here have NO `jsonrpc: "2.0"` envelope, and pushed batches are
// routed by matching `response_template`'s `key` (echoed back as `msg.key`)
// rather than by `method` name.

type PendingEntry = {
    resolve: (value: unknown) => void
    reject: (err: Error) => void
}

type IncomingMessage = {
    id?: number
    key?: string
    error?: { message?: string }
    result?: unknown
    params?: { data?: number[][] } & Record<string, unknown>
}

export class KlippyBridge {
    hostname: string
    port: number
    ws: WebSocket | null = null
    private _id = 1
    private _pending = new Map<number, PendingEntry>()
    private _keyListeners = new Map<string, Set<(params: unknown) => void>>()
    private _connected = false

    constructor({ hostname = window.location.hostname, port = 7125 }: { hostname?: string; port?: number } = {}) {
        this.hostname = hostname
        this.port = port
    }

    connect(): this {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        this.ws = new WebSocket(`${proto}://${this.hostname}:${this.port}/klippysocket`)
        this.ws.onopen = () => {
            this._connected = true
        }
        this.ws.onclose = () => {
            this._connected = false
            setTimeout(() => this.connect(), 2000)
        }
        this.ws.onmessage = (ev) => this._handleMessage(JSON.parse(ev.data))
        return this
    }

    private _handleMessage(msg: IncomingMessage): void {
        if (msg.id !== undefined && this._pending.has(msg.id)) {
            const { resolve, reject } = this._pending.get(msg.id) as PendingEntry
            this._pending.delete(msg.id)
            if (msg.error) reject(new Error(msg.error.message || 'klippy error'))
            else resolve(msg.result)
            return
        }
        if (msg.key !== undefined && this._keyListeners.has(msg.key)) {
            for (const cb of this._keyListeners.get(msg.key) as Set<(params: unknown) => void>) cb(msg.params)
        }
    }

    call(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this._id++
            this._pending.set(id, { resolve, reject })
            const send = () => this.ws?.send(JSON.stringify({ method, id, params }))
            // Callers can (and do) call this right after `new KlippyBridge()`,
            // before the socket has actually finished opening -- queue behind
            // the 'open' event instead of throwing/dropping the call.
            if (this.ws?.readyState === WebSocket.OPEN) {
                send()
            } else {
                this.ws?.addEventListener('open', send, { once: true })
            }
            setTimeout(() => {
                if (this._pending.has(id)) {
                    this._pending.delete(id)
                    reject(new Error(`timeout waiting for ${method}`))
                }
            }, timeoutMs)
        })
    }

    /**
     * Subscribe to a Klippy webhook that streams pushed batches (e.g.
     * load_cell/dump_force). `onData(params)` fires for every pushed
     * message. Returns an unsubscribe function.
     */
    subscribeStream(
        method: string,
        extraParams: Record<string, unknown>,
        key: string,
        onData: (params: unknown) => void
    ): () => void {
        if (!this._keyListeners.has(key)) this._keyListeners.set(key, new Set())
        this._keyListeners.get(key)?.add(onData)
        this.call(method, { ...extraParams, response_template: { key } }).catch((err) =>
            window.console.error(`kapat bridge: subscribe ${method} failed`, err)
        )
        return () => this._keyListeners.get(key)?.delete(onData)
    }

    /** Convenience wrapper for the specific stream KAPAT's live chart needs. */
    subscribeLoadCellForce(
        sensorName: string,
        onSample: (t: number, force_g: number, counts: number, tare_counts: number) => void
    ): () => void {
        return this.subscribeStream(
            'load_cell/dump_force',
            // Klipper registers this as a mux endpoint keyed on the literal
            // param name "load_cell" (must equal the [load_cell]/
            // [load_cell_probe] config section's name).
            { load_cell: sensorName },
            'kapat_force',
            (params) => {
                const p = params as { data?: number[][] }
                for (const row of p.data || []) {
                    onSample(row[0], row[1], row[2], row[3])
                }
            }
        )
    }

    /** Profiles/History storage -- plain JSON files on the host under
     * printer_data/kapat/<key>.json, reached over this same bridge rather
     * than Moonraker's database. */
    getData(key: string): Promise<{ value?: unknown }> {
        return this.call('kapat/get_data', { key })
    }

    setData(key: string, value: unknown): Promise<unknown> {
        return this.call('kapat/set_data', { key, value })
    }

    listCaptures(): Promise<unknown[]> {
        return this.call('kapat/list_captures', {}).then((r) => r.captures || [])
    }

    getCapture(id: string): Promise<unknown> {
        return this.call('kapat/get_capture', { id }, 60000)
    }

    deleteAllCaptures(): Promise<unknown> {
        return this.call('kapat/delete_all_captures', {})
    }

    /** Flips a flag cmd_KAPAT_SWEEP's own loop checks every cycle -- see
     * that command's docstring for why this has to be a webhook and not
     * a second gcode command (the gcode queue is sequential; a new
     * command sent while KAPAT_SWEEP is still running would just queue
     * up and only run once the sweep already finished). */
    cancelSweep(): Promise<unknown> {
        return this.call('kapat/cancel_sweep', {})
    }

    get connected(): boolean {
        return this._connected
    }
}
