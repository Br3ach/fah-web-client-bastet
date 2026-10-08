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

// Pure draft-policy calculations. Keep saved intent and prospective capacity
// separate from authoritative runtime allocations. These mirror validation,
// not running-process ownership or the backend's physical-core allocator.
import {activeGPUIds} from './GPUPolicy.js'

export function activeGPUsByGroup(groups, info) {
  return Object.fromEntries(Object.entries(groups || {}).map(([name, group]) => {
    const ids = activeGPUIds(group, (info || {}).gpus)
    return [name, {ids, count: ids.length}]
  }))
}

export function gpuReservationPlan({cpu_affinity, groups, info, active_gpus}) {
  const active = active_gpus || activeGPUsByGroup(groups, info)
  const cores = (cpu_affinity || {}).performance1_core_threads || []
  let count = 0
  let valid = true
  for (const [name, group] of Object.entries(groups)) {
    const value = Number(group.gpu_reserved_cores || 0)
    if (!isUint32(group.gpu_reserved_cores === undefined ? 0 : group.gpu_reserved_cores)) valid = false
    count += Math.max(0, value) *
      active[name].count
  }
  if (count && (!(cpu_affinity || {}).gpu_cpu_reservation || count > cores.length))
    valid = false
  const logical = cores.slice(0, count).reduce((a, b) => a + b, 0)
  const fast = ((cpu_affinity || {}).performance_levels || [])[0] || {}
  const availableFast = fast.available_logical_cpus ?? fast.logical_cpus ??
    cores.reduce((a, b) => a + b, 0)
  const sharedBlocked = count > 0 && logical >= availableFast &&
    Object.entries(groups).some(([name, group]) => !Number(group.gpu_reserved_cores || 0) &&
      active[name].count > 0)
  if (sharedBlocked) valid = false
  return {count, valid, sharedBlocked, logical}
}

export function currentGroupGPULimit({cpu_affinity, groups, group: selectedGroup, info, active_gpus}) {
  const active = active_gpus || activeGPUsByGroup(groups, info)
  const cores = (cpu_affinity || {}).performance1_core_threads || []
  let other = 0
  for (const [name, group] of Object.entries(groups))
    if (name != selectedGroup && active[name].count > 0)
      other += (Number(group.gpu_reserved_cores) || 0) *
        active[name].count
  const selected = active[selectedGroup]?.count || 0
  return selected ? Math.floor(Math.max(0, cores.length - other) / selected) : 0
}

export function availableCPUs({info, gpu_reservation_plan, cpu_affinity}) {
  if (!info) return 0
  const plan = gpu_reservation_plan
  if (plan && plan.count)
    return Math.max(0, (cpu_affinity?.available ?? info.cpus) - plan.logical)
  return info.cpus
}

export function classCapacities({cpu_affinity, gpu_reservation_plan}) {
  const levels = (cpu_affinity || {}).performance_levels || []
  const plan = gpu_reservation_plan
  return levels.map((level, i) => plan && plan.count ?
    Math.max(0, (level.available_logical_cpus ?? level.logical_cpus) - (i == 0 ? plan.logical : 0)) :
    level.logical_cpus)
}

export function cpuGroupCount({groups}) {
  return Object.values(groups).filter(g => g.cpu_mode == 'classes' ?
    (g.cpu_class_counts || []).some(n => Number(n) > 0) : Number(g.cpus) > 0).length
}

export function classSupported({cpu_affinity}) {
  return !!(cpu_affinity && cpu_affinity.class_selection &&
    1 < (cpu_affinity.performance_levels || []).length)
}

export function managedMode({groups, gpu_reservation_plan}) {
  return Object.values(groups).some(g => g.cpu_mode == 'classes') ||
    !!(gpu_reservation_plan && gpu_reservation_plan.count)
}

export function gpuSelectionChanged({info, groups, saved_groups, isEqual, active_gpus, saved_active_gpus}) {
  const devices = active => Object.fromEntries(Object.entries(active)
    .map(([name, selection]) => [name, selection.ids]))
  return !isEqual(devices(saved_active_gpus || activeGPUsByGroup(saved_groups, info)),
    devices(active_gpus || activeGPUsByGroup(groups, info)))
}

export function cpuIntentChanged({groups, saved_groups, isEqual}) {
  const intent = groups => Object.fromEntries(Object.entries(groups || {})
    .map(([name, group]) => [name, group.cpu_mode == 'classes' ?
      {mode: 'classes', counts: group.cpu_class_counts || []} :
      {mode: 'count', cpus: Number(group.cpus) || 0}]))
  return !isEqual(intent(saved_groups), intent(groups))
}

export function reservationPolicyChanged({info, groups, saved_groups, isEqual,
  active_gpus, saved_active_gpus}) {
  const policy = (groups, active) => Object.fromEntries(Object.entries(groups || {})
    .map(([name, group]) => {
      const cores = Number(group.gpu_reserved_cores) || 0
      return [name, {cores, activeCores: (active[name]?.count || 0) * cores}]
    }))
  return !isEqual(policy(saved_groups, saved_active_gpus || activeGPUsByGroup(saved_groups, info)),
    policy(groups, active_gpus || activeGPUsByGroup(groups, info)))
}

function isUint32(value) {
  return typeof value == 'number' && Number.isInteger(value) &&
    value >= 0 && value <= 0xffffffff
}

// Match backend saved-intent validation. Runtime budgets may still shrink.
function allowsGeneralOversubscription(groups, reservationPlan) {
  return !reservationPlan?.count && !Object.values(groups).some(
    group => group.cpu_mode == 'classes')
}

// Preserve unchanged saved class intent after a topology change. A GPU-only
// edit revalidates shared-helper availability without rewriting CPU intent.
export function cpuConfigValid({gpu_reservation_plan, cpu_intent_changed, reservation_policy_changed,
  gpu_selection_changed, cpu_managed_mode, cpu_class_supported, cpu_affinity,
  groups, available_cpus, cpu_class_capacities, saved_groups, isEqual, info}) {
  // Validate supplied numeric intent even when policy is unchanged or affinity
  // metadata is absent. Missing optional fields retain their legacy defaults.
  for (const group of Object.values(groups || {})) {
    if (group.cpus !== undefined && !isUint32(group.cpus)) return false
    if (group.gpu_reserved_cores !== undefined && !isUint32(group.gpu_reserved_cores)) return false
    if (group.cpu_class_counts !== undefined) {
      if (!Array.isArray(group.cpu_class_counts)) return false
      for (const count of group.cpu_class_counts)
        if (!isUint32(count)) return false
    }
  }
  const plan = gpu_reservation_plan || {count: 0, valid: true}
  const savedGroups = saved_groups || {}
  if (reservation_policy_changed) {
    const active = activeGPUsByGroup(groups, info)
    for (const [name, group] of Object.entries(groups || {})) {
      const reserved = group.gpu_reserved_cores || 0
      if (reserved && !active[name].count &&
          reserved != (savedGroups[name]?.gpu_reserved_cores || 0))
        return false
    }
  }
  // Preserve stale class intent, but reject new class edits without support.
  if (!cpu_class_supported) {
    for (const [name, group] of Object.entries(groups || {})) {
      if (group.cpu_mode != 'classes') continue
      const saved = savedGroups[name]
      if (!saved || saved.cpu_mode != 'classes' ||
          !isEqual(saved.cpu_class_counts || [], group.cpu_class_counts || []))
        return false
    }
  }
  if (!cpu_intent_changed && !reservation_policy_changed)
    return !gpu_selection_changed ||
      !cpu_affinity?.gpu_cpu_reservation || !plan.sharedBlocked
  if (!plan.valid) return false
  if (!plan.count && (!cpu_managed_mode || !cpu_class_supported)) return true
  const levels = (cpu_affinity || {}).performance_levels || []
  let classTotals = levels.map(() => 0)
  let total = 0
  for (const [name, group] of Object.entries(groups)) {
    if (group.cpu_mode == 'classes') {
      let counts = group.cpu_class_counts || []
      const saved = savedGroups[name]
      const unchanged = saved && saved.cpu_mode == 'classes' &&
        isEqual(saved.cpu_class_counts || [], counts)
      if (counts.length != levels.length && !unchanged) return false
      for (let i = 0; i < counts.length; ++i) {
        const value = Math.max(0, Number(counts[i]) || 0)
        if (i < levels.length) classTotals[i] += value
        else if (value && !unchanged) return false
        total += value
      }
    } else total += Math.max(0, Number(group.cpus) || 0)
  }
  if (allowsGeneralOversubscription(groups, plan)) return true
  // Resolve capacity only after the early preservation/rejection rules. Eager
  // Vue arguments must not evaluate a missing legacy topology unnecessarily.
  const available = available_cpus ?? availableCPUs({info, cpu_affinity, gpu_reservation_plan: plan})
  if (total > available) return false
  return classTotals.every((n, i) => n <=
    (cpu_class_capacities || levels.map(l => l.logical_cpus))[i])
}

export function currentGroupCPULimit({cpu_affinity, available_cpus, groups,
  group: selectedGroup, gpu_reservation_plan}) {
  // General-only intent is per group; classes/reservations use aggregate limits.
  if (!cpu_affinity || allowsGeneralOversubscription(groups, gpu_reservation_plan))
    return available_cpus
  let used = 0
  for (const [name, group] of Object.entries(groups)) {
    if (name == selectedGroup) continue
    used += group.cpu_mode == 'classes' ?
      (group.cpu_class_counts || []).reduce((a, b) => a + (Number(b) || 0), 0) :
      (Number(group.cpus) || 0)
  }
  return Math.max(0, available_cpus - used)
}

export function currentGroupClassLimits({cpu_affinity, groups, group: selectedGroup,
  cpu_class_capacities, current_group_cpu_limit, available_cpus, info, gpu_reservation_plan}) {
  const levels = (cpu_affinity || {}).performance_levels || []
  return levels.map((level, i) => {
    let reserved = 0
    for (const [name, group] of Object.entries(groups)) {
      if (name == selectedGroup || group.cpu_mode != 'classes') continue
      reserved += Number((group.cpu_class_counts || [])[i]) || 0
    }
    // With no classes there is no CPU-limit dependency to evaluate.
    const groupLimit = current_group_cpu_limit ?? currentGroupCPULimit({cpu_affinity, gpu_reservation_plan,
      groups, group: selectedGroup, available_cpus: available_cpus ??
        availableCPUs({info, cpu_affinity, gpu_reservation_plan})})
    return Math.max(0, Math.min((cpu_class_capacities || levels.map(l => l.logical_cpus))[i] - reserved,
      groupLimit))
  })
}

// Range inputs provide strings. Reject malformed intent rather than silently
// clamping it or turning an empty value into zero.
export function parseCPUCount(raw, maximum = 0xffffffff) {
  if (typeof raw == 'string' && !/^\d+$/.test(raw)) return undefined
  if (typeof raw != 'number' && typeof raw != 'string') return undefined
  const value = Number(raw)
  if (!isUint32(value) || !isUint32(maximum) || value > maximum) return undefined
  return value
}

export function classTotal(counts = []) {
  return counts.reduce((sum, count) => sum + (Number(count) || 0), 0)
}

export function classMaximum(counts, limits, totalLimit, index) {
  const current = Number(counts[index]) || 0
  const room = Math.max(0, totalLimit - classTotal(counts))
  return Math.max(0, Math.min(limits[index] || 0, current + room))
}

// Prospective warning, independent of the last applied runtime allocation.
// This is a known capacity ceiling, not a second whole-core allocator.
export function classCapacityWarning({config, classCounts = [], cpuAffinity, reservedLogicalCpus = 0}) {
  if (config.cpu_mode != 'classes' || !classCounts.some(count => count > 0)) return ''
  if (!cpuAffinity || !cpuAffinity.effective_classes)
    return 'Performance-class topology is currently unavailable. CPU jobs will wait rather than move to another level.'
  const levels = cpuAffinity.performance_levels || []
  const reserved = Math.max(0, Number(reservedLogicalCpus) || 0)
  if (classCounts.some((count, i) => count > Math.max(0,
      (levels[i]?.available_logical_cpus ?? levels[i]?.logical_cpus ?? 0) - (i == 0 ? reserved : 0))))
    return 'This selection exceeds currently available class capacity. Fewer workers may run; they will remain in the selected performance levels.'
  return ''
}
