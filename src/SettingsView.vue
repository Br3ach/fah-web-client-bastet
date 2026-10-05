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
import CommonSettings from './CommonSettings.vue'
import GroupSettings  from './GroupSettings.vue'


function copy_keys(config, keys) {
  let copy = {}

  for (let key of keys)
    copy[key] = config[key]

  return copy
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
      unlocked:        this.$util.retrieve_bool('fah-settings-unlocked'),

      confirm_dialog_buttons: [
        {name: 'cancel',  icon: 'times'},
        {name: 'discard', icon: 'trash'},
        {name: 'save',    icon: 'floppy-o'}
      ],
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


    keys() {
      let keys = ['on_idle', 'cpus', 'gpus', 'beta', 'key']

      if (!this.logged_in)
        return keys.concat(['user', 'team', 'passkey', 'cause'])

      return keys
    },


    info()    {return this.mach.get_info()},
    data()    {return this.mach.get_data()},
    groups()  {return (this.config || {}).groups || {}},
    version() {return this.mach.get_version()},


    name_modified() {return this.name != this.mach.get_name()},


    config_modified() {
      return !this.$util.isEqual(this.initial_config, this.config)
    },


    modified() {
      if (!this.connected || this.settings_stale) return false
      if (!this.valid_name) return false
      if (!(this.$refs.common || {valid: true}).valid) return false
      if (!this.cpu_config_valid) return false
      if (this.name_modified) return true
      if (!this.config) return false
      return this.config_modified
    },


    gpu_reservation_plan() {
      const cores = (this.cpu_affinity || {}).performance1_core_threads || []
      let count = 0
      let valid = true
      for (const group of Object.values(this.groups)) {
        const value = Number(group.gpu_reserved_cores || 0)
        if (!Number.isInteger(value) || value < 0) valid = false
        count += Math.max(0, value) *
          activeGPUIds(group, (this.info || {}).gpus).length
      }
      if (count && (!(this.cpu_affinity || {}).gpu_cpu_reservation || count > cores.length))
        valid = false
      const logical = cores.slice(0, count).reduce((a, b) => a + b, 0)
      const fast = ((this.cpu_affinity || {}).performance_levels || [])[0] || {}
      const availableFast = fast.available_logical_cpus ?? fast.logical_cpus ??
        cores.reduce((a, b) => a + b, 0)
      const sharedBlocked = count > 0 && logical >= availableFast &&
        Object.values(this.groups).some(group => !Number(group.gpu_reserved_cores || 0) &&
          activeGPUIds(group, (this.info || {}).gpus).length > 0)
      if (sharedBlocked) valid = false
      return {count, valid, sharedBlocked, logical}
    },

    current_group_gpu_limit() {
      const cores = (this.cpu_affinity || {}).performance1_core_threads || []
      let other = 0
      for (const [name, group] of Object.entries(this.groups))
        if (name != this.group && activeGPUIds(group, (this.info || {}).gpus).length > 0)
          other += (Number(group.gpu_reserved_cores) || 0) *
            activeGPUIds(group, (this.info || {}).gpus).length
      const selected = activeGPUIds(this.groups[this.group] || {}, (this.info || {}).gpus).length
      return selected ? Math.floor(Math.max(0, cores.length - other) / selected) : 0
    },

    available_cpus() {
      if (!this.info) return 0
      const plan = this.gpu_reservation_plan
      if (plan && plan.count)
        return Math.max(0, (this.cpu_affinity.available ?? this.info.cpus) - plan.logical)
      return this.info.cpus
    },

    cpu_class_capacities() {
      const levels = (this.cpu_affinity || {}).performance_levels || []
      const plan = this.gpu_reservation_plan
      return levels.map((level, i) => plan && plan.count ?
        Math.max(0, (level.available_logical_cpus ?? level.logical_cpus) - (i == 0 ? plan.logical : 0)) :
        level.logical_cpus)
    },
    cpu_group_count() {
      return Object.values(this.groups).filter(g => g.cpu_mode == 'classes' ?
        (g.cpu_class_counts || []).some(n => Number(n) > 0) : Number(g.cpus) > 0).length
    },
    cpu_affinity() {return this.info ? this.info.cpu_affinity : undefined},

    cpu_class_supported() {
      return !!(this.cpu_affinity && this.cpu_affinity.class_selection &&
        1 < (this.cpu_affinity.performance_levels || []).length)
    },

    cpu_managed_mode() {
      return Object.values(this.groups).some(g => g.cpu_mode == 'classes') ||
        !!(this.gpu_reservation_plan && this.gpu_reservation_plan.count)
    },

    cpu_runtime_fallback() {
      return !!(this.cpu_affinity && this.cpu_affinity.runtime_fallback)
    },

    gpu_policy_changed() {
      const devices = groups => Object.fromEntries(Object.entries(groups || {})
        .map(([name, group]) => [name, activeGPUIds(group, (this.info || {}).gpus)]))
      return !this.$util.isEqual(devices((this.initial_config || {}).groups), devices(this.groups))
    },

    cpu_policy_changed() {
      const policy = groups => Object.fromEntries(Object.entries(groups || {})
        .map(([name, group]) => [name, {
          ...(group.cpu_mode == 'classes' ?
            {mode: 'classes', counts: group.cpu_class_counts || []} :
            {mode: 'count', cpus: Number(group.cpus) || 0}),
          gpu_reserved_cores: activeGPUIds(group, (this.info || {}).gpus).length *
            (Number(group.gpu_reserved_cores) || 0)
        }]))
      return !this.$util.isEqual(policy((this.initial_config || {}).groups),
        policy(this.groups))
    },

    cpu_config_valid() {
      const plan = this.gpu_reservation_plan || {count: 0, valid: true}
      const savedGroups = (this.initial_config || {}).groups || {}
      if (!this.cpu_policy_changed) return !this.gpu_policy_changed || !plan.sharedBlocked
      if (!plan.valid) return false
      if (!plan.count && (!this.cpu_managed_mode || !this.cpu_class_supported)) return true
      const levels = (this.cpu_affinity || {}).performance_levels || []
      let classTotals = levels.map(() => 0)
      let total = 0
      for (const [name, group] of Object.entries(this.groups)) {
        if (group.cpu_mode == 'classes') {
          let counts = group.cpu_class_counts || []
          const saved = savedGroups[name]
          const unchanged = saved && saved.cpu_mode == 'classes' &&
            this.$util.isEqual(saved.cpu_class_counts || [], counts)
          if (counts.length != levels.length && !unchanged) return false
          for (let i = 0; i < counts.length; ++i) {
            const value = Math.max(0, Number(counts[i]) || 0)
            if (i < levels.length) classTotals[i] += value
            else if (value && !unchanged) return false
            total += value
          }
        } else total += Math.max(0, Number(group.cpus) || 0)
      }
      if (total > this.available_cpus) return false
      return classTotals.every((n, i) => n <=
        (this.cpu_class_capacities || levels.map(l => l.logical_cpus))[i])
    },

    current_group_cpu_limit() {
      // The remaining budget must not jump when the first GPU core is
      // reserved. Keep legacy clients without affinity metadata unchanged.
      if (!this.cpu_affinity) return this.available_cpus
      let used = 0
      for (const [name, group] of Object.entries(this.groups)) {
        if (name == this.group) continue
        used += group.cpu_mode == 'classes' ?
          (group.cpu_class_counts || []).reduce((a, b) => a + (Number(b) || 0), 0) :
          (Number(group.cpus) || 0)
      }
      return Math.max(0, this.available_cpus - used)
    },

    current_group_class_limits() {
      const levels = (this.cpu_affinity || {}).performance_levels || []
      return levels.map((level, i) => {
        let reserved = 0
        for (const [name, group] of Object.entries(this.groups)) {
          if (name == this.group || group.cpu_mode != 'classes') continue
          reserved += Number((group.cpu_class_counts || [])[i]) || 0
        }
        return Math.max(0, Math.min((this.cpu_class_capacities || levels.map(l => l.logical_cpus))[i] - reserved,
          this.current_group_cpu_limit))
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
      let keys = ['on_idle', 'cpus', 'gpus', 'beta', 'key', 'cuda', 'hip']
      if (this.cpu_affinity) keys = keys.concat(['cpu_mode', 'cpu_class_counts'])
      let copy = copy_keys(config, keys)

      copy.on_idle = !!copy.on_idle
      copy.cpus    = copy.cpus || 0
      if (this.cpu_affinity) {
        copy.cpu_mode = copy.cpu_mode == 'classes' ? 'classes' : 'count'
        copy.cpu_class_counts = Array.isArray(copy.cpu_class_counts) ?
          [...copy.cpu_class_counts] : []
      }
      copy.beta    = !!copy.beta
      copy.key     = copy.key || 0
      copy.cuda    = copy.cuda == undefined ? true : copy.cuda
      copy.hip     = copy.hip  == undefined ? true : copy.hip

      if (this.$util.version_less('8.3.1', this.version)) {
        copy.on_battery = !!config.on_battery
        copy.keep_awake = !!config.keep_awake
      }

      if (this.cpu_affinity && 'gpu_cpu_reservation' in this.cpu_affinity)
        copy.gpu_reserved_cores = Number(config.gpu_reserved_cores) || 0

      let config_gpus = config.gpus || {}
      copy.gpus = {}
      for (let id in this.available_gpus) {
        const enabled = (config_gpus[id] || {}).enabled || false
        copy.gpus[id] = {enabled}
      }

      // Add GPUs which are enabled but not detected
      for (const [id, gpu] of Object.entries(config_gpus))
        if (gpu.enabled && !copy.gpus[id]) copy.gpus[id] = {enabled: true}

      return copy
    },


    get_account_config(config) {
      let copy = copy_keys(config, ['user', 'team', 'passkey', 'cause'])

      if (!copy.cause || copy.cause == 'unspecified') copy.cause = 'any'
      copy.cause = copy.cause.toLowerCase()

      return copy
    },


    init() {
      let config = this.data.config
      if (this.config || !config || this.$util.isEmpty(config)) return

      config = this.logged_in ? {} : this.get_account_config(config)

      if (!this.data.groups)
        config.groups = {'': this.get_group_config(config)}

      else {
        config.groups = {}

        for (const [name, group] of Object.entries(this.data.groups))
          config.groups[name] = this.get_group_config(group.config)
      }

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

    async wait_for_config(saved) {
      for (let attempt = 0; attempt < 50; ++attempt) {
        if (!this.connected || this.settings_stale)
          throw new Error('Client disconnected before confirming settings.')
        const data = this.mach.get_data()
        const actual = {}
        if (!data.groups) actual[''] = this.get_group_config(data.config || {})
        for (const [name, group] of Object.entries(data.groups || {}))
          actual[name] = this.get_group_config(group.config)
        const expectedGroups = {}
        for (const [name, config] of Object.entries(saved.groups))
          expectedGroups[name] = this.get_group_config(config)
        if (this.$util.isEqual(expectedGroups, actual)) {
          const account = this.logged_in ? {} : this.get_account_config(data.config || {})
          const expected = {...saved}
          delete expected.groups
          if (this.$util.isEqual(expected, account)) return
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      throw new Error('The client did not confirm these settings. Your edits are still unsaved.')
    },

    async save() {
      if (!this.connected || this.settings_stale || this.saving) return false
      this.saving = true
      try {
      if (this.name_modified)   await this.mach.save_name(this.name)
      if (!this.connected || this.settings_stale) return
      if (this.config_modified) {
        const saved_config = this.$util.deepCopy(this.config)
        try {
          await this.mach.configure(saved_config)
          await this.wait_for_config(saved_config)
          this.initial_config = saved_config
        } catch (error) {
          await this.$root.message('error', 'Settings were not saved', error.message)
          return false
        }
      }
      return !this.name_modified && !this.config_modified
      } finally {this.saving = false}
    },


    cancel() {this.close()},


    close() {
      this.confirmed = true
      this.$router.replace('/machines')
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
          :advanced="advanced", :version="version")

        .setting.cpu-runtime-warning(v-if="gpu_reservation_plan.sharedBlocked")
          span.fa.fa-warning
          span.
            These reservations leave no Performance 1 CPUs for a shared GPU
            group. Reduce a reservation or reserve cores for every GPU group.

        .setting.cpu-runtime-warning(v-if="cpu_affinity && (cpu_affinity.gpu_helper_blocked_groups || {})[group]")
          span.fa.fa-warning
          span {{cpu_affinity.gpu_helper_blocked_groups[group]}}

        .setting.cpu-runtime-warning(v-if="cpu_runtime_fallback")
          span.fa.fa-warning
          span.
            CPU allocation could not fully match your settings.
            Your saved preferences are unchanged.
            {{cpu_affinity.runtime_fallback_reason}}


  .actions
    Button.button-icon(v-if="!advanced && connected", @click="unlock",
      icon="lock", title="Unlock advanced settings")
</template>

<style lang="stylus">
.settings-view
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
      display flex
      flex-direction column
      gap var(--gap)
      flex 1

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

@media (max-width 800px)
  .settings-view .view-body .view-pane .resource-groups > .actions
    flex-direction column
    align-items normal

    .button
      justify-content left
</style>
