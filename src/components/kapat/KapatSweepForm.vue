<template>
    <panel :title="$t('Kapat.SweepForm.Title')" card-class="kapat-sweep-form" :margin-bottom="false" :collapsible="collapsible">
        <template #buttons>
            <v-btn text small @click="resetDefaults">{{ $t('Kapat.SweepForm.Reset') }}</v-btn>
        </template>
        <v-card-text>
            <v-row>
                <v-col cols="12" md="6">
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.KMin')"
                            param="kstart"
                            :target="params.kstart"
                            :min="0"
                            :max="0.15"
                            :step="0.005"
                            :dec="3"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.KMax')"
                            param="kend"
                            :target="params.kend"
                            :min="0.01"
                            :max="0.2"
                            :step="0.005"
                            :dec="3"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.KStepBisect')"
                            param="kstep"
                            :target="params.kstep"
                            :min="0.001"
                            :max="0.02"
                            :step="0.001"
                            :dec="3"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.Cycles')"
                            param="cycles"
                            :target="params.cycles"
                            :min="3"
                            :max="30"
                            :step="1"
                            :dec="0"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field kapat-field-last">
                        <number-input
                            :label="$t('Kapat.SweepForm.Wobble')"
                            param="wobble"
                            :target="params.wobble"
                            :min="0"
                            :max="0.3"
                            :step="0.01"
                            :dec="2"
                            unit="mm"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                </v-col>
                <v-col cols="12" md="6">
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.SlowFlow')"
                            param="vfrLow"
                            :target="params.vfrLow"
                            :min="0.2"
                            :max="6"
                            :step="0.02"
                            :dec="2"
                            unit="mm³/s"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.FastFlow')"
                            param="vfr"
                            :target="params.vfr"
                            :min="2"
                            :max="40"
                            :step="0.1"
                            :dec="2"
                            unit="mm³/s"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.SlowLegTime')"
                            param="tslow"
                            :target="params.tslow"
                            :min="0.2"
                            :max="3"
                            :step="0.05"
                            :dec="2"
                            unit="s"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <div class="kapat-field">
                        <number-input
                            :label="$t('Kapat.SweepForm.FastLegTime')"
                            param="tfast"
                            :target="params.tfast"
                            :min="0.05"
                            :max="1.5"
                            :step="0.05"
                            :dec="2"
                            unit="s"
                            commit-on-blur
                            @submit="onSubmit" />
                    </div>
                    <v-btn v-if="sweeping" block color="error" @click="cancel">
                        {{ $t('Kapat.SweepForm.Cancel') }}
                    </v-btn>
                    <v-btn v-else block color="primary" :disabled="disabled" @click="start">
                        {{ printerBusy ? $t('Kapat.SweepForm.PrinterBusy') : disabled ? $t('Kapat.SweepForm.Running') : $t('Kapat.SweepForm.Start') }}
                    </v-btn>
                </v-col>
            </v-row>
        </v-card-text>
    </panel>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { KapatSweepParams } from '@/lib/kapatGcode'
import { KlippyBridge } from '@/lib/kapatBridge'
import { kapatSweepState } from '@/lib/kapatSweepState'

const DEFAULTS: KapatSweepParams = {
    vfr: 19.24,
    vfrLow: 1.92,
    tslow: 1.0,
    tfast: 0.25,
    cycles: 8,
    kstart: 0.0,
    kend: 0.08,
    kstep: 0.005,
    wobble: 0.05,
}

@Component
export default class KapatSweepForm extends Mixins(BaseMixin) {
    @Prop({ required: true }) declare readonly bridge: KlippyBridge
    @Prop({ required: true }) declare readonly params: KapatSweepParams
    @Prop({ type: Boolean, default: false }) declare readonly disabled: boolean
    @Prop({ type: Boolean, default: false }) declare readonly sweeping: boolean
    @Prop({ type: Boolean, default: false }) declare readonly collapsible: boolean
    @Prop({ type: Boolean, default: false }) declare readonly printerBusy: boolean

    onSubmit({ name, value }: { name: string; value: number }): void {
        this.$emit('update:params', { ...this.params, [name]: value })
    }

    start(): void {
        this.$emit('start', this.params)
    }

    cancel(): void {
        kapatSweepState.cancelled = true
        this.bridge.cancelSweep().catch(() => {
            // Best-effort -- if this specific call fails the user can
            // just click Cancel again, and cmd_KAPAT_SWEEP's loop only
            // needs the flag to eventually be seen, not this particular
            // request to succeed.
        })
    }

    resetDefaults(): void {
        this.$emit('update:params', { ...this.params, ...DEFAULTS })
    }
}
</script>

<style scoped>
/* NumberInput's own internal `.v-input--has-state { margin-bottom: -18px
   !important }` collapses right through a plain margin-bottom placed on
   this wrapper, cancelling out the intended gap -- padding-bottom doesn't
   collapse the same way, so it's used here instead. */
.kapat-field {
    padding-bottom: 0.85rem;
}
.kapat-field-last {
    padding-bottom: 0;
}
</style>
