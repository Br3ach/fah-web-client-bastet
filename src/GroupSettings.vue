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
export default {
  props: ['config', 'cpus', 'cpuAffinity', 'cpuManagedMode', 'cpuLimit', 'classLimits',
    'gpus', 'advanced', 'version'],


  computed: {
    class_supported() {
      return !!(this.cpuAffinity && this.cpuAffinity.class_selection &&
        1 < (this.cpuAffinity.performance_levels || []).length)
    },

    pin_supported() {
      return this.class_supported && (!this.cpuManagedMode ||
        Object.values(this.config.gpus || {}).some(gpu => gpu && gpu.enabled))
    },

    pin_unavailable_reason() {
      if (!this.class_supported)
        return 'Unavailable: no distinct performance cores reported.'
      return 'Unavailable: enable a GPU in this resource group to pin its helper threads.'
    },

    cpu_count_limit() {
      const limit = this.cpuAffinity ? this.cpuLimit : this.cpus
      if (!this.cpuManagedMode && this.config.pin_to_perf_cores && this.pin_supported)
        return Math.min(limit, this.cpuAffinity.performance_levels[0].logical_cpus)
      return limit
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
    pin_changed() {
      if (!this.cpuManagedMode && this.config.pin_to_perf_cores && this.pin_supported)
        this.config.cpus = Math.min(this.config.cpus, this.cpu_count_limit)
    },

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

  .setting.pin-setting(v-if="$util.version_less('8.5.6', version)")
    HelpBalloon(:name="cpuManagedMode ? 'Pin GPU Helpers to Perf Cores' : 'Pin to Perf Cores'")
      p(v-if="cpuManagedMode").
        This setting applies only to GPU helper threads while any resource
        group uses performance-class allocation. CPU work units use their
        assigned CPU masks, including those in General groups.
      p(v-if="cpuManagedMode").
        GPU helpers share CPU resources scheduled by the operating system.
        GPU work receives its core's minimum CPU allowance and does not
        consume or expand into the group's exclusive CPU-folding budget.
      p(v-else).
        On CPUs with both performance and efficiency cores, restrict folding
        to the performance cores. Some folding cores run much slower when
        their work is split between fast and slow cores.
      p.
        This option has no effect on CPUs without efficiency cores or on macOS.
        For CPU work units in General mode without class allocation, enabling
        it limits the CPU count to performance class 1 logical CPUs. SMT
        threads count as separate logical CPUs.

    .pin-control
      input(v-model="config.pin_to_perf_cores", type="checkbox",
        :disabled="!pin_supported", @change="pin_changed",
        :title="cpuManagedMode ? 'Pin GPU helper threads to performance cores' : 'Only run folding cores on performance CPU cores'")
      small(v-if="!pin_supported") {{ pin_unavailable_reason }}

fieldset.settings.view-panel
  legend
    HelpBalloon(name="Resource Usage"): p.
      These settings control the usage of your machine's compute resources.

  .setting
    HelpBalloon(name="CPUs")
      p Choose how many CPU cores Folding@home should try to utilize.
      p.
        Reduce the number of CPUs allocated to folding if your system runs
        too slow while Folding@home is running.  Set to the maximum to earn
        the most points.  However, you may also consider reserving a few
        CPUs if you are also doing GPU folding.  GPU folding may also need
        some CPU power.

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

    .cpus-input(v-if="config.cpu_mode != 'classes'")
      input(v-model.number="config.cpus", :min="0", type="range",
        :max="cpu_count_limit", v-if="0 < cpus")
      span {{config.cpus}} of {{cpu_count_limit}}

    .cpu-classes(v-else-if="class_editable")
      .cpu-class(v-for="(level, i) in cpuAffinity.performance_levels", :key="i")
        label Performance level {{i + 1}}{{i == 0 ? ' (fastest)' : ''}}
        input(:value="class_counts[i]", min="0", type="range",
          :max="class_max(i)", @input="set_class_count(i, $event.target.value)")
        span {{class_counts[i]}} of {{classLimits[i]}}
        small(v-if="level.available_logical_cpus < level.logical_cpus").
          {{level.available_logical_cpus}} currently available
      .cpu-total Total: {{class_total}} of {{cpuLimit}} logical CPUs

    .cpu-classes-unavailable(v-else-if="config.cpu_mode == 'classes'")
      span Saved performance-class allocation: {{class_total}} CPUs.
      small.
        Editing by class is unavailable on the current topology. The client
        preserves these settings and uses runtime general allocation.

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

    .setting.pin-setting > :first-child
      width auto
      flex 0 1 auto
      min-width 0
      text-align left
      overflow-wrap anywhere

</style>
