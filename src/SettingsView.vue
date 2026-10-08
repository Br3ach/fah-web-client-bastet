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
import * as CPUPolicy from './CPUPolicy.js'
import * as SettingsNormalization from './SettingsNormalization.js'
import CommonSettings from './CommonSettings.vue'
import GroupSettings  from './GroupSettings.vue'


function settingsCapabilities(view) {
  return {cpuAffinity: view.cpu_affinity, availableGPUs: view.available_gpus,
    batterySettings: !!view.$util.version_less?.('8.3.1', view.version),
    loggedIn: !!view.logged_in}
}


export default {
  props: ['mach'],
  components: {CommonSettings, GroupSettings},


  data() {
    return {
      name:            this.mach.get_name(),
      initial_config:  undefined,
      config:          undefined,
      group:           '',
      new_group:       '',
      confirmed:       false,
      settings_stale:  false,
      saving:          false,
      view_active:     true,
      unlocked:        this.$util.retrieve_bool('fah-settings-unlocked'),

    }
  },


  watch: {
    'data.config'() {this.init()},

    connected(connected) {
      if (!connected) {
        if (this.config) this.settings_stale = true
        return
      }
      if (this.settings_stale && !this.name_modified && !this.config_modified)
        this.reset_settings()
      else this.init()
    }
  },


  computed: {
    logged_in() {return this.$account.logged_in},
    connected()    {return this.mach.is_connected()},
    linked()       {return this.mach.is_linked()},
    valid_name()   {return /^[\w\.-]{1,64}$/.test(this.name)},

    advanced() {
      if (this.unlocked) return true

      let config = this.config || {}

      for (let [name, group] of Object.entries(config.groups || {}))
        if (name || group.key || group.beta) return true

      return false
    },


    info()    {return this.mach.get_info()},
    data()    {return this.mach.get_data()},
    groups()  {return (this.config || {}).groups || {}},
    version() {return this.mach.get_version()},


    name_modified() {return this.name != this.mach.get_name()},


    config_modified() {
      return !this.$util.isEqual(this.initial_config, this.config)
    },


    settings_valid() {
      return this.valid_name && (this.$refs.common || {valid: true}).valid &&
        this.cpu_config_valid
    },

    confirm_dialog_buttons() {
      return [
        {name: 'cancel', icon: 'times'},
        {name: 'discard', icon: 'trash'},
        {name: 'save', icon: 'floppy-o', disabled: !this.modified || this.saving}
      ]
    },

    modified() {
      if (!this.connected || this.settings_stale || !this.settings_valid) return false
      if (this.name_modified) return true
      if (!this.config) return false
      return this.config_modified
    },


    // Explicit policy inputs keep calculations independent of Vue state and
    // preserve reactive tracking when topology, selection or saved intent changes.
    active_gpus() {return CPUPolicy.activeGPUsByGroup(this.groups, this.info)},

    saved_active_gpus() {
      return CPUPolicy.activeGPUsByGroup((this.initial_config || {}).groups, this.info)
    },

    cpu_policy_inputs() {
      return {groups: this.groups, saved_groups: (this.initial_config || {}).groups,
        active_gpus: this.active_gpus, saved_active_gpus: this.saved_active_gpus,
        info: this.info, cpu_affinity: this.cpu_affinity, group: this.group,
        isEqual: (a, b) => this.$util.isEqual(a, b)}
    },

    gpu_reservation_plan() {return CPUPolicy.gpuReservationPlan(this.cpu_policy_inputs)},

    current_group_gpu_limit() {return CPUPolicy.currentGroupGPULimit(this.cpu_policy_inputs)},

    available_cpus() {
      return CPUPolicy.availableCPUs({
        ...this.cpu_policy_inputs,
        gpu_reservation_plan: this.gpu_reservation_plan
      })
    },

    cpu_class_capacities() {
      return CPUPolicy.classCapacities({
        ...this.cpu_policy_inputs,
        gpu_reservation_plan: this.gpu_reservation_plan
      })
    },
    cpu_group_count() {return CPUPolicy.cpuGroupCount(this.cpu_policy_inputs)},
    cpu_affinity() {return this.info ? this.info.cpu_affinity : undefined},

    cpu_class_supported() {return CPUPolicy.classSupported(this.cpu_policy_inputs)},

    cpu_managed_mode() {
      return CPUPolicy.managedMode({
        ...this.cpu_policy_inputs,
        gpu_reservation_plan: this.gpu_reservation_plan
      })
    },

    cpu_runtime_fallback() {
      return !this.cpu_intent_changed && !this.reservation_policy_changed && !this.gpu_selection_changed &&
        !!(this.cpu_affinity && this.cpu_affinity.runtime_fallback)
    },

    gpu_selection_changed() {return CPUPolicy.gpuSelectionChanged(this.cpu_policy_inputs)},

    cpu_intent_changed() {return CPUPolicy.cpuIntentChanged(this.cpu_policy_inputs)},

    reservation_policy_changed() {return CPUPolicy.reservationPolicyChanged(this.cpu_policy_inputs)},

    cpu_config_valid() {
      return CPUPolicy.cpuConfigValid({
        ...this.cpu_policy_inputs,
        gpu_reservation_plan: this.gpu_reservation_plan,
        cpu_intent_changed: this.cpu_intent_changed,
        reservation_policy_changed: this.reservation_policy_changed,
        gpu_selection_changed: this.gpu_selection_changed,
        cpu_managed_mode: this.cpu_managed_mode,
        cpu_class_supported: this.cpu_class_supported,
        cpu_class_capacities: this.cpu_class_capacities
      })
    },

    current_group_cpu_limit() {
      return CPUPolicy.currentGroupCPULimit({
        ...this.cpu_policy_inputs,
        gpu_reservation_plan: this.gpu_reservation_plan,
        available_cpus: this.available_cpus
      })
    },

    current_group_class_limits() {
      return CPUPolicy.currentGroupClassLimits({
        ...this.cpu_policy_inputs,
        cpu_class_capacities: this.cpu_class_capacities,
        gpu_reservation_plan: this.gpu_reservation_plan
      })
    },

    available_gpus() {return this.info ? this.info.gpus : {}},


    gpus() {
      let gpus = []

      for (const [id, info] of Object.entries(this.available_gpus))
        gpus.push(Object.assign({id, supported: true}, info))

      return gpus
    }
  },


  beforeRouteLeave(to, from) {
    if ((!this.name_modified && !this.config_modified) || this.confirmed) return true

    this.$refs.confirm_dialog.exec().then(async response => {
      switch (response) {
      case 'save':
        if (await this.save()) {
          this.confirmed = true
          this.$router.push(to)
        }
        return

      case 'discard':
        this.confirmed = true
        this.$router.push(to)
      }
    })

    return false
  },


  mounted() {this.init()},


  beforeUnmount() {this.view_active = false},


  methods: {
    async link() {
      this.mach.set_name(this.name)
      this.mach.link(this.$adata.token)
    },


    async unlink() {
      let response = await this.$root.message('confirm', 'Unlink machine?',
        '<p>If you unlink this machine you will lose remote access.</p>' +
        '<p>Are you sure you want to unlink?', ['no', 'yes'])
      if (response != 'yes') return
      await this.mach.unlink()
      await this.$account.update()
      this.$router.back()
    },


    get_group_config(config) {
      return SettingsNormalization.normalizeGroupConfig(config, settingsCapabilities(this))
    },

    init() {
      let config = this.data.config
      if (this.config || !config || this.$util.isEmpty(config)) return

      config = SettingsNormalization.normalizeSettings(this.data, settingsCapabilities(this))

      this.config = config
      this.initial_config = this.$util.deepCopy(this.config)
    },


    reset_settings() {
      if (!this.connected || !this.data.config) return
      this.config = undefined
      this.initial_config = undefined
      this.group = ''
      this.name = this.mach.get_name()
      this.init()
      this.settings_stale = !this.config
    },

    async reload_settings() {
      if (!this.connected) return
      if (this.name_modified || this.config_modified) {
        const response = await this.$root.message('confirm', 'Reload settings?',
          'Discard your unsaved edits and load the current client settings?',
          'Cancel Reload')
        if (response != 'reload') return
      }
      this.reset_settings()
    },

    async wait_for_config(saved, submittedCapabilities) {
      // Sending is not acknowledgement. Allow delayed readback without hammering
      // a remote client, and keep the draft until the reported policy matches.
      let elapsed = 0
      let interval = 100
      while (true) {
        if (this.view_active === false)
          throw new Error('Settings confirmation cancelled.')
        if (!this.connected || this.settings_stale)
          throw new Error('Client disconnected before confirming settings.')
        const data = this.mach.get_data()
        const capabilities = {
          ...submittedCapabilities,
          availableGPUs: this.available_gpus
        }
        const actual = SettingsNormalization.normalizeSettings({...data, config: data.config || {}}, capabilities)
        const expected = SettingsNormalization.normalizeSettings(saved, capabilities)
        if (this.$util.isEqual(expected, actual)) return
        if (elapsed >= 30000) break
        const delay = Math.min(interval, 30000 - elapsed)
        await new Promise(resolve => setTimeout(resolve, delay))
        elapsed += delay
        interval = Math.min(1000, interval * 2)
      }
      throw new Error('These settings were sent, but confirmation has not arrived. Check the current settings before trying again.')
    },

    async save() {
      if (!this.connected || this.settings_stale || this.saving || !this.settings_valid) return false
      this.saving = true
      try {
        if (this.name_modified)   await this.mach.save_name(this.name)
        if (!this.connected || this.settings_stale || !this.settings_valid) return false
        if (this.config_modified) {
          const saved_config = this.$util.deepCopy(this.config)
          const capabilities = this.$util.deepCopy(settingsCapabilities(this))
          try {
            await this.mach.configure(SettingsNormalization.normalizeSettings(saved_config, capabilities))
            await this.wait_for_config(saved_config, capabilities)
            this.initial_config = saved_config
          } catch (error) {
            if (this.view_active === false) return false
            await this.$root.message('error', 'Settings save not confirmed', error.message)
            return false
          }
        }
        return !this.name_modified && !this.config_modified
      } finally {this.saving = false}
    },


    cancel() {this.close()},


    close() {
      this.confirmed = true
      this.$router.back()
    },


    async add_group() {
      this.new_group = ''
      let result = await this.$refs.new_group_dialog.exec()
      if (result != 'create') return

      let name = this.new_group.trim()
      if (!(name in this.config.groups))
        this.config.groups[name] = this.get_group_config({})

      this.group = name
    },


    async del_group() {
      let result = await this.$root.message(
        'confirm', 'Delete Resource Group?', 'Are you sure you want to ' +
          ' delete resource group "' + this.group + '"?', 'Cancel Delete')

      if (result != 'delete') return

      delete this.config.groups[this.group]
      this.group = ''
    },


    async unlock() {
      let result = await this.$root.message(
        'confirm', 'Unlock Advanced Settings?', '<p>Advanced settings are ' +
          'mainly used for testing Folding@home.</p><p>Are you sure you ' +
          'want to unlock advanced settings?</p>', 'Cancel Unlock')

      if (result != 'unlock') return

      this.unlocked = true
      this.$util.store_bool('fah-settings-unlocked', true)
    }
  }
}
</script>

<template lang="pug">
Dialog(ref="confirm_dialog", :buttons="confirm_dialog_buttons")
  template(v-slot:header) Unsaved changes
  template(v-slot:body).
    You have unsaved configuration changes.  Would you like to save your
    changes, discard them or cancel and stay on this page?

Dialog.new-group-dialog(ref="new_group_dialog", buttons="Create")
  template(v-slot:header) Add New Resource Group
  template(v-slot:body)
    label Name
    input(v-model="new_group", focused,
      @keyup.enter="$refs.new_group_dialog.close('create')")

.settings-view.page-view
  ViewHeader(title="Settings", :subtitle="mach.get_name()")
    template(v-slot:actions)
      Button(@click="cancel", text="Cancel", icon="times")

      Button(:disabled="!modified", @click="save", success, text="Save",
        icon="save")

  .view-body
    fieldset.settings.view-panel(v-if="logged_in")
      legend
        HelpBalloon(name="Machine")
          p You can rename the machine or unlink a machine you no longer use.
          p.
            Machine names can be from 1 to 64 characters in length and may
            include a-z, 0-9, dashes (-) and dots (.).
          p.
            If the local machine is linked to another account you can link it to
            this account by clicking on the #[span.fa.fa-link] icon.

      .setting
        label Name
        input(v-model="name", :class="{error: !valid_name}")

        .setting-actions
          Button.button-icon(v-if="linked", @click="unlink",
            icon="unlink", title="Unlink machine from this account")

          Button.button-icon(v-if="!linked", @click="link", icon="link",
            :disabled="!valid_name", title="Link machine to this account")

    fieldset.settings.view-panel(v-if="!logged_in && config")
      legend Account Settings
      CommonSettings(:config="config", ref="common")

    .setting(v-if="settings_stale")
      span The client disconnected. Reload settings before saving your edits.
      Button(@click="reload_settings", :disabled="!connected",
        text="Reload settings", icon="refresh")

    .setting.cpu-runtime-warning(
      v-if="connected && config && !settings_stale && cpu_runtime_fallback",
      role="status")
      span.fa.fa-warning(aria-hidden="true")
      span.
        Machine CPU allocation could not fully satisfy the current configuration.
        Saved preferences are unchanged.
        {{cpu_affinity.runtime_fallback_reason}}

    .view-pane(v-if="connected && config && !settings_stale")
      fieldset.view-panel.resource-groups(v-if="advanced")
        legend Resource Groups

        Button(v-for="(g, name) in groups", :text="name || 'Default'",
          :class="{active: group == name}", :disabled="name == group",
          @click="group = name")

        .actions
          Button(@click="del_group", icon="trash", text="Delete",
            :title="'Delete resource group ' + group", :disabled="!group")

          Button(@click="add_group", icon="plus", text="Add",
            title="Add a new resource group")

      component.group-settings(:is="advanced ? 'fieldset' : 'div'",
        :class="{'view-panel': advanced}")
        legend(v-if="advanced")
          | {{group ? '' : 'Default'}} Resource Group {{group}}

        GroupSettings(:config="groups[group]", :cpus="available_cpus",
          :cpu-affinity="cpu_affinity",
          :cpu-limit="current_group_cpu_limit", :cpu-config-valid="cpu_config_valid",
          :class-limits="current_group_class_limits", :gpus="gpus",
          :gpu-core-limit="current_group_gpu_limit",
          :gpu-reserved-cores="gpu_reservation_plan.count",
          :gpu-reserved-logical-cpus="gpu_reservation_plan.logical",
          :cpu-group-count="cpu_group_count", :group-name="group",
          :allocation-policy-changed="cpu_intent_changed || reservation_policy_changed || gpu_selection_changed",
          :advanced="advanced", :version="version")

        .setting.cpu-runtime-warning(v-if="gpu_reservation_plan.sharedBlocked")
          span.fa.fa-warning
          span.
            These reservations leave no Performance 1 CPUs for a shared GPU
            group. Reduce a reservation or reserve cores for every GPU group.

        .setting.cpu-runtime-warning(v-if="cpu_affinity && (cpu_affinity.gpu_helper_blocked_groups || {})[group]")
          span.fa.fa-warning
          span {{cpu_affinity.gpu_helper_blocked_groups[group]}}



  .actions
    Button.button-icon(v-if="!advanced && connected", @click="unlock",
      icon="lock", title="Unlock advanced settings")
</template>

<style lang="stylus">
.settings-view
  container-type inline-size
  container-name settings-page

  .view-body .view-pane
    display flex
    flex-direction row
    gap var(--gap)

    .resource-groups
      flex-direction column
      gap var(--gap)
      align-items stretch
      display flex
      width auto

      > .button
        justify-content left

      .actions
        flex 1
        flex-direction row
        align-items end

    .group-settings
      // Fieldsets otherwise retain their content's minimum width in this flex row.
      min-width 0
      display flex
      flex-direction column
      gap var(--gap)
      flex 1

      > fieldset
        min-width 0

  .actions
    display flex
    justify-content end
    gap var(--gap)

  > .actions
    opacity 0.4

.new-group-dialog .dialog-body
  display flex
  gap var(--gap)

  input
    flex 1

@container settings-page (max-width: 40em)
  .settings-view .view-body .view-pane
    flex-direction column

    .resource-groups
      width 100%
      min-width 0

@media (max-width 800px)
  .settings-view .view-body .view-pane .resource-groups > .actions
    flex-direction column
    align-items normal

    .button
      justify-content left
</style>
