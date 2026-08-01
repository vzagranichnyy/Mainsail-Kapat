<template>
    <div>
        <kapat-sweep-form
            :bridge="controller.bridge"
            :disabled="sweeping || controller.preflightBusy"
            :sweeping="sweeping"
            :params.sync="controller.sweepParams"
            :collapsible="true"
            @start="handleStart" />
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
import {
    kapatController,
    ensureKapatController,
    isKapatSweeping,
    handleStart as controllerHandleStart,
    onConfirmAction as controllerOnConfirmAction,
    onConfirmVisibleChange,
} from '@/lib/kapatController'

// Dashboard-panel wrapper around <kapat-sweep-form> -- see
// kapatController.ts for why the Start-button orchestration
// (home/heat preflight, confirmations, history logging) lives there
// instead of being duplicated per panel. This is the one KAPAT
// dashboard panel that can trigger a sweep, so it's also the one that
// needs its own <confirmation-dialog> (bound to the shared
// controller.confirmVisible flag -- the full KAPAT tab has its own
// copy of the same dialog too, but the two are never mounted at the
// same time since they live on different routes).
@Component
export default class KapatSweepPanel extends Mixins(BaseMixin) {
    get controller() {
        return kapatController
    }

    get sweeping(): boolean {
        return isKapatSweeping()
    }

    created(): void {
        ensureKapatController(this.$store)
    }

    @Watch('controller.confirmVisible')
    onConfirmVisibleWatch(visible: boolean): void {
        onConfirmVisibleChange(visible)
    }

    onConfirmAction(): void {
        controllerOnConfirmAction()
    }

    handleStart(params: KapatSweepParams): void {
        controllerHandleStart(params)
    }
}
</script>
