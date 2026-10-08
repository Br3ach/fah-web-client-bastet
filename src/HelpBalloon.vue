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
  props: {
    name: String,
    icon: {type: String, default: 'question-circle'},
    iconOnly: Boolean
  },
  data() {return {active: false}},

  beforeUnmount() {
    if (this.active) this.$util.unlock_scrolling()
  },

  watch: {
    active: {
      flush: 'sync',
      handler(active) {
        if (active) this.$util.lock_scrolling()
        else this.$util.unlock_scrolling()
      }
    }
  }
}
</script>

<template lang="pug">
label.help-balloon(@click="active = !active")
  .help-overlay(v-show="active", @click.stop="active = false")
  .help-name(:class="{'help-icon-only': iconOnly}",
    :role="iconOnly ? 'button' : undefined", :tabindex="iconOnly ? 0 : undefined",
    :aria-label="iconOnly ? name : undefined", :aria-expanded="iconOnly ? active : undefined",
    @keydown.enter.prevent="active = !active", @keydown.space.prevent="active = !active")
    template(v-if="!iconOnly") {{name}}
    .fa(:class="'fa-' + icon", aria-hidden="true")
  span(v-if="active")
    .fa.fa-caret-left
    .help-content.view-panel(@click.stop="true")
      .help-header
        h2.help-title {{name}} Help
        Button.button-icon(icon="times", @click="active=false")
      slot
</template>

<style lang="stylus">
.help-balloon
  display inline-block

  .help-overlay
    position fixed
    top 0
    left 0
    width 100vw
    height 100vh
    background var(--overlay-bg)

  .help-name
    display inline
    cursor help

    .fa
      font-size 50%
      vertical-align super
      margin-left 0.125em

    &.help-icon-only .fa
      font-size 100%
      vertical-align baseline
      margin-left 0

    &:hover
      color var(--highlight-color)

  > span
    position fixed
    display inline-block
    width 0.5em
    margin-left 0.5em

    > .fa
      display inline-block
      height 20px
      vertical-align unset
      font-size 100%
      color var(--panel-fg)

    > .fa-caret-left
      transform scale(2.5)

    .help-content
      display inline-block
      position absolute
      margin-top -6px
      margin-left 3px
      font-size 12pt
      white-space normal
      text-align left
      width 30em
      max-width 80vw
      font-weight normal
      padding var(--gap)
      box-shadow var(--shadow)

      .help-header
        display flex
        gap var(--gap)

        .help-title
          flex 1
          margin 0

      p:first-child
        margin-top 0

      p:last-child
        margin-bottom 0

@media (max-width 800px)
  .help-balloon .help-content
    position fixed
    top 8px
    left 0
    width auto
    max-width calc(100vw - 6px)
</style>
