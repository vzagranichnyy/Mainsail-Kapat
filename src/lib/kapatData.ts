// Small helper for storing/loading a JSON array on the host, via the
// KlippyBridge's kapat/get_data + kapat/set_data webhooks. Backs the
// Profiles and History tabs -- lives as a real file under
// printer_data/kapat/<key>.json, not in Moonraker's database or the
// browser. Ported from the standalone KAPAT app's web/src/lib/kvlist.js.

import { KlippyBridge } from '@/lib/kapatBridge'

// Deliberately does NOT catch bridge/connectivity failures here (only
// this file's own docstring used to claim that was safe) -- the
// backend's own kapat/get_data handler already treats a genuinely
// missing/new file as a normal, successful `{value: []}` response (see
// klipper_extras/kapat/__init__.py's _handle_get_data), so a THROWN
// error here can only mean the raw klippysocket bridge itself failed
// (disconnected/reconnecting/timed out) -- not "no data yet". Every
// caller of this function eventually feeds the result into a
// read-modify-write `saveList()` round trip; silently returning `[]`
// for a real connectivity hiccup made that write **replace the entire
// file with just the one new/changed entry**, discarding everything
// that was there before. Confirmed live: a KAPAT_SWEEP long enough to
// trip a bridge reconnect wiped history.json down to a single entry
// mid-session, with no user action to explain the loss. Callers must
// catch this themselves and skip their own save on failure instead of
// treating a failed load as "start from empty".
export async function loadList<T = unknown>(bridge: KlippyBridge, key: string): Promise<T[]> {
    const res = await bridge.getData(key)
    return Array.isArray(res?.value) ? (res.value as T[]) : []
}

export async function saveList<T = unknown>(bridge: KlippyBridge, key: string, list: T[]): Promise<T[]> {
    await bridge.setData(key, list)
    return list
}
