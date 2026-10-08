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

// Normalize only supported settings into detached values. Both draft payloads
// and backend readback use this representation; transport state stays in Vue.
function copy_keys(config, keys) {
  let copy = {}

  for (let key of keys)
    copy[key] = config[key]

  return copy
}


export function normalizeGroupConfig(config = {}, capabilities = {}) {
  let keys = ['on_idle', 'cpus', 'gpus', 'beta', 'key', 'cuda', 'hip']
  if (capabilities.cpuAffinity) keys = keys.concat(['cpu_mode', 'cpu_class_counts'])
  let copy = copy_keys(config, keys)

  if (capabilities.cpuAffinity?.gpu_priority_options)
    copy.gpu_priority = typeof config.gpu_priority == 'string' ? config.gpu_priority : ''
  copy.on_idle = !!copy.on_idle
  copy.cpus    = copy.cpus || 0
  if (capabilities.cpuAffinity) {
    copy.cpu_mode = copy.cpu_mode == 'classes' ? 'classes' : 'count'
    copy.cpu_class_counts = Array.isArray(copy.cpu_class_counts) ?
      [...copy.cpu_class_counts] : []
  }
  copy.beta    = !!copy.beta
  copy.key     = copy.key || 0
  copy.cuda    = copy.cuda == undefined ? true : copy.cuda
  copy.hip     = copy.hip  == undefined ? true : copy.hip

  if (capabilities.batterySettings) {
    copy.on_battery = !!config.on_battery
    copy.keep_awake = !!config.keep_awake
  }

  if (capabilities.cpuAffinity && 'gpu_cpu_reservation' in capabilities.cpuAffinity)
    copy.gpu_reserved_cores = Number(config.gpu_reserved_cores) || 0

  let config_gpus = config.gpus || {}
  copy.gpus = {}
  for (let id in capabilities.availableGPUs) {
    const enabled = (config_gpus[id] || {}).enabled || false
    copy.gpus[id] = {enabled}
  }

  // Add GPUs which are enabled but not detected
  for (const [id, gpu] of Object.entries(config_gpus))
    if (gpu.enabled && !copy.gpus[id]) copy.gpus[id] = {enabled: true}

  return copy
}

export function normalizeAccountConfig(config = {}) {
  let copy = copy_keys(config, ['user', 'team', 'passkey', 'cause'])

  if (!copy.cause || copy.cause == 'unspecified') copy.cause = 'any'
  copy.cause = copy.cause.toLowerCase()

  return copy
}

export function normalizeSettings(data = {}, capabilities = {}) {
  // Backend snapshots wrap each RG in {config}; editable settings contain
  // plain RG configs. A pre-RG client stores its default group in config.
  const snapshot = Object.prototype.hasOwnProperty.call(data, 'config')
  const config = snapshot ? (data.config || {}) : data
  const settings = capabilities.loggedIn ? {} : normalizeAccountConfig(config)
  const groups = data.groups
  settings.groups = {}
  if (!groups) settings.groups[''] = normalizeGroupConfig(config, capabilities)
  else for (const [name, group] of Object.entries(groups))
    settings.groups[name] = normalizeGroupConfig(snapshot ? group.config : group, capabilities)
  return settings
}
