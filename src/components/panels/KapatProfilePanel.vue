<template>
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
        :sweeping="sweeping"
        :last-k-opt="kapatStatus.last && kapatStatus.last.k_opt != null ? kapatStatus.last.k_opt : null"
        :collapsible="true"
        @apply="handleApply"
        @loadParams="handleLoadParams" />
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KapatSweepParams } from '@/lib/kapatGcode'
import {
    kapatController,
    ensureKapatController,
    getKapatStatus,
    isKapatSweeping,
    handleApply as controllerHandleApply,
    handleLoadParams as controllerHandleLoadParams,
    KapatStatus,
} from '@/lib/kapatController'

// Dashboard-panel wrapper around <kapat-profile-picker> -- see
// kapatController.ts. KapatProfilePicker's own internal
// snapshotForSweep/saveResultToProfile logic (PA auto-save, profile-id
// persistence) is untouched and stays correct as-is here: only one
// instance of this specific component is ever mounted at a time
// (either here or on the full KAPAT tab, never both -- different
// routes), so there's no risk of it double-firing the way a naive copy
// of Kapat.vue's own history-logging watcher would have.
@Component
export default class KapatProfilePanel extends Mixins(BaseMixin) {
    get controller() {
        return kapatController
    }

    get kapatStatus(): KapatStatus {
        return getKapatStatus()
    }

    get sweeping(): boolean {
        return isKapatSweeping()
    }

    created(): void {
        ensureKapatController(this.$store)
    }

    handleLoadParams(params: KapatSweepParams): void {
        controllerHandleLoadParams(params)
    }

    handleApply(k: number): void {
        controllerHandleApply(k)
    }
}
</script>
