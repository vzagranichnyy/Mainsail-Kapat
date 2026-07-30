<template>
    <div v-if="bdPerK.length">
        <div class="kapat-section-title">{{ $t('Kapat.BdMetricKOptTable.Title') }}</div>
        <p class="text--disabled" style="font-size: 0.8rem">{{ $t('Kapat.BdMetricKOptTable.Body') }}</p>
        <v-simple-table dense>
            <tbody>
                <tr v-for="name in metrics" :key="name">
                    <td>{{ name }}</td>
                    <td class="text-right">{{ fmt(kOpt[name]) }}</td>
                </tr>
            </tbody>
        </v-simple-table>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { BdKResult, perMetricKOpt } from '@/lib/kapatBdCost'

@Component
export default class KapatBdMetricKOptTable extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bdPerK: BdKResult[]
    @Prop({ required: true }) declare readonly defaultWeights: Record<string, number>

    get metrics(): string[] {
        return Object.keys(this.defaultWeights)
    }

    get kOpt(): Record<string, number | null> {
        return this.bdPerK.length ? perMetricKOpt(this.bdPerK, this.metrics) : {}
    }

    fmt(v: number | null | undefined, digits = 4): string {
        return v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(digits)
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
</style>
