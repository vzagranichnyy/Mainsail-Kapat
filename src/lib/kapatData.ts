// Small helper for storing/loading a JSON array on the host, via the
// KlippyBridge's kapat/get_data + kapat/set_data webhooks. Backs the
// Profiles and History tabs -- lives as a real file under
// printer_data/kapat/<key>.json, not in Moonraker's database or the
// browser. Ported from the standalone KAPAT app's web/src/lib/kvlist.js.

import { KlippyBridge } from '@/lib/kapatBridge'

export async function loadList<T = unknown>(bridge: KlippyBridge, key: string): Promise<T[]> {
    try {
        const res = await bridge.getData(key)
        return Array.isArray(res?.value) ? (res.value as T[]) : []
    } catch {
        return [] // file doesn't exist yet, or Klippy not reachable
    }
}

export async function saveList<T = unknown>(bridge: KlippyBridge, key: string, list: T[]): Promise<T[]> {
    await bridge.setData(key, list)
    return list
}
