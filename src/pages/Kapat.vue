<template>
    <div>
        <v-row>
            <v-col cols="12">
                <span class="text--disabled">{{ $t('Kapat.Tagline') }}</span>
                <span class="ml-3" :class="statusError ? 'error--text' : 'success--text'">{{ statusLine }}</span>
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12">
                <kapat-live-chart ref="chart" :bridge="controller.bridge" :sensor-name="kapatStatus.load_cell_name || 'load_cell'" />
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12" md="8">
                <kapat-sweep-form
                    :bridge="controller.bridge"
                    :disabled="sweeping || controller.preflightBusy || printerIsPrinting"
                    :printer-busy="printerIsPrinting"
                    :sweeping="sweeping"
                    :params.sync="controller.sweepParams"
                    @start="handleStart" />
            </v-col>
            <v-col cols="12" md="4">
                <kapat-profile-picker
                    :bridge="controller.bridge"
                    :sweep-params="controller.sweepParams"
                    :label.sync="controller.profileLabel"
                    :temp.sync="controller.profileTemp"
                    :filament-type.sync="controller.profileFilamentType"
                    :brand.sync="controller.profileBrand"
                    :color.sync="controller.profileColor"
                    :profile-id.sync="controller.profileId"
                    :calib-x.sync="controller.calibX"
                    :calib-y.sync="controller.calibY"
                    :calib-z.sync="controller.calibZ"
                    :post-gcode.sync="controller.postGcode"
                    :sweeping="sweeping"
                    :last-k-opt="kapatStatus.last && kapatStatus.last.k_opt != null ? kapatStatus.last.k_opt : null"
                    @apply="handleApply"
                    @loadParams="handleLoadParams" />
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12">
                <kapat-history-panel :bridge="controller.bridge" @apply="handleApply" />
            </v-col>
        </v-row>
        <v-row>
            <v-col cols="12">
                <panel :title="$t('Kapat.AnalysisSection.Title')" card-class="kapat-analysis-section" :collapsible="true">
                    <v-card-text>
                        <kapat-analysis-panel :bridge="controller.bridge" />

                        <template v-if="bdPerK.length && hasBdComposite">
                            <v-divider class="my-4" />
                            <kapat-bd-composite :bd-per-k="bdPerK" :default-weights="bdWeights" :notes="kapatStatus.last && kapatStatus.last.notes ? kapatStatus.last.notes : []" />

                            <v-divider class="my-4" />
                            <kapat-bd-metric-k-opt-table :bd-per-k="bdPerK" :default-weights="bdWeights" />

                            <v-divider class="my-4" />
                            <kapat-bd-metric-grid :bd-per-k="bdPerK" />
                        </template>

                        <template v-if="kapatStatus.last && kapatStatus.last.per_k && kapatStatus.last.per_k.length">
                            <v-divider class="my-4" />
                            <kapat-results-panel :last="kapatStatus.last" />
                        </template>
                    </v-card-text>
                </panel>
            </v-col>
        </v-row>

        <confirmation-dialog
            v-model="controller.confirmVisible"
            :title="controller.confirmTitle"
            :text="controller.confirmText"
            :action-button-text="$t('Kapat.Confirm.Continue').toString()"
            action-button-color="primary"
            @action="onConfirmAction" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KapatSweepParams } from '@/lib/kapatGcode'
import { BdKResult } from '@/lib/kapatBdCost'
import {
    kapatController,
    ensureKapatController,
    getKapatStatus,
    isKapatSweeping,
    kapatHasData,
    handleStart as controllerHandleStart,
    handleApply as controllerHandleApply,
    handleLoadParams as controllerHandleLoadParams,
    onConfirmAction as controllerOnConfirmAction,
    onConfirmVisibleChange,
    KapatStatus,
} from '@/lib/kapatController'

@Component
export default class PageKapat extends Mixins(BaseMixin) {
    get controller() {
        return kapatController
    }

    created(): void {
        ensureKapatController(this.$store)
    }

    get kapatStatus(): KapatStatus {
        return getKapatStatus()
    }

    get bdPerK(): BdKResult[] {
        return this.kapatStatus.last?.bd_per_k ?? []
    }

    // A true bisection sweep only ever visits a handful of sparse,
    // non-uniformly-spaced K's -- not enough (and not evenly enough
    // spread) for a composite/per-metric trend-across-K to mean
    // anything. The backend already signals this by leaving
    // bd_composite_k_opt null in that case (see __init__.py's
    // cmd_KAPAT_SWEEP, bisect_true branch) -- BdComposite/
    // BdMetricKOptTable/BdMetricGrid all recompute their own numbers
    // client-side from bdPerK regardless of this flag, so it's used
    // purely to decide whether to render them at all, not to feed them
    // a value.
    get hasBdComposite(): boolean {
        return this.kapatStatus.last?.bd_composite_k_opt != null
    }

    get bdWeights(): Record<string, number> {
        return this.kapatStatus.last?.bd_weights ?? {}
    }

    get kapatHasData(): boolean {
        return kapatHasData()
    }

    get sweeping(): boolean {
        return isKapatSweeping()
    }

    // printerIsPrinting itself comes from BaseMixin (used app-wide in
    // Mainsail already) -- no need to re-derive it here.

    get statusLine(): string {
        if (kapatController.actionStatus !== null) return kapatController.actionStatus
        if (!this.kapatHasData) return this.$t('Kapat.Status.Connecting') as string
        return this.sweeping ? (this.$t('Kapat.Status.Running') as string) : (this.$t('Kapat.Status.Idle') as string)
    }

    get statusError(): boolean {
        return kapatController.actionStatus !== null && kapatController.actionError
    }

    @Watch('controller.confirmVisible')
    onConfirmVisibleWatch(visible: boolean): void {
        onConfirmVisibleChange(visible)
    }

    onConfirmAction(): void {
        controllerOnConfirmAction()
    }

    handleLoadParams(params: KapatSweepParams): void {
        controllerHandleLoadParams(params)
    }

    handleStart(params: KapatSweepParams): void {
        const chart = this.$refs.chart as { reset?: () => void } | undefined
        controllerHandleStart(params, () => chart?.reset?.())
    }

    handleApply(k: number): void {
        controllerHandleApply(k)
    }
}
</script>
