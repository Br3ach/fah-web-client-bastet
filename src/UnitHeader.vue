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


export default {
  name: 'UnitHeader',
  props: ['field', 'sortable', 'dir'],
  computed: {
    Unit() {return Unit},


    sort_class() {
      return [this.dir < 0 ? 'fa-chevron-down' : 'fa-chevron-up',
        {active: this.dir}]
    }
  },
}
</script>

<template lang="pug">
.unit-header(:title="Unit.get_field_desc(field)",
  :class="[Unit.get_field_header_class(field), {'unit-sortable': sortable}]")
  | {{Unit.get_field_header(field)}}

  //- Always takes space so sorting does not change column widths
  .fa.unit-sort(v-if="sortable", :class="sort_class")
</template>

<style lang="stylus">
.unit-header.unit-sortable
  cursor pointer
  user-select none
  gap calc(var(--gap) / 2)

  .unit-sort
    font-size 70%
    visibility hidden

    &.active
      visibility visible

  &:hover .unit-sort:not(.active)
    visibility visible
    opacity 0.4
</style>
