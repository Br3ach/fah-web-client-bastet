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
  name: 'MachineMenu',


  data() {
    return {
      visible: false,
      x:       0,
      y:       0,
      anchor:  undefined,
      mach:    undefined,
      group:   undefined,
      unit:    undefined,
    }
  },


  computed: {
    items() {
      const {mach, group, unit} = this
      if (!mach) return []

      const connected = mach.is_connected()
      const usable    = connected && !mach.is_unsupported()
      const url       = path => '/' + mach.get_url(path)
      let l = []

      if (unit) l.push(
        {header: 'Work Unit'},
        {text: 'Log', icon: 'list-alt', disabled: !connected,
          route: url(`/log?q=:WU${unit.number}:`)},
        {text: 'Details', icon: 'info-circle', route: '/unit/' + unit.id},
        {text: 'View 3D protein', icon: 'eye', disabled: !connected,
          route: url('/view/' + unit.id)},
        {text: 'Dump', icon: 'trash', disabled: !unit.paused || !connected,
          action: () => this.$root.confirm_dump(unit)})

      if (group != undefined && 1 < mach.get_groups().length)
        l.push({header: 'Group'}, this.state_item(group, usable))

      l.push(
        {header: 'Machine'},
        this.state_item(undefined, usable),
        {text: 'Settings', icon: 'cog', disabled: !mach.get_id(),
          route: url('/settings')},
        {text: 'Log', icon: 'list-alt', disabled: !connected,
          route: url('/log')},
        {text: 'Details', icon: 'info-circle',
          disabled: !mach.get_version(), route: url('/details')})

      return l
    }
  },


  watch: {
    '$route'() {this.close()}
  },


  beforeUnmount() {this.listen(false)},


  methods: {
    state_item(group, usable) {
      const mach = this.mach

      if (mach.is_paused(group))
        return {text: 'Fold', icon: 'play', disabled: !usable,
          action: () => mach.set_state('fold', group)}

      return {text: 'Pause', icon: 'pause', disabled: !usable,
        action: () => this.pause(group)}
    },


    async pause(group) {
      let state = await this.$root.confirm_pause()

      if (state == 'pause' || state == 'finish' || state == 'fold')
        this.mach.set_state(state, group)
    },


    open(event, mach, group, unit) {
      event.preventDefault()

      // Clicking the menu button again closes the menu
      let anchor = event.type == 'contextmenu' ? undefined : event.currentTarget
      if (this.visible && anchor && anchor == this.anchor) return this.close()

      Object.assign(this, {mach, group, unit, anchor, visible: true})

      if (anchor) {
        let rect = anchor.getBoundingClientRect()
        this.x = rect.right
        this.y = rect.bottom

      } else {
        this.x = event.clientX
        this.y = event.clientY
      }

      this.listen(true)
      this.$nextTick(this.fit)
    },


    close() {
      this.visible = false
      this.anchor  = undefined
      this.listen(false)
    },


    // Keep the menu on screen
    fit() {
      let el = this.$refs.menu
      if (!el) return

      // Viewport size excluding scrollbars
      const vw = document.documentElement.clientWidth
      const vh = document.documentElement.clientHeight

      // Height is limited to the viewport by CSS
      let {width, height} = el.getBoundingClientRect()
      let rect   = this.anchor && this.anchor.getBoundingClientRect()
      let top    = rect ? rect.top    : this.y
      let bottom = rect ? rect.bottom : this.y

      if (rect) this.x = rect.right - width // Right align with button
      else if (vw < this.x + width) this.x -= width // Open left of cursor

      // Open downwards if it fits, else upwards if that fits or has more room
      if (bottom + height <= vh || vh - bottom >= top) this.y = bottom
      else this.y = top - height

      this.x = this.$util.clamp(this.x, 0, vw - width)
      this.y = this.$util.clamp(this.y, 0, vh - height)
    },


    select(item) {
      if (item.disabled) return
      this.close()

      if (item.route) this.$router.push(item.route)
      else item.action()
    },


    listen(enable) {
      const f = enable ? addEventListener : removeEventListener
      f('mousedown', this.on_mousedown, true)
      f('keydown',   this.on_keydown)
      f('scroll',    this.on_scroll, true)
      f('resize',    this.close)
      f('blur',      this.close)
    },


    on_mousedown(event) {
      let t = event.target
      let menu = this.$refs.menu
      if (menu && menu.contains(t)) return
      if (this.anchor && this.anchor.contains(t)) return // Let click toggle
      this.close()
    },


    on_scroll(event) {
      let menu = this.$refs.menu
      if (!menu || !menu.contains(event.target)) this.close()
    },


    on_keydown(event) {if (event.key == 'Escape') this.close()}
  }
}
</script>

<template lang="pug">
.machine-menu(v-if="visible", ref="menu", @contextmenu.prevent,
  :style="{left: x + 'px', top: y + 'px'}")
  template(v-for="item in items")
    .menu-header(v-if="item.header") {{item.header}}

    .menu-item(v-else, :class="{disabled: item.disabled}",
      @click="select(item)")
      .fa(:class="'fa-' + item.icon")
      span {{item.text}}
</template>

<style lang="stylus">
.machine-menu
  position fixed
  z-index 50
  display flex
  flex-direction column
  min-width 12em
  max-height 100%
  overflow-y auto
  padding 0.5em 0
  background var(--panel-bg)
  color var(--panel-fg)
  border 1px solid var(--border-color)
  border-radius var(--border-radius)
  box-shadow var(--shadow)
  white-space nowrap
  user-select none

  .menu-item
    display flex
    align-items center
    gap 0.6em
    padding 0.35em 1em
    cursor pointer

    .fa
      width 1.2em
      text-align center

    &:hover:not(.disabled)
      background var(--table-header-bg)

    &.disabled
      color var(--secondary-color)
      cursor default

  .menu-header
    padding 0.35em 1.333em // Aligns with items at 75% font size
    color var(--subtitle-color)
    font-size 75%
    font-weight bold
    letter-spacing 0.1em
    text-transform uppercase
    cursor default

    &:not(:first-child)
      margin-top 0.75em
</style>
