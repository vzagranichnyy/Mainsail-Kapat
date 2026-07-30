<template>
    <panel :title="$t('Kapat.HistoryPanel.Title')" card-class="kapat-history-panel" :collapsible="true">
        <template #buttons>
            <v-btn v-if="entries.length" text small @click="clearAll">{{ $t('Kapat.HistoryPanel.ClearAll') }}</v-btn>
        </template>
        <v-data-table
            :headers="headers"
            :items="entries"
            :loading="loading"
            item-key="id"
            sort-by="time"
            sort-desc
            mobile-breakpoint="0"
            :footer-props="{ itemsPerPageOptions: [10, 25, 50, -1] }"
            class="kapat-history-table">
            <template #no-data>
                <span class="text--disabled">{{ $t('Kapat.HistoryPanel.Empty') }}</span>
            </template>

            <template #item.time="{ item }">
                <span>{{ fmtDatePart(item.time) }}</span>
                <span class="text--disabled ml-1" style="font-size: 0.78rem">{{ fmtTimePart(item.time) }}</span>
            </template>

            <template #item.filamentType="{ item }">
                {{ item.filamentType || '—' }}
            </template>

            <template #item.brand="{ item }">
                {{ item.brand || '—' }}
            </template>

            <template #item.color="{ item }">
                <span v-if="item.color" class="kapat-history-swatch" :style="{ background: item.color }" />
                <span v-else class="text--disabled">—</span>
            </template>

            <template #item.temp="{ item }">
                {{ item.temp != null ? Math.round(item.temp) + '°C' : '—' }}
            </template>

            <template #item.kOpt="{ item }">
                <span class="font-weight-bold warning--text">{{ fmt(item.kOpt) }}</span>
            </template>

            <template #item.applied="{ item }">
                <v-icon v-if="item.applied" small color="success">{{ mdiCheck }}</v-icon>
                <span v-else class="text--disabled">—</span>
            </template>

            <template #item.actions="{ item }">
                <v-tooltip top>
                    <template #activator="{ on, attrs }">
                        <v-btn icon small :disabled="item.kOpt == null" v-bind="attrs" v-on="on" @click="apply(item)">
                            <v-icon small>{{ mdiCheckCircleOutline }}</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ $t('Kapat.HistoryPanel.Apply') }}</span>
                </v-tooltip>
                <v-tooltip top>
                    <template #activator="{ on, attrs }">
                        <v-btn icon small color="error" v-bind="attrs" v-on="on" @click="removeEntry(item.id)">
                            <v-icon small>{{ mdiDelete }}</v-icon>
                        </v-btn>
                    </template>
                    <span>{{ $t('Kapat.HistoryPanel.Remove') }}</span>
                </v-tooltip>
            </template>
        </v-data-table>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KlippyBridge } from '@/lib/kapatBridge'
import { loadList, saveList } from '@/lib/kapatData'
import { KapatSweepParams } from '@/lib/kapatGcode'
import { mdiCheck, mdiCheckCircleOutline, mdiDelete } from '@mdi/js'

interface HistoryTableHeader {
    text: string
    value: string
    sortable?: boolean
    align?: 'start' | 'center' | 'end'
    width?: string
}

interface KapatHistoryEntry {
    id: string
    time: string
    temp: number | null
    kOpt: number | null
    source?: string
    applied?: boolean
    params: KapatSweepParams | null
    filament: string | null
    filamentType?: string
    brand?: string
    color?: string
}

@Component
export default class KapatHistoryPanel extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bridge: KlippyBridge

    mdiCheck = mdiCheck
    mdiCheckCircleOutline = mdiCheckCircleOutline
    mdiDelete = mdiDelete

    private readonly KEY = 'history'

    entries: KapatHistoryEntry[] = []
    loading = true

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

    get headers(): HistoryTableHeader[] {
        return [
            { text: this.$t('Kapat.ProfilePicker.FilamentType') as string, value: 'filamentType', width: '14%' },
            { text: this.$t('Kapat.ProfilePicker.Brand') as string, value: 'brand', width: '16%' },
            { text: this.$t('Kapat.ProfilePicker.Color') as string, value: 'color', sortable: false, align: 'center', width: '8%' },
            { text: this.$t('Kapat.ProfilePicker.TestTemp') as string, value: 'temp', width: '12%' },
            { text: this.$t('Kapat.HistoryPanel.When') as string, value: 'time', width: '16%' },
            { text: 'PA', value: 'kOpt', width: '10%' },
            { text: this.$t('Kapat.HistoryPanel.Applied') as string, value: 'applied', align: 'center', width: '10%' },
            { text: '', value: 'actions', sortable: false, align: 'end', width: '14%' },
        ]
    }

    async load(): Promise<void> {
        this.loading = true
        this.entries = await loadList<KapatHistoryEntry>(this.bridge, this.KEY)
        this.loading = false
    }

    async clearAll(): Promise<void> {
        if (!window.confirm(this.$t('Kapat.HistoryPanel.ConfirmClearAll') as string)) return
        this.entries = []
        await saveList(this.bridge, this.KEY, this.entries)
        this.$toast.success(this.$t('Kapat.HistoryPanel.ClearedToast').toString())
    }

    async removeEntry(id: string): Promise<void> {
        this.entries = this.entries.filter((e) => e.id !== id)
        await saveList(this.bridge, this.KEY, this.entries)
        this.$toast.success(this.$t('Kapat.HistoryPanel.RemovedToast').toString())
    }

    apply(e: KapatHistoryEntry): void {
        if (e.kOpt == null) return
        this.$emit('apply', e.kOpt)
    }

    fmtDatePart(iso: string): string {
        try {
            return new Date(iso).toLocaleDateString()
        } catch {
            return iso ?? '—'
        }
    }

    fmtTimePart(iso: string): string {
        try {
            return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        } catch {
            return ''
        }
    }

    fmt(v: number | null | undefined, digits = 4): string {
        return v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits)
    }
}
</script>

<style scoped>
.kapat-history-swatch {
    display: inline-block;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    vertical-align: middle;
}

.kapat-history-table :deep(td),
.kapat-history-table :deep(th) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Without this, the browser's auto table-layout sizes each column by
   its own content and dumps all leftover width onto whichever column
   happens to come out narrowest -- reads as "random" uneven gaps
   between headers. table-layout: fixed makes it actually respect the
   % widths set on each header above. */
.kapat-history-table :deep(table) {
    table-layout: fixed;
}
</style>
