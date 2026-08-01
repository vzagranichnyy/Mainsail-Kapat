<template>
    <kapat-live-chart :bridge="controller.bridge" :sensor-name="kapatStatus.load_cell_name || 'load_cell'" :collapsible="true" />
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { kapatController, ensureKapatController, getKapatStatus, KapatStatus } from '@/lib/kapatController'

// Dashboard-panel wrapper around the same <kapat-live-chart> used on
// the full KAPAT tab -- see kapatController.ts for why this reads
// shared state instead of owning its own bridge/props. Kept
// intentionally thin: KapatLiveChart already wraps itself in <panel>
// (title "Kapat.LiveChart.Title"), so no second <panel> wrapper here.
@Component
export default class KapatLoadPanel extends Mixins(BaseMixin) {
    get controller() {
        return kapatController
    }

    get kapatStatus(): KapatStatus {
        return getKapatStatus()
    }

    created(): void {
        ensureKapatController(this.$store)
    }
}
</script>
