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

// Render the production settings container with deterministic machine data.
import {createApp, h, reactive, nextTick} from 'vue'
import SettingsView from '../../src/SettingsView.vue'
import ViewHeader from '../../src/ViewHeader.vue'
import FAHLogo from '../../src/FAHLogo.vue'
import HelpBalloon from '../../src/HelpBalloon.vue'
import Button from '../../src/Button.vue'
import '../../src/base.styl'
import '../../src/dark.styl'

const affinity = {class_selection: true, managed: true, available: 18,
  gpu_priority_options: ["", "other-low", "other-normal"],
  gpu_cpu_reservation: true, performance1_core_threads: [2,2,2,2,2,2,2],
  physical_cpus: 9, performance_levels: [
    {logical_cpus: 14, available_logical_cpus: 14, physical_cpus: 7},
    {logical_cpus: 4, available_logical_cpus: 4, physical_cpus: 2}],
  group_allocations: {}, unit_allocations: []}
const data = reactive({config: {user: "Layout test"}, groups: {
  '': {config: {cpus: 0, gpus: {}}},
  CPU: {config: {cpu_mode: 'classes', cpus: 14, cpu_class_counts: [14,0], gpus: {}, gpu_reserved_cores: 0}},
  GPU: {config: {cpus: 0, gpus: {test: {enabled: true}}, gpu_reserved_cores: 1}}
}})
const mach = {get_name: () => 'Layout test', get_version: () => '8.5.7',
  is_connected: () => true, is_linked: () => true, get_data: () => data,
  get_info: () => ({cpus: 18, cpu_affinity: affinity,
    gpus: {test: {description: 'Test GPU', supported: true, cuda: true}}})}
let view
const app = createApp({render: () => h(SettingsView, {mach, ref: el => {view = el}})})
app.component('HelpBalloon', HelpBalloon).component('Button', Button)
  .component('ViewHeader', ViewHeader).component('FAHLogo', FAHLogo)
  .component('Dialog', {render: () => null})
app.config.globalProperties.$account = {logged_in: true}
app.config.globalProperties.$stats = {get_team: () => ({})}
app.config.globalProperties.$util = {
  version_less: () => true, retrieve_bool: () => true,
  isEmpty: value => !Object.keys(value).length, isObject: value => value !== null && typeof value === "object",
  deepCopy: value => JSON.parse(JSON.stringify(value)),
  isEqual: (a,b) => JSON.stringify(a) === JSON.stringify(b),
  capitalize: value => value ? value.charAt(0).toUpperCase() + value.slice(1) : '', lock_scrolling() {}, unlock_scrolling() {}
}
app.mount('#app')
window.setLayoutMode = async mode => {
  view.group = mode === 'gpu' ? 'GPU' : 'CPU'
  if (mode !== 'gpu') view.groups.CPU.cpu_mode = mode === 'classes' ? 'classes' : 'count'
  await nextTick()
}
window.setZeroCapacityDraft = async () => {
  affinity.available = 14
  affinity.performance_levels[1].available_logical_cpus = 0
  view.groups.CPU.cpu_mode = 'count'
  view.groups.CPU.cpus = 4
  view.groups.GPU.gpu_reserved_cores = 7
  view.group = 'CPU'
  await nextTick()
}
window.zeroCapacityState = () => ({cpus: view.groups.CPU.cpus,
  reserved: view.groups.GPU.gpu_reserved_cores,
  limit: view.current_group_cpu_limit, valid: view.cpu_config_valid})
await window.setLayoutMode('classes')
window.layoutReady = true
