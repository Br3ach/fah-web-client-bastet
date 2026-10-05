<!--

                  This file is part of the Folding@home Client.

          The fah-client runs Folding@home protein folding simulations.
                    Copyright (c) 2001-2026, foldingathome.org
                               All rights reserved.

       This program is free software; you can redistribute it and/or modify
       it under the terms of the GNU General Public License as published by
        the Free Software Foundation; either version 3 of the License, or
                       (at your option) any later version.

         This program is distributed in the hope that it will be useful,
          but WITHOUT ANY WARRANTY; without even the implied warranty of
          MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
                   GNU General Public License for more details.

     You should have received a copy of the GNU General Public License along
     with this program; if not, write to the Free Software Foundation, Inc.,
           51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

                  For information regarding this software email:
                                 Joseph Coffland
                          joseph@cauldrondevelopment.com

-->

<script>
import {activeGPUIds} from './GPUPolicy.js'
export default {
  props: ['config', 'cpus', 'cpuAffinity', 'cpuLimit', 'classLimits',
    'gpus', 'advanced', 'version', 'cpuConfigValid', 'gpuCoreLimit', 'gpuReservedCores', 'gpuReservedLogicalCpus', 'cpuGroupCount', 'groupName'],


  computed: {
    runtime_full_smt_units() {
      const classes = this.config.cpu_mode == 'classes'
      const count = classes ? this.class_counts.reduce((a, b) => a + Number(b), 0) : Number(this.config.cpus)
      return Object.values((this.cpuAffinity || {}).unit_allocations || {}).filter(unit =>
        unit.group == (this.groupName || '') && unit.full_smt &&
        unit.configured_cpus == count && unit.cpu_mode == (classes ? 'classes' : 'count') &&
        (!classes || JSON.stringify(unit.cpu_class_counts) == JSON.stringify(this.class_counts)))
    },

    runtime_smt_allocation() {
      const allocation = ((this.cpuAffinity || {}).group_allocations || {})[this.groupName || '']
      if (!allocation || !allocation.full_smt) return undefined
      const classes = this.config.cpu_mode == 'classes'
      const count = classes ? this.class_counts.reduce((a, b) => a + Number(b), 0) : Number(this.config.cpus)
      // Use authoritative per-group metadata only for the policy it describes.
      if (allocation.configured_cpus != count ||
          allocation.cpu_mode != (classes ? 'classes' : 'count')) return undefined
      if (classes && JSON.stringify(allocation.cpu_class_counts) != JSON.stringify(this.class_counts))
        return undefined
      return allocation
    },

    smt_warning() {
      if ((this.runtime_full_smt_units || []).length || this.runtime_smt_allocation) return true
      // Do not duplicate the allocator for several CPU groups. Their actual
      // pool capacities arrive with the authoritative allocation after Save.
      if (this.cpuGroupCount != 1) return false
      const affinity = this.cpuAffinity || {}
      const levels = affinity.performance_levels || []
      const reserved = Number(this.gpuReservedCores) || 0
      const reservedLogical = Number(this.gpuReservedLogicalCpus) || 0
      let physical = Number(affinity.physical_cpus) || 0
      let logical = Number(affinity.available) || 0
      let workers = Number(this.config.cpus) || 0
      if (this.config.cpu_mode == 'classes') {
        physical = 0
        logical = 0
        workers = 0
        this.class_counts.forEach((count, i) => {
          if (!count) return
          const level = levels[i] || {}
          physical += Number(level.physical_cpus) || 0
          logical += Number(level.available_logical_cpus ?? level.logical_cpus) || 0
          workers += Number(count)
        })
        if (!this.class_counts[0]) { return physical > 0 && logical > physical && workers == logical }
      }
      physical = Math.max(0, physical - reserved)
      logical = Math.max(0, logical - reservedLogical)
      return physical > 0 && logical > physical && workers == logical
    },

    gpu_selected() {
      return activeGPUIds(this.config, Object.fromEntries((this.gpus || [])
        .map(gpu => [gpu.id, gpu]))).length > 0
    },

    gpu_reservation_supported() {
      return !!(this.cpuAffinity && this.cpuAffinity.gpu_cpu_reservation)
    },

    class_supported() {
      return !!(this.cpuAffinity && this.cpuAffinity.class_selection &&
        1 < (this.cpuAffinity.performance_levels || []).length)
    },

    cpu_count_limit() {
      return this.cpuAffinity ? this.cpuLimit : this.cpus
    },

    class_counts() {
      return Array.isArray(this.config.cpu_class_counts) ?
        this.config.cpu_class_counts : []
    },

    class_editable() {
      return this.class_supported && this.class_counts.length ==
        (this.cpuAffinity.performance_levels || []).length
    },

    class_total() {
      return (this.config.cpu_class_counts || [])
        .reduce((a, b) => a + (Number(b) || 0), 0)
    },

    all_gpus() {
      let gpus = [...this.gpus]
      let ids  = {}
      for (const gpu of gpus) ids[gpu.id] = true

      // Add undetected GPUs
      for (const [id, gpu] of Object.entries(this.config.gpus))
        if (!ids[id])
          gpus.push({id, supported: true, description: 'Undetected'})

      return gpus
    }
  },


  methods: {
    project_key_changed() {if (!this.config.key) this.config.key = 0},

    set_cpu_mode(mode) {
      if (mode == 'classes' && !this.class_supported) return
      this.config.cpu_mode = mode
      if (mode == 'classes') {
        const levels = this.cpuAffinity.performance_levels || []
        const saved = this.config.cpu_class_counts || []
        this.config.cpu_class_counts = levels.map((_, i) => Number(saved[i]) || 0)
        this.config.cpus = this.class_total
      }
    },

    class_max(i) {
      const current = Number(this.class_counts[i]) || 0
      const room = Math.max(0, this.cpuLimit - this.class_total)
      return Math.max(0, Math.min(this.classLimits[i] || 0, current + room))
    },

    set_class_count(i, raw) {
      if (!this.class_editable || this.config.cpu_mode != 'classes') return
      if (!Number.isInteger(i) || i < 0 || i >= this.config.cpu_class_counts.length) return
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0 || value > this.class_max(i)) return
      const counts = [...this.config.cpu_class_counts]
      counts[i] = value
      this.config.cpu_class_counts = counts
      this.config.cpus = counts.reduce((sum, count) => sum + (Number(count) || 0), 0)
    }
  }
}
</script>

<template lang="pug">
fieldset.settings.view-panel
  legend
    HelpBalloon(name="Scheduling"): p.
      These settings control when Folding@home runs.

  .setting
    HelpBalloon(name="Only When Idle"): p.
      Enable folding only when your machine is idle.  I.e. when the mouse
      and keyboard are not being used.  Note that folding will not start
      when idle if your machine goes to sleep first.

    input(v-model="config.on_idle", type="checkbox",
      title="Only fold when machine is idle")

  template(v-if="$util.version_less('8.3.1', version)")
    .setting
      HelpBalloon(name="While On Battery"): p.
        If this option is disabled, folding will pause when your machine is
        running on battery power.

      input(v-model="config.on_battery", type="checkbox",
        title="Allow folding when machine is on battery")

    .setting
      HelpBalloon(name="Keep Awake"): p.
        When enabled, this option prevents your machine from going to sleep
        while folding is active and your machine is not on battery power.

      input(v-model="config.keep_awake", type="checkbox",
        title="Prevent system sleep when folding and not on battery")

fieldset.settings.view-panel
  legend
    HelpBalloon(name="Resource Usage"): p.
      These settings control the usage of your machine's compute resources.

  .setting
    HelpBalloon(name="CPUs")
      p Choose how many logical CPUs Folding@home should try to utilize.
      p.
        Reduce the number of CPUs allocated to folding if your system runs
        too slow while Folding@home is running. You may also consider
        reserving a few CPUs if you are also doing GPU folding. GPU folding
        may also need some CPU power.

    .cpu-mode(v-if="cpuAffinity")
      label
        input(type="radio", name="cpu-mode", value="count",
          :checked="config.cpu_mode != 'classes'",
          @change="set_cpu_mode('count')")
        | General
      label(:class="{disabled: !class_supported}")
        input(type="radio", name="cpu-mode", value="classes",
          :disabled="!class_supported", :checked="config.cpu_mode == 'classes'",
          @change="set_cpu_mode('classes')")
        | By performance class

    .cpu-classes(v-if="config.cpu_mode == 'classes' && class_editable")
      .cpu-class(v-for="(level, i) in cpuAffinity.performance_levels", :key="i")
        label Performance level {{i + 1}}{{i == 0 ? ' (fastest)' : ''}}
        input(:value="class_counts[i]", min="0", type="range",
          :max="class_max(i)", @input="set_class_count(i, $event.target.value)")
        span {{class_counts[i]}} selected, up to {{class_max(i)}}
        small(v-if="level.available_logical_cpus < level.logical_cpus").
          {{level.available_logical_cpus}} currently available
      .cpu-total Total: {{class_total}} selected, group limit {{cpuLimit}} logical CPUs

    .cpu-classes-unavailable(v-else-if="config.cpu_mode == 'classes'")
      span Saved performance-class allocation: {{class_total}} logical CPUs.
      small.
        Editing by class is unavailable on the current topology. The client
        preserves these settings and uses runtime general allocation.

  .setting.cpu-count-row(v-if="config.cpu_mode != 'classes'")
    span(aria-hidden="true")
    .cpus-input
      input(v-model.number="config.cpus", :min="0", type="range",
        :max="cpu_count_limit", v-if="0 < cpus")
      span {{config.cpus}} selected, up to {{cpu_count_limit}} logical CPUs

  .setting.cpu-budget-note(v-if="cpuAffinity")
    span(aria-hidden="true")
    small
      span.fa.fa-info-circle(aria-hidden="true")
      |  Limits account for GPU reservations and other groups' CPU settings. Performance-class limits share the group's total budget and cannot be added together. General-mode groups may be reassigned between performance levels when you save.

  .setting.cpu-config-error(v-if="cpuConfigValid === false", role="alert")
    span.fa.fa-warning(aria-hidden="true")
    span CPU or GPU reservations exceed the available topology or performance-core limit.

  .cpu-smt-warning(v-if="smt_warning", role="status")
    span.fa.fa-warning
    span.
      Full SMT utilisation may reduce performance. Using all hardware threads
      of an allocated physical-core pool can increase contention. Some CPU workloads may
      perform better with one fewer worker. Consider reducing the CPU count by
      one and comparing performance.
    small(v-if="runtime_full_smt_units.length").
      Affected work units: {{runtime_full_smt_units.map(unit => 'WU' + unit.number).join(', ')}}

  .setting
    HelpBalloon(name="GPUs")
      p Choose which of your GPUs to run Folding@home on.
      p.
        Some GPUs are not supported by Folding@home either because they are
        too old, too new, the necessary driver software is missing from your
        computer or the GPU has known bugs that prevent folding from working
        correctly.  If your GPU is not supported you will not be able to
        enable it.

      p Either CUDA, HIP, or OpenCL is required for folding.


    .gpu-resources
      table.gpus-input.view-table
        thead
          tr
            th Description
            th Enabled

        tbody
          tr.gpu-row(v-for="gpu in all_gpus",
            :class="{unsupported: !gpu.supported}",
            :title="gpu.supported ? `${gpu.id} ${gpu.description}` : \
              'Unsupported GPU'")
            td.gpu-description {{gpu.description}}

            td.gpu-enabled
              input(v-if="gpu.supported", type="checkbox",
                v-model="config.gpus[gpu.id].enabled")
              span(v-else) Unsupported

      .gpu-reservation(v-if="gpu_selected && cpuAffinity && 'gpu_cpu_reservation' in cpuAffinity")
        HelpBalloon(name="CPU Cores Reserved for GPU Folding")
          p.
            Reserve this many Performance 1 physical cores for each enabled GPU
            in this resource group. Each GPU receives a separate reservation. This may improve GPU folding performance by
            reducing competition with CPU folding. Each reserved core, including
            all of its logical threads, becomes unavailable for CPU folding in
            every resource group.
          p.
            A setting of 0, the default, reserves no cores. GPU folding shares
            the remaining Performance 1 cores, even when they are also used for
            CPU folding. Cores reserved by other resource groups are excluded.
          p(v-if="!gpu_reservation_supported") Hard affinity or Performance 1 topology is unavailable.
        .gpu-reservation-control
          input(v-model.number="config.gpu_reserved_cores", type="range", min="0",
            :max="gpuCoreLimit", :disabled="!gpu_selected || !gpu_reservation_supported",
            title="Physical Performance 1 cores reserved per enabled GPU")
          span {{config.gpu_reserved_cores || 0}} of {{gpuCoreLimit}}

fieldset.settings.view-panel(v-if="advanced")
  legend
    HelpBalloon(name="Advanced"): p.
      These settings are for testing Folding@home.

  .setting
    HelpBalloon(name="Beta Projects"): p.
      Enable folding of beta projects.  Beta projects are in testing and may
      fail and cause you to lose points.

    input(v-model="config.beta", type="checkbox",
      title="Enable beta projects")

  .setting
    HelpBalloon(name="Project Key"): p.
      Project keys are used for internal testing of folding projects.
      Unless you are specially instructed by a Folding@home researcher to
      use a project key, leave this field set to zero.

    input(v-model="config.key", type="number", title="Project key",
      pattern="\\d+", @change="project_key_changed")

  .setting
    HelpBalloon(name="Enable CUDA"): p.
      Enable CUDA support.  Normally this should be left enabled.  Disabling
      CUDA is used for testing purposes.

    input(v-model="config.cuda", type="checkbox", title="Enable CUDA")

  .setting
    HelpBalloon(name="Enable HIP"): p.
      Enable HIP support.  Normally this should be left enabled.  Disabling
      HIP is used for testing purposes.

    input(v-model="config.hip", type="checkbox", title="Enable HIP")
</template>

<style lang="stylus">
.settings-view
  fieldset
   .cpus-input
      display flex
      gap var(--gap)

      > :first-child
        flex 1

      > span
        white-space normal
        min-width 0

    .gpu-resources
      min-width 0

      > table
        width 100%

    .gpu-reservation
      display flex
      flex-direction column
      gap calc(var(--gap) / 2)
      margin var(--gap) 0

      > :first-child
        width auto
        text-align left

      .gpu-reservation-control
        display flex
        align-items center
        gap var(--gap)

        input
          flex 1
          min-width 0
          width 100%

        span
          white-space nowrap

    .cpu-mode
      display flex
      flex-wrap wrap
      gap var(--gap)

      .disabled
        opacity 0.5

    .cpu-classes
      display flex
      flex-direction column
      gap calc(var(--gap) / 2)

      .cpu-class
        display grid
        grid-template-columns minmax(11em, auto) 1fr auto
        gap var(--gap)
        align-items center

        small
          grid-column 2 / 4

      .cpu-total
        text-align right
        font-weight bold

    .cpu-classes-unavailable
      display flex
      flex-direction column
      gap calc(var(--gap) / 2)
      opacity 0.8

    .cpu-budget-note
      > small
        min-width 0

    .cpu-config-error
      align-items baseline

      > :last-child
        min-width 0

    .cpu-smt-warning
      display flex
      flex-wrap wrap
      gap var(--gap)
      padding var(--gap)

    .gpus-input
      .gpu-row
        &.unsupported td
          opacity 0.4

        .gpu-enabled, .cuda-enabled, .hip-enabled
          text-align center

      .gpu-description
        max-width 10em
        width 100%
        white-space nowrap
        overflow hidden
        text-overflow ellipsis

    .setting > :first-child
      width 9em

@media (max-width 800px)
  .settings-view fieldset
    .cpu-budget-note > :first-child, .cpu-count-row > :first-child
      display none

</style>
