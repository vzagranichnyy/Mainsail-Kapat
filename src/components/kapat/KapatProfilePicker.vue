<template>
    <panel :title="$t('Kapat.ProfilePicker.Title')" card-class="kapat-profile-picker" :margin-bottom="false">
        <v-card-text v-if="loading">
            <span class="text--disabled">{{ $t('Kapat.ProfilePicker.Loading') }}</span>
        </v-card-text>
        <v-card-text v-else>
            <div class="kapat-align-row-1">
                <v-select
                    :value="selectedId"
                    :items="selectItems"
                    item-text="text"
                    item-value="value"
                    outlined
                    dense
                    hide-details="auto"
                    @change="selectProfile" />
            </div>

            <div class="kapat-align-row-2">
                <v-row dense>
                    <v-col cols="4">
                        <v-text-field
                            v-model="filamentType"
                            :label="$t('Kapat.ProfilePicker.FilamentType')"
                            outlined
                            dense
                            hide-details="auto" />
                    </v-col>
                    <v-col cols="4">
                        <v-text-field
                            v-model="brand"
                            :label="$t('Kapat.ProfilePicker.Brand')"
                            outlined
                            dense
                            hide-details="auto" />
                    </v-col>
                    <v-col cols="4" class="d-flex align-end">
                        <v-menu :close-on-content-click="false" offset-y>
                            <template #activator="{ on, attrs }">
                                <div
                                    class="kapat-color-swatch-btn"
                                    :style="{ background: color || 'transparent' }"
                                    :title="$t('Kapat.ProfilePicker.Color').toString()"
                                    v-bind="attrs"
                                    v-on="on" />
                            </template>
                            <div class="kapat-palette">
                                <div
                                    v-for="swatch in COLOR_PALETTE"
                                    :key="swatch"
                                    class="kapat-swatch"
                                    :class="{ 'kapat-swatch-active': color === swatch }"
                                    :style="{ background: swatch }"
                                    :title="swatch"
                                    @click="color = swatch" />
                            </div>
                        </v-menu>
                    </v-col>
                </v-row>
            </div>

            <div class="kapat-align-row-3">
                <v-row dense>
                    <v-col cols="6">
                        <number-input
                            :label="$t('Kapat.ProfilePicker.TestTemp')"
                            param="temp"
                            :target="temp"
                            :min="0"
                            :max="350"
                            :step="1"
                            :dec="0"
                            unit="°C"
                            commit-on-blur
                            @submit="({ value }) => $emit('update:temp', value)" />
                    </v-col>
                    <v-col cols="6">
                        <number-input
                            :label="$t('Kapat.ProfilePicker.PA')"
                            param="pa"
                            :target="pa"
                            :min="0"
                            :max="1"
                            :step="0.001"
                            :dec="4"
                            commit-on-blur
                            @submit="({ value }) => (pa = value)" />
                    </v-col>
                </v-row>
            </div>

            <template v-if="confirming">
                <p class="text--disabled mb-2">{{ $t('Kapat.ProfilePicker.ConfirmOverwrite', { label: derivedLabel }) }}</p>
                <div class="d-flex flex-wrap" style="gap: 8px">
                    <v-btn small color="primary" @click="doOverwrite">{{ $t('Kapat.ProfilePicker.Overwrite') }}</v-btn>
                    <v-btn small outlined @click="doSaveAsNew">{{ $t('Kapat.ProfilePicker.SaveAsNew') }}</v-btn>
                    <v-btn small text @click="confirming = false">{{ $t('Kapat.ProfilePicker.Cancel') }}</v-btn>
                </div>
            </template>
            <div v-else class="kapat-align-row-4">
                <v-row dense>
                    <v-col cols="4">
                        <v-btn small block color="primary" @click="save">{{ $t('Kapat.ProfilePicker.Save') }}</v-btn>
                    </v-col>
                    <v-col cols="4">
                        <v-btn small block color="error" outlined :disabled="!selectedId" @click="remove">
                            {{ $t('Kapat.ProfilePicker.Delete') }}
                        </v-btn>
                    </v-col>
                    <v-col cols="4">
                        <v-btn small block color="success" outlined :disabled="Number(pa) === 0" @click="apply">
                            {{ $t('Kapat.ProfilePicker.ApplyToPrinter') }}
                        </v-btn>
                    </v-col>
                </v-row>
            </div>

            <p v-if="statusMsg && !confirming" class="mt-2 mb-0" :class="statusIsError ? 'error--text' : 'success--text'">
                {{ statusMsg }}
            </p>

            <v-row dense class="kapat-align-row-5">
                <v-col cols="3">
                    <number-input
                        :label="$t('Kapat.CalibPosition.X')"
                        param="calibX"
                        :target="calibX"
                        :min="-500"
                        :max="500"
                        :step="1"
                        :dec="1"
                        unit="mm"
                        commit-on-blur
                        @submit="({ value }) => $emit('update:calibX', value)" />
                </v-col>
                <v-col cols="3">
                    <number-input
                        :label="$t('Kapat.CalibPosition.Y')"
                        param="calibY"
                        :target="calibY"
                        :min="-500"
                        :max="500"
                        :step="1"
                        :dec="1"
                        unit="mm"
                        commit-on-blur
                        @submit="({ value }) => $emit('update:calibY', value)" />
                </v-col>
                <v-col cols="3">
                    <number-input
                        :label="$t('Kapat.CalibPosition.Z')"
                        param="calibZ"
                        :target="calibZ"
                        :min="0"
                        :max="500"
                        :step="1"
                        :dec="1"
                        unit="mm"
                        commit-on-blur
                        @submit="({ value }) => $emit('update:calibZ', value)" />
                </v-col>
                <v-col cols="3" class="d-flex align-end">
                    <v-btn block color="primary" class="kapat-calib-save-btn" @click="saveCalibPosition">
                        {{ $t('Kapat.CalibPosition.Save') }}
                    </v-btn>
                </v-col>
            </v-row>
            <p v-if="calibStatusMsg" class="mt-2 mb-0" :class="calibStatusIsError ? 'error--text' : 'success--text'">
                {{ calibStatusMsg }}
            </p>
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KlippyBridge } from '@/lib/kapatBridge'
import { loadList, saveList } from '@/lib/kapatData'
import { KapatSweepParams } from '@/lib/kapatGcode'
import { kapatSweepState, persistSweepState } from '@/lib/kapatSweepState'

interface KapatProfile {
    id: string
    label: string
    temp: number
    pa: number
    params: KapatSweepParams | null
    source: string
    updated: string
    filamentType?: string
    brand?: string
    color?: string
}

// A fuller Material-Design-style palette (main + dark shade per hue) so
// there's a real choice of filament colors, not just a handful of dots --
// matches the richer picker the user asked for instead of a 12-swatch row.
const COLOR_PALETTE = [
    '#FFFFFF',
    '#E0E0E0',
    '#9E9E9E',
    '#616161',
    '#1A1A1A',
    '#D8CAB8',
    '#90A4AE',
    '#455A64',
    '#F44336',
    '#D32F2F',
    '#E91E63',
    '#C2185B',
    '#9C27B0',
    '#7B1FA2',
    '#673AB7',
    '#512DA8',
    '#3F51B5',
    '#303F9F',
    '#2196F3',
    '#1976D2',
    '#03A9F4',
    '#0288D1',
    '#00BCD4',
    '#0097A7',
    '#009688',
    '#00796B',
    '#4CAF50',
    '#388E3C',
    '#8BC34A',
    '#689F38',
    '#CDDC39',
    '#AFB42B',
    '#FFEB3B',
    '#FBC02D',
    '#FFC107',
    '#FFA000',
    '#FF9800',
    '#F57C00',
    '#FF5722',
    '#E64A19',
    '#795548',
    '#5D4037',
]

@Component
export default class KapatProfilePicker extends Mixins(BaseMixin) {
    COLOR_PALETTE = COLOR_PALETTE

    @Prop({ required: true }) declare readonly bridge: KlippyBridge
    @Prop({ required: true }) declare readonly sweepParams: KapatSweepParams
    @Prop({ default: '' }) declare readonly label: string
    @Prop({ default: 210 }) declare readonly temp: number
    @Prop({ required: true }) declare readonly calibX: number
    @Prop({ required: true }) declare readonly calibY: number
    @Prop({ required: true }) declare readonly calibZ: number
    @Prop({ default: false }) declare readonly sweeping: boolean
    @Prop({ default: null }) declare readonly lastKOpt: number | null

    private readonly KEY = 'profiles'
    private readonly LAST_PROFILE_KEY = 'kapat-last-profile-id'

    profiles: KapatProfile[] = []
    loading = true
    selectedId = ''
    pa = 0
    filamentType = ''
    brand = ''
    color = ''
    savedParams: KapatSweepParams | null = null
    statusMsg = ''
    statusIsError = false
    confirming = false
    calibStatusMsg = ''
    calibStatusIsError = false
    // Seeded from the `sweeping` prop in created() (mirrors Kapat.vue's
    // own wasSweeping pattern) -- needed to detect the true->false
    // completion edge even if this component gets recreated (Vue Router
    // destroys Kapat.vue and everything under it on navigation) while a
    // sweep is already running.
    wasSweeping = false

    // There's no free-text name field anymore -- the label shown in
    // history/gcode is derived straight from type + brand, so it always
    // reflects what's actually in the two fields instead of going stale
    // relative to them.
    get derivedLabel(): string {
        return [this.brand.trim(), this.filamentType.trim()].filter(Boolean).join(' ')
    }

    @Watch('derivedLabel', { immediate: true })
    onDerivedLabelChange(value: string): void {
        if (value !== this.label) this.$emit('update:label', value)
    }

    // Mirrored up to Kapat.vue the same way label/temp already are, so a
    // completed sweep's history entry can record the *structured*
    // type/brand/color instead of just the flattened label string.
    @Watch('filamentType', { immediate: true })
    onFilamentTypeChange(value: string): void {
        this.$emit('update:filamentType', value)
    }

    @Watch('brand', { immediate: true })
    onBrandChange(value: string): void {
        this.$emit('update:brand', value)
    }

    @Watch('color', { immediate: true })
    onColorChange(value: string): void {
        this.$emit('update:color', value)
    }

    get selectItems() {
        const items = this.profiles.map((p) => ({
            value: p.id,
            text: `${p.label}${p.temp != null ? '@' + p.temp : ''} ${
                p.pa ? `(PA ${Number(p.pa).toFixed(4)})` : `(${this.$t('Kapat.ProfilePicker.NoPA')})`
            }`,
        }))
        return [{ value: '', text: this.$t('Kapat.ProfilePicker.New') }, ...items]
    }

    created(): void {
        this.wasSweeping = this.sweeping
    }

    mounted(): void {
        window.addEventListener('focus', this.load)
    }

    beforeDestroy(): void {
        window.removeEventListener('focus', this.load)
    }

    @Watch('bridge', { immediate: true })
    onBridgeChange(): void {
        if (this.bridge) this.load()
    }

    // Mirrors Kapat.vue's own label/filamentType/brand/color mirroring --
    // lets Kapat.vue snapshot which profile was selected into
    // kapatSweepState at sweep-start time (see handleStart there). Needs
    // `immediate` so a *restored* selection (see `load()` below) is
    // mirrored up right away too, not just on the next manual change.
    @Watch('selectedId', { immediate: true })
    onSelectedIdChange(value: string): void {
        this.$emit('update:profileId', value)
    }

    // Persisted to localStorage on every *real* change (deliberately NOT
    // `immediate` -- an immediate firing runs during component creation
    // with `selectedId`'s freshly-initialized default (''), which would
    // overwrite the very value `load()` below still needs to read for
    // restoration, before `load()`'s own `await` even gets a chance to
    // run. Plain idle navigation away from the KAPAT tab and back (no
    // sweep running) still destroys/recreates this component via Vue
    // Router the same way kapatSweepState's scenario does; users
    // reasonably expect their selected profile to just still be there.
    // localStorage survives that, and a full page reload too.
    @Watch('selectedId')
    onSelectedIdChangePersist(value: string): void {
        window.localStorage.setItem(this.LAST_PROFILE_KEY, value)
    }

    // If this component gets recreated mid-sweep (Vue Router destroying
    // Kapat.vue and everything under it on navigation), `selectedId`
    // resets to '' ("New profile") and every derived field along with
    // it -- visibly reverting the card, and losing track of which
    // profile the in-flight sweep's result should eventually be saved
    // back into. Restore the selection from kapatSweepState.profileId
    // (set by Kapat.vue right before issuing KAPAT_SWEEP) once the
    // profiles list has loaded, same idea as kapatSweepState's other
    // fields already surviving recreation for history-logging.
    async load(): Promise<void> {
        this.loading = true
        this.profiles = await loadList<KapatProfile>(this.bridge, this.KEY)
        this.loading = false
        if (this.selectedId) return
        // kapatSweepState.profileId (a sweep is actually in flight) takes
        // priority over the plain last-selected-id fallback below, since
        // it reflects what the *current* sweep needs, not just whatever
        // was selected before the page happened to get recreated.
        const restoreId = kapatSweepState.profileId || window.localStorage.getItem(this.LAST_PROFILE_KEY) || ''
        if (restoreId && this.profiles.some((p) => p.id === restoreId)) {
            this.selectProfile(restoreId)
        }
    }

    // `sweeping` false->true: the sweep genuinely just started (Klipper's
    // own status, not just "the Start button was clicked") -- snapshot
    // this component's own authoritative filament fields into
    // kapatSweepState right now, from source, rather than having
    // Kapat.vue snapshot its *mirrored* copies of them (profileLabel
    // etc.), which depend on this component's `.sync` emits having
    // already caught up by the time Kapat.vue's handleStart() runs.
    // That dependency proved fragile in practice (a real sweep logged an
    // empty filamentType/brand/color to history despite a profile
    // clearly being selected in the UI at the time) -- reading `this.*`
    // directly here has no such gap.
    //
    // `sweeping` true->false: the sweep just finished -- write the
    // resulting K back into whichever profile was selected when the
    // sweep *started* (kapatSweepState.profileId, not necessarily
    // `this.selectedId`, which could differ if the user changed the
    // selection while the sweep was still running). Mirrors the removed
    // "use last sweep result" button, but automatic instead of a manual
    // click.
    @Watch('sweeping')
    onSweepingChange(sweeping: boolean): void {
        if (!this.wasSweeping && sweeping) this.snapshotForSweep()
        if (this.wasSweeping && !sweeping) this.saveResultToProfile()
        this.wasSweeping = sweeping
    }

    // Only overwrites fields that are actually non-empty here -- Kapat.vue
    // (handleStart) also snapshots these from its own mirrored copies as
    // a redundant safety net (see the comment there for why: this path
    // alone wasn't reliably enough on real hardware). Blindly overwriting
    // with whatever's in `this.*` here, even if empty, could stomp
    // perfectly good data Kapat.vue already wrote moments earlier.
    snapshotForSweep(): void {
        if (this.selectedId) kapatSweepState.profileId = this.selectedId
        if (this.derivedLabel) kapatSweepState.label = this.derivedLabel
        if (this.filamentType) kapatSweepState.filamentType = this.filamentType
        if (this.brand) kapatSweepState.brand = this.brand
        if (this.color) kapatSweepState.color = this.color
        persistSweepState()
    }

    async saveResultToProfile(): Promise<void> {
        const id = kapatSweepState.profileId
        kapatSweepState.profileId = ''
        if (!id || this.lastKOpt == null) return
        const idx = this.profiles.findIndex((p) => p.id === id)
        if (idx === -1) return
        const rounded = Number(this.lastKOpt.toFixed(3))
        this.profiles = this.profiles.map((p, i) => (i === idx ? { ...p, pa: rounded } : p))
        await this.persist()
        if (this.selectedId === id) this.pa = rounded
        this.statusMsg = this.$t('Kapat.ProfilePicker.MsgSaved') as string
        this.statusIsError = false
    }

    async persist(): Promise<void> {
        await saveList(this.bridge, this.KEY, this.profiles)
    }

    selectProfile(id: string): void {
        this.selectedId = id
        this.confirming = false
        const p = this.profiles.find((x) => x.id === id)
        if (p) {
            this.$emit('update:temp', p.temp ?? 210)
            this.pa = p.pa ?? 0
            this.filamentType = p.filamentType ?? ''
            this.brand = p.brand ?? ''
            this.color = p.color ?? ''
            this.savedParams = p.params ?? null
            if (p.params) this.$emit('loadParams', p.params)
        } else {
            this.$emit('update:temp', 210)
            this.pa = 0
            this.filamentType = ''
            this.brand = ''
            this.color = ''
            this.savedParams = null
        }
        this.statusMsg = ''
        this.statusIsError = false
    }

    async saveCalibPosition(): Promise<void> {
        try {
            await this.bridge.setData('settings', {
                calibX: Number(this.calibX),
                calibY: Number(this.calibY),
                calibZ: Number(this.calibZ),
            })
            this.calibStatusMsg = this.$t('Kapat.CalibPosition.Saved') as string
            this.calibStatusIsError = false
        } catch (err) {
            this.calibStatusMsg = this.$t('Kapat.CalibPosition.SaveFailed', { err: (err as Error).message }) as string
            this.calibStatusIsError = true
        }
    }

    validate(): boolean {
        if (!this.filamentType.trim() && !this.brand.trim()) {
            this.statusMsg = this.$t('Kapat.ProfilePicker.MsgNeedLabel') as string
            this.statusIsError = true
            return false
        }
        return true
    }

    hasChanges(p: KapatProfile | undefined): boolean {
        if (!p) return true
        if ((p.temp ?? 210) !== Number(this.temp)) return true
        if ((p.pa ?? 0) !== Number(this.pa)) return true
        if ((p.filamentType ?? '') !== this.filamentType) return true
        if ((p.brand ?? '') !== this.brand) return true
        if ((p.color ?? '') !== this.color) return true
        if (JSON.stringify(p.params ?? null) !== JSON.stringify(this.sweepParams ?? null)) return true
        return false
    }

    buildEntry(id: string, now: string): KapatProfile {
        return {
            id,
            label: this.derivedLabel,
            temp: Number(this.temp),
            pa: Number(this.pa),
            filamentType: this.filamentType || undefined,
            brand: this.brand.trim() || undefined,
            color: this.color || undefined,
            params: { ...this.sweepParams },
            source: 'manual',
            updated: now,
        }
    }

    save(): void {
        if (!this.validate()) return
        const existing = this.profiles.find((p) => p.id === this.selectedId)
        if (this.selectedId && existing && this.hasChanges(existing)) {
            this.confirming = true
            return
        }
        if (!this.selectedId) this.doSaveAsNew()
        else this.doOverwrite()
    }

    async doOverwrite(): Promise<void> {
        const now = new Date().toISOString()
        this.profiles = this.profiles.map((p) => (p.id === this.selectedId ? this.buildEntry(p.id, now) : p))
        await this.persist()
        this.savedParams = { ...this.sweepParams }
        this.confirming = false
        this.statusMsg = this.$t('Kapat.ProfilePicker.MsgSaved') as string
        this.statusIsError = false
    }

    async doSaveAsNew(): Promise<void> {
        const entry = this.buildEntry(`${Date.now()}`, new Date().toISOString())
        this.profiles = [...this.profiles, entry]
        this.selectedId = entry.id
        this.savedParams = { ...this.sweepParams }
        await this.persist()
        this.confirming = false
        this.statusMsg = this.$t('Kapat.ProfilePicker.MsgSaved') as string
        this.statusIsError = false
    }

    async remove(): Promise<void> {
        if (!this.selectedId) return
        if (!window.confirm(this.$t('Kapat.ProfilePicker.ConfirmDelete', { label: this.derivedLabel }) as string)) return
        this.profiles = this.profiles.filter((p) => p.id !== this.selectedId)
        await this.persist()
        this.selectProfile('')
        this.statusMsg = this.$t('Kapat.ProfilePicker.MsgDeleted') as string
        this.statusIsError = false
        this.$toast.success(this.statusMsg)
    }

    apply(): void {
        if (Number(this.pa) === 0) {
            this.statusMsg = this.$t('Kapat.ProfilePicker.MsgNoPA') as string
            this.statusIsError = true
            return
        }
        this.$emit('apply', Number(this.pa))
        this.statusMsg = this.$t('Kapat.ProfilePicker.MsgApplied', { pa: Number(this.pa).toFixed(4) }) as string
        this.statusIsError = false
    }
}
</script>

<style scoped>
/* Row spacing here is tuned in px, not Vuetify's mb-N/mt-N spacer
   utilities, to line this card's rows up with KapatSweepForm.vue's
   fields sitting next to it (each a strict 54px top-to-top rhythm, via
   its own `.kapat-field { padding-bottom: 0.85rem }`). Vuetify's
   spacer classes don't hit that number, and adjacent-sibling margins
   collapse to their max rather than adding, which made getting an
   exact match fiddly -- padding-bottom on each row wrapper sidesteps
   the collapsing entirely (same reasoning as `.kapat-field` next door).
   Values below came from measuring actual rendered `getBoundingClientRect()`
   offsets in both cards side by side and solving for the padding each
   row needs to hit the next row's target top. */
.kapat-align-row-1 {
    padding-bottom: 13px;
}
.kapat-align-row-2 {
    padding-bottom: 6px;
}
.kapat-align-row-3 {
    padding-bottom: 6px;
}
.kapat-align-row-4 {
    padding-bottom: 17px;
}
/* v-row's own "row--dense" class carries a built-in -4px margin on
   every side (Vuetify's gutter-compensation trick). The negative
   top/bottom margin isn't contained by a plain wrapper div with no
   padding-top, so it escapes upward past this row's own wrapper and
   overlaps the previous one -- silently fighting the padding-bottom
   values above. Zero it out vertically (left/right stay, needed for
   the columns' own gutter compensation) so the padding above is the
   only thing controlling vertical spacing. */
.kapat-align-row-2 > .row--dense,
.kapat-align-row-3 > .row--dense,
.kapat-align-row-4 > .row--dense {
    margin-top: 0;
    margin-bottom: 0;
}
/* Row 5 (X/Y/Z + Save) is the last row in the card -- its content is
   naturally taller than KapatSweepForm's plain "Начать калибровку"
   button (number-inputs vs a bare v-btn), so the whole card ends up
   taller than the sweep-form card even with row tops perfectly
   aligned. A negative bottom margin (unlike padding, margin CAN go
   negative) pulls the card's own trailing v-card-text padding back up
   to compensate, without touching row5's own top position. */
.kapat-align-row-5.row--dense {
    margin-top: 0;
    margin-bottom: -8px;
}
.kapat-color-swatch-btn {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    cursor: pointer;
}
/* v-btn's own "small"/default height classes don't line up with the
   number-input's outlined-dense text-field height (2.5rem, same value
   used for the color swatch above) -- force it explicitly instead of
   relying on align-end alone, or the button reads as vertically
   "off" next to X/Y/Z. */
.kapat-calib-save-btn.v-btn {
    height: 2.5rem !important;
}
.kapat-palette {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.4rem;
    padding: 0.75rem;
    background: var(--v-card-base, #1e1e1e);
    max-width: 19rem;
}
.kapat-swatch {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}
.kapat-swatch-active {
    border-color: var(--v-warning-base);
}
</style>
