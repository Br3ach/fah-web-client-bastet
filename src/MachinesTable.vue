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
import Unit     from './unit.js'
import GroupRow from './group-row.js'


export default {
  name: 'MachinesTable',
  props: ['machs'],


  data() {
    return {sort: this.$util.retrieve('fah-machines-sort', 0) || {}}
  },


  computed: {
    columns() {
      let columns = this.$account.get_columns()
      return columns.includes('Machine') ? columns : ['Machine', ...columns]
    },


    grid_style() {return Unit.get_column_grid_style(this.columns, ' 1fr')},
    hide_empty() {return (this.$adata.config || {}).hide_empty_groups},


    rows() {
      return this.machs.filter(mach => !mach.is_hidden())
        .flatMap(mach => this.get_rows(mach))
    },


    sorted_rows() {
      let {field, dir} = this.sort
      if (!dir || !this.columns.includes(field)) return this.rows
      return Unit.sort(this.rows, field, dir)
    }
  },


  methods: {
    get_rows(mach) {
      // One row for the whole machine
      if (!mach.is_connected() || mach.is_unsupported())
        return [new GroupRow(this.$ctx, mach)]

      let rows   = []
      let groups = mach.get_groups()
      let units  = mach.get_units()

      for (let group of groups) {
        let l = units.filter(unit => unit.group == group || groups.length == 1)

        if (l.length) rows.push(...l)
        else if (!this.hide_empty || mach.has_resources(group))
          rows.push(new GroupRow(this.$ctx, mach, group))
      }

      // Always show at least one row per machine
      if (!rows.length) rows.push(new GroupRow(this.$ctx, mach, groups[0]))

      return rows
    },


    // Cycle ascending, descending then unsorted
    set_sort(field) {
      let dir = this.sort.field == field ? this.sort.dir : 0
      dir = dir == 1 ? -1 : (dir == -1 ? 0 : 1)
      this.sort = dir ? {field, dir} : {}

      try {
        this.$util.store('fah-machines-sort', this.sort)
      } catch (e) {}
    },


    menu(event, row) {
      let unit = row.is_group ? undefined : row
      this.$root.machine_menu(event, row.mach, row.group, unit)
    }
  }
}
</script>

<template lang="pug">
.machines-table.view-panel
  .units-view(:style="grid_style")
    UnitHeaders(:columns="columns", :sort="sort", @sort="set_sort") Actions

    UnitsView(:units="sorted_rows", :columns="columns", v-slot="{unit: row}",
      @menu="menu")
      Button.button-icon(icon="bars", title="Actions",
        @click="event => menu(event, row)")
</template>

<style lang="stylus">
.machines-table
  padding 0
  overflow hidden

  .units-view
    width 100%
    overflow-x auto

  .row-disconnected
    filter contrast(0.6) brightness(0.5)

    // Grey out the background but not the menu button
    &.unit-actions
      filter none
      position relative
      isolation isolate

      &::before
        content ''
        position absolute
        inset 0
        z-index -1
        background inherit
        filter contrast(0.6) brightness(0.5)
</style>
