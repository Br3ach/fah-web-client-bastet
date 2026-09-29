/******************************************************************************\

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

\******************************************************************************/

import Unit from './unit.js'


// Fields which do not depend on a Work Unit
const fields = ['machine', 'group_name', 'resources', 'version', 'os',
  'os_text', 'status', 'status_text']


const states = {
  LOADING:      ['Loading...',   'spinner'],
  DISCONNECTED: ['Disconnected', 'chain-broken'],
  OUTDATED:     ['Outdated',     'exclamation-triangle',
                 'Client version too old'],
  NO_RESOURCES: ['No resources', 'ban', 'No CPUs or GPUs enabled'],
  WAIT:         ['Waiting',      'clock-o', 'Waiting to request more work'],
  PAUSE:        ['Paused',       'hourglass-o',
                 'Start folding to download work'],
  IDLE:         ['Idle',         'circle-o'],
}


// A row for a resource group, or a whole machine if group is undefined,
// which has no Work Units.
class GroupRow extends Unit {
  constructor(ctx, mach, group) {
    super(ctx, {group, gpus: []}, mach)
    this.node = ctx.$node
  }


  get id()            {return `${this.mach.get_id()}:${this.group}`}
  get is_group()      {return true}
  get progress()      {}
  get resources()     {return this.mach.get_resources(this.group)}
  get icon()          {return states[this.state][1]}
  get _status_text()  {return states[this.state][0]}
  get status_title()  {return states[this.state][2] || this._status_text}


  get row_class() {
    return this.mach.is_connected() ? '' : 'row-disconnected'
  }


  get group_name() {
    return this.group == undefined ? '' : super.group_name
  }


  get state() {
    const mach = this.mach

    if (!mach.is_connected())
      return this.node.is_loading() ? 'LOADING' : 'DISCONNECTED'

    if (mach.is_unsupported())            return 'OUTDATED'
    if (!mach.has_resources(this.group))  return 'NO_RESOURCES'
    if (mach.is_paused(this.group))       return 'PAUSE'

    let wait = new Date(mach.get_group(this.group).wait).getTime()
    if (this.util.now < wait) return 'WAIT'

    return 'IDLE'
  }


  has_field(name) {
    return fields.includes(name.toLowerCase().replaceAll(' ', '_'))
  }


  get_field_content(name) {
    return this.has_field(name) ? super.get_field_content(name) : ''
  }


  get_field_title(name) {
    if (this.has_field(name)) return super.get_field_title(name)
  }


  get_sort_value(name) {
    if (this.has_field(name)) return super.get_sort_value(name)
  }


  get_field_class(name, odd) {
    return `${super.get_field_class(name, odd)} ${this.row_class}`
  }
}

export default GroupRow
