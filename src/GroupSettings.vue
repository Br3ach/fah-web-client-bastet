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
import * as CPUStatus from './CPUStatus.js'
import * as CPUPolicy from './CPUPolicy.js'
export default {
  props: ['config', 'cpus', 'cpuAffinity', 'cpuLimit', 'classLimits',
    'gpus', 'advanced', 'version', 'cpuConfigValid', 'gpuCoreLimit', 'gpuReservedCores', 'gpuReservedLogicalCpus', 'cpuGroupCount', 'groupName', 'allocationPolicyChanged'],


  computed: {
    gpu_priority_options() {
      const labels = {'': 'No override', idle: 'Idle', 'below-normal': 'Below normal',
        normal: 'Normal', 'above-normal': 'Above normal', high: 'High',
        'other-low': 'SCHED_OTHER - Low (nice 10)', 'other-normal': 'SCHED_OTHER - Normal (nice 0)'}
      return (this.cpuAffinity?.gpu_priority_options || []).map(value => ({value, label: labels[value] || value}))
    },
    runtime_cpu_units() {
      return CPUStatus.matchingRuntimeUnits({config: this.config, classCounts: this.class_counts,
        cpuAffinity: this.cpuAffinity, groupName: this.groupName,
        allocationPolicyChanged: this.allocationPolicyChanged})
    },

    runtime_full_smt_units() {
      return CPUStatus.matchingFullSMTUnits(this.runtime_cpu_units)
    },

    runtime_cpu_allocation() {
      return CPUStatus.matchingRuntimeAllocation({config: this.config, classCounts: this.class_counts,
        cpuAffinity: this.cpuAffinity, groupName: this.groupName,
        allocationPolicyChanged: this.allocationPolicyChanged})
    },

    runtime_smt_allocation() {
      return CPUStatus.runtimeSMTAllocation(this.runtime_cpu_allocation)
    },

    draft_class_warning() {
      return CPUPolicy.classCapacityWarning({config: this.config, classCounts: this.class_counts,
        cpuAffinity: this.cpuAffinity, reservedLogicalCpus: this.gpuReservedLogicalCpus})
    },

    runtime_cpu_shortage() {
      return CPUStatus.runtimeCPUShortage(this.runtime_cpu_allocation)
    },

    smt_warning() {
      return CPUStatus.hasSMTWarning({config: this.config, classCounts: this.class_counts,
        cpuAffinity: this.cpuAffinity, cpuGroupCount: this.cpuGroupCount,
        gpuReservedCores: this.gpuReservedCores, gpuReservedLogicalCpus: this.gpuReservedLogicalCpus,
        runtimeUnits: this.runtime_cpu_units, fullSMTUnits: this.runtime_full_smt_units,
        smtAllocation: this.runtime_smt_allocation})
    },

    smt_warning_classes() {
      return CPUStatus.smtWarningClasses(this.smt_warning, this.class_counts, this.cpuAffinity,
        {runtimeUnits: this.runtime_cpu_units, smtAllocation: this.runtime_smt_allocation,
          gpuReservedCores: this.gpuReservedCores,
          gpuReservedLogicalCpus: this.gpuReservedLogicalCpus})
    },

    smt_warning_text() {
      return CPUStatus.smtWarningText(this.runtime_full_smt_units)
    },

    gpu_selected() {
      return activeGPUIds(this.config, Object.fromEntries((this.gpus || [])
        .map(gpu => [gpu.id, gpu]))).length > 0
    },

    gpu_reservation_supported() {
      return !!(this.cpuAffinity && this.cpuAffinity.gpu_cpu_reservation)
    },

    class_supported() {
      return CPUPolicy.classSupported({cpu_affinity: this.cpuAffinity})
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
      return CPUPolicy.classTotal(this.class_counts)
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

    clear_gpu_reservation() {this.config.gpu_reserved_cores = 0},

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

    // Each class has its own ceiling, but all class selections also share the
    // group total budget. General groups consume total capacity without a
    // prospective assignment to a specific performance level.
    class_max(i) {
      return CPUPolicy.classMaximum(this.class_counts, this.classLimits, this.cpuLimit, i)
    },

    set_class_count(i, raw) {
      if (!this.class_editable || this.config.cpu_mode != 'classes') return
      if (!Number.isInteger(i) || i < 0 || i >= this.config.cpu_class_counts.length) return
      const value = CPUPolicy.parseCPUCount(raw, this.class_max(i))
      if (value === undefined) return
      const counts = [...this.config.cpu_class_counts]
      counts[i] = value
      this.config.cpu_class_counts = counts
      this.config.cpus = CPUPolicy.classTotal(counts)
    },

    set_cpu_count(raw) {
      const value = CPUPolicy.parseCPUCount(raw, this.cpu_count_limit)
      if (value !== undefined) this.config.cpus = value
    },

    set_gpu_reserved_cores(raw) {
      if (!this.gpu_selected || !this.gpu_reservation_supported) return
      const value = CPUPolicy.parseCPUCount(raw, this.gpuCoreLimit)
      if (value !== undefined) this.config.gpu_reserved_cores = value
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
      p.
        General mode chooses a CPU worker count without choosing performance
        levels. On hybrid CPUs, when every CPU group uses General mode and no
        active exclusive GPU core reservations exist, the client leaves process
        affinity unrestricted so the operating system continues to choose between
        core types. This preserves existing scheduling behaviour.
      p.
        Performance-class settings or active exclusive GPU core reservations
        enable managed allocation to enforce those resource boundaries, including
        for General groups. On supported homogeneous CPUs, General mode uses
        managed allocation with one logical CPU per physical core until SMT is
        needed. The client sets process affinity, not individual thread placement.

    .cpu-mode(v-if="cpuAffinity")
      label
        input(type="radio", name="cpu-mode", value="count",
          :checked="config.cpu_mode != 'classes'",
          @change="set_cpu_mode('count')")
        | General
      .cpu-class-mode
        label(:class="{disabled: !class_supported}")
          input(type="radio", name="cpu-mode", value="classes",
            :disabled="!class_supported", :checked="config.cpu_mode == 'classes'",
            @change="set_cpu_mode('classes')")
          | By performance class
        HelpBalloon(name="CPU allocation limits", icon="info-circle", :icon-only="true")
          p.
            When performance classes or exclusive GPU reservations are used,
            limits account for other groups' CPU settings. General-only groups
            without exclusive reservations may request overlapping capacity;
            fewer workers may run when resources are shared.
          p.
            Performance-class limits share the group's total budget and cannot
            be added together. Class shortages reduce workers without moving
            them to other levels. General-mode groups may be reassigned between
            performance levels when you save.

    .cpu-classes(v-if="config.cpu_mode == 'classes' && class_editable")
      .cpu-class(v-for="(level, i) in cpuAffinity.performance_levels", :key="i")
        label Performance level {{i + 1}}{{i == 0 ? ' (fastest)' : ''}}
        input(:value="class_counts[i]", min="0", type="range",
          :max="class_max(i)", @input="set_class_count(i, $event.target.value)")
        span
          | {{class_counts[i]}} selected, up to {{class_max(i)}}
          HelpBalloon.cpu-smt-help(v-if="smt_warning_classes.includes(i)",
            name="Full SMT utilisation warning", icon="warning", :icon-only="true")
            p {{smt_warning_text}}
            p(v-if="runtime_full_smt_units.length").
              Affected work units: {{runtime_full_smt_units.map(unit => 'WU' + unit.number).join(', ')}}
        small(v-if="level.available_logical_cpus < level.logical_cpus").
          {{level.available_logical_cpus}} currently available
      .cpu-total
        | Total: {{class_total}} selected, group limit {{cpuLimit}} logical CPUs
        HelpBalloon.cpu-smt-help(v-if="smt_warning && !smt_warning_classes.length",
          name="Full SMT utilisation warning", icon="warning", :icon-only="true")
          p {{smt_warning_text}}
          p(v-if="runtime_full_smt_units.length").
            Affected work units: {{runtime_full_smt_units.map(unit => 'WU' + unit.number).join(', ')}}

    .cpu-classes-unavailable(v-else-if="config.cpu_mode == 'classes'")
      span
        | Saved performance-class allocation: {{class_total}} logical CPUs.
        HelpBalloon.cpu-smt-help(v-if="smt_warning",
          name="Full SMT utilisation warning", icon="warning", :icon-only="true")
          p {{smt_warning_text}}
          p(v-if="runtime_full_smt_units.length").
            Affected work units: {{runtime_full_smt_units.map(unit => 'WU' + unit.number).join(', ')}}
      small.
        Editing by class is unavailable on the current topology. The client
        preserves these settings. CPU jobs wait when the selected classes or
        required affinity cannot be provided.

  .setting.cpu-count-row(v-if="config.cpu_mode != 'classes'")
    span(aria-hidden="true")
    .cpus-input
      input(:value="config.cpus", @input="set_cpu_count($event.target.value)", :min="0", type="range",
        :max="cpu_count_limit", v-if="0 < cpus")
      span
        | {{config.cpus}} selected, up to {{cpu_count_limit}} logical CPUs
        HelpBalloon.cpu-smt-help(v-if="smt_warning",
          name="Full SMT utilisation warning", icon="warning", :icon-only="true")
          p {{smt_warning_text}}
          p(v-if="runtime_full_smt_units.length").
            Affected work units: {{runtime_full_smt_units.map(unit => 'WU' + unit.number).join(', ')}}

  .setting.cpu-zero-action(v-if="config.cpu_mode != 'classes' && cpu_count_limit === 0 && config.cpus > 0")
    span(aria-hidden="true")
    Button(@click="set_cpu_count('0')",
      text="Set CPU count to zero",
      title="Remove CPU folding demand so these settings can be saved")

  .setting.cpu-budget-note(v-if="draft_class_warning", role="status")
    span(aria-hidden="true")
    small
      span.fa.fa-warning(aria-hidden="true")
      |  {{draft_class_warning}}

  .setting.cpu-budget-note(v-if="runtime_cpu_shortage", role="status")
    span(aria-hidden="true")
    small
      span.fa.fa-info-circle(aria-hidden="true")
      |  {{runtime_cpu_shortage.configured_cpus}} CPU workers requested. Currently allocated: {{runtime_cpu_shortage.allocated_workers}}. Your saved setting is unchanged.

  .setting.cpu-config-error(v-if="cpuConfigValid === false", role="alert")
    span.fa.fa-warning(aria-hidden="true")
    span These CPU or GPU allocation settings cannot be saved with the currently available resources and capabilities.

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

      .gpu-priority(v-if="config.gpu_priority || (gpu_selected && gpu_priority_options.length > 1)")
        HelpBalloon(name="GPU Folding CPU Priority")
          p.
            Sets the CPU priority of GPU folding jobs in this resource group, including their
            helper threads on reserved CPU cores. Higher priority may improve GPU folding
            performance, but can make other applications less responsive. Results depend on
            the folding core and system load. No override keeps the usual behavior. Options
            that normally require elevated privileges are not offered.
        select(v-model="config.gpu_priority", :disabled="!gpu_priority_options.length")
          option(v-for="option in gpu_priority_options", :key="option.value", :value="option.value") {{option.label}}
        small(v-if="!gpu_selected") No active GPU. The saved override can still be removed.
        small(v-if="gpu_priority_options.some(option => option.value.startsWith('other-'))") Changes take effect on the next core launch.
        small(v-else) Changes apply live, including while the core is starting.
        Button(v-if="config.gpu_priority", @click="config.gpu_priority = ''", text="Remove override", icon="times")
      .gpu-reservation(v-if="config.gpu_reserved_cores > 0 || (gpu_selected && cpuAffinity && 'gpu_cpu_reservation' in cpuAffinity)")
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
        small(v-if="!gpu_selected").
          No GPU is currently active in this group. The saved reservation uses no CPU cores and can be removed below.
        .gpu-reservation-control
          input(:value="config.gpu_reserved_cores", @input="set_gpu_reserved_cores($event.target.value)", type="range", min="0",
            :max="gpuCoreLimit", :disabled="!gpu_selected || !gpu_reservation_supported",
            title="Physical Performance 1 cores reserved per enabled GPU")
          span {{config.gpu_reserved_cores || 0}} of {{gpuCoreLimit}}
        Button(v-if="config.gpu_reserved_cores > 0",
          @click="clear_gpu_reservation", text="Remove reservation",
          title="Stop reserving CPU cores for this group's GPUs")

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

    .gpu-priority
      margin-top 1em
      select, small
        display block
        margin-top .5em
        max-width 100%

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

    .cpu-class-mode
      display inline-flex
      align-items baseline
      gap 0.35em
      min-width 0

    .cpu-classes
      // React to the space left beside the resource-group selector, not just
      // the browser viewport. The panel can be narrow on a desktop too.
      container-type inline-size
      container-name cpu-classes
      width 100%
      min-width 0
      display flex
      flex-direction column
      gap calc(var(--gap) / 2)

      .cpu-class
        display grid
        grid-template-columns minmax(0, 1fr) minmax(0, 1fr) auto
        gap var(--gap)
        align-items center

        label
          min-width 0
          white-space normal

        input
          min-width 0
          width 100%

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

    .cpu-smt-help
      margin-left 0.35em
      white-space nowrap

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

@container cpu-classes (max-width: 40em)
  .settings-view fieldset .cpu-classes .cpu-class
    grid-template-columns minmax(0, 1fr) auto

    > label, > small
      grid-column 1 / -1

@media (max-width 800px)
  .settings-view fieldset
    .cpu-class-mode .help-content
      position fixed
      top 8px
      left 0
      width auto
      max-width calc(100vw - 6px)

    .cpu-classes .cpu-class
      grid-template-columns minmax(0, 1fr) auto

      label
        grid-column 1 / -1

      small
        grid-column 1 / -1

    .cpu-budget-note > :first-child, .cpu-count-row > :first-child,
    .cpu-zero-action > :first-child
      display none

</style>
