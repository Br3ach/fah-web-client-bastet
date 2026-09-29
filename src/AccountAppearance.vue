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
import Unit from './unit.js'


const layouts = {
  default: {compact: false, wide: false, columns: Unit.default_columns},
  advanced: {
    compact: true,
    wide:    true,
    columns: ['Machine', 'Group Name', 'Version', 'Status Text', 'Progress',
      'Type', 'TPF', 'ETA', 'Base Credit', 'PPD', 'Project', 'RCG', 'Timeout',
      'Assign Time'],
  }
}


export default {
  props: {account: Object, config: Object},


  watch: {
    'config.dark'(x)    {this.$root.set_dark(x)},
    'config.wide'(x)    {this.$root.set_wide(x)},
    'config.compact'(x) {this.$root.set_compact(x)},
  },


  computed: {
    columns() {return this.config.columns || []},


    unused_cols() {
      let used = this.columns
      let l = []

      for (let col of Unit.field_names)
        if (used.indexOf(col) == -1) l.push(col)

      return l.sort()
    }
  },

  methods: {
    reset_columns() {this.config.columns = Unit.default_columns},


    set_layout(name) {
      let layout = layouts[name]
      Object.assign(this.config, layout, {columns: [...layout.columns]})
    }
  }
}
</script>

<template lang="pug">
fieldset.settings.view-panel
  legend
      HelpBalloon(name="Appearance"): p.
        These settings change Web Control's appearance.  Note, some
        settings are only available on wide screens.

  .setting.dark-setting
    HelpBalloon(name="Dark mode"): p Enables the dark mode theme.
    input(v-model="config.dark", type="checkbox")

  .setting.compact-setting
    HelpBalloon(name="Compact"): p.
      Show all machines in a single table with one row per Work Unit or
      resource group.
    input(v-model="config.compact", type="checkbox")

  .setting.wide-setting
    HelpBalloon(name="Wide Display"): p Use full screen width.
    input(v-model="config.wide", type="checkbox")

  .setting.hide-empty-groups-setting
    HelpBalloon(name="Hide Empty Groups"): p.
      Hides empty resource groups on the Machines view.
      Empty resource groups will still display under machine settings.
    input(v-model="config.hide_empty_groups", type="checkbox")

  .columns-setting
    HelpBalloon(name="Work Unit Columns"): p.
      Drag and drop columns to change their position and visibility.
      Note, only the default columns are displayed on small screens.

    .drag-zones
      .drag-zone
        Button.button-icon(icon="refresh", @click="reset_columns",
          title="Reset columns to default")
        DragList(:list="columns")

      .drag-zone(title="Move disabled columns here")
        .fa.fa-trash
        DragList(:list="unused_cols", :removable="false")

  .setting.layout-setting
    HelpBalloon(name="Layout"): p.
      Default shows each machine in its own panel with a few columns.
      Advanced shows all machines in one full width table with more columns.
      Both set Compact, Wide Display and Work Unit Columns which can then be
      customized.
    .setting-actions
      Button(text="Default", icon="th-large", @click="set_layout('default')",
        title="Use default layout")
      Button(text="Advanced", icon="th-list", @click="set_layout('advanced')",
        title="Use advanced layout")
</template>

<style lang="stylus">
.account-view
  .columns-setting
    width 100%

    label
      color var(--subtitle-color)

    .drag-zones
      display flex
      gap var(--gap)
      flex-direction column
      margin-top var(--gap)
      font-size 90%

      .drag-zone
        display flex
        gap var(--gap)
        align-items center

        .fa
          font-size 20pt
          width 1em

        .drag-list
          flex 1
          flex-wrap wrap

          li
            white-space nowrap

@media (max-width 800px)
  .account-view
    fieldset.settings >
      .wide-setting, .columns-setting, .wide-setting
        display none
</style>
