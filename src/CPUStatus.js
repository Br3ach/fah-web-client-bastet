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

// Pure display calculations: saved backend allocations are authoritative only
// while their policy still matches the draft. This module never allocates CPUs.
function matchesPolicy(allocation, config, classCounts) {
  const classes = config.cpu_mode == 'classes'
  const count = classes ? classCounts.reduce((a, b) => a + Number(b), 0) : Number(config.cpus)
  return allocation.configured_cpus == count &&
    allocation.cpu_mode == (classes ? 'classes' : 'count') &&
    (!classes || (Array.isArray(allocation.cpu_class_counts) &&
      allocation.cpu_class_counts.length == classCounts.length &&
      allocation.cpu_class_counts.every((count, i) => count === classCounts[i])))
}

export function matchingRuntimeUnits({config, classCounts = [], cpuAffinity, groupName, allocationPolicyChanged}) {
  if (allocationPolicyChanged) return []
  return Object.values(cpuAffinity?.unit_allocations || {}).filter(unit =>
    unit.group == (groupName || '') && matchesPolicy(unit, config, classCounts))
}

export function matchingFullSMTUnits(units = []) {
  return units.filter(unit => unit.full_smt)
}

export function matchingRuntimeAllocation({config, classCounts = [], cpuAffinity, groupName, allocationPolicyChanged}) {
  // Other groups and reservations can also invalidate this group's prediction.
  if (allocationPolicyChanged) return undefined
  const allocation = (cpuAffinity?.group_allocations || {})[groupName || '']
  return allocation && matchesPolicy(allocation, config, classCounts) ? allocation : undefined
}

export function runtimeSMTAllocation(allocation) {
  return allocation?.potential_full_smt ? allocation : undefined
}

export function runtimeCPUShortage(allocation) {
  if (!allocation || !Number.isInteger(allocation.configured_cpus) ||
      !Number.isInteger(allocation.allocated_workers) || allocation.allocated_workers < 0 ||
      allocation.allocated_workers >= allocation.configured_cpus) return undefined
  return allocation
}

function saturatedDraftClasses(classCounts, cpuAffinity,
    gpuReservedCores = 0, gpuReservedLogicalCpus = 0) {
  const reserved = Number(gpuReservedCores) || 0
  const reservedLogical = Number(gpuReservedLogicalCpus) || 0
  return (cpuAffinity?.performance_levels || []).flatMap((level, i) => {
    const physical = Math.max(0,
      (Number(level.physical_cpus) || 0) - (i == 0 ? reserved : 0))
    const logical = Math.max(0,
      (Number(level.available_logical_cpus ?? level.logical_cpus) || 0) -
      (i == 0 ? reservedLogical : 0))
    return physical > 0 && logical > physical &&
      Number(classCounts[i]) == logical ? [i] : []
  })
}

export function hasSMTWarning({config, classCounts = [], cpuAffinity, cpuGroupCount,
    gpuReservedCores, gpuReservedLogicalCpus, runtimeUnits = [], fullSMTUnits = [], smtAllocation}) {
  if ((fullSMTUnits || []).length) return true
  // Matching WUs describe the actual core policy. Do not override their
  // negative result with a core-independent group or draft prediction.
  if ((runtimeUnits || []).length) return false
  if (smtAllocation) return true
  // Do not duplicate the allocator for several CPU groups. Their actual
  // pool capacities arrive with the authoritative allocation after Save.
  if (cpuGroupCount != 1) return false
  const affinity = cpuAffinity || {}
  const reserved = Number(gpuReservedCores) || 0
  const reservedLogical = Number(gpuReservedLogicalCpus) || 0
  let physical = Number(affinity.physical_cpus) || 0
  let logical = Number(affinity.available) || 0
  let workers = Number(config.cpus) || 0
  if (config.cpu_mode == 'classes')
    return saturatedDraftClasses(classCounts, cpuAffinity,
      gpuReservedCores, gpuReservedLogicalCpus).length > 0
  physical = Math.max(0, physical - reserved)
  logical = Math.max(0, logical - reservedLogical)
  return physical > 0 && logical > physical && workers == logical
}

export function smtWarningClasses(warning, classCounts = [], cpuAffinity,
    {runtimeUnits = [], smtAllocation,
      gpuReservedCores = 0, gpuReservedLogicalCpus = 0} = {}) {
  if (!warning) return []
  // Actual WU policy takes precedence over a pre-assignment prediction.
  const sources = runtimeUnits.length ? runtimeUnits : smtAllocation ? [smtAllocation] : []
  if (sources.length && sources.every(source => Array.isArray(source.class_allocations) &&
      source.class_allocations.length == classCounts.length)) {
    const flag = runtimeUnits.length ? "full_smt" : "potential_full_smt"
    return classCounts.flatMap((count, i) => count > 0 &&
      sources.some(source => source.class_allocations[i]?.[flag]) ? [i] : [])
  }
  if (!sources.length)
    return saturatedDraftClasses(classCounts, cpuAffinity,
      gpuReservedCores, gpuReservedLogicalCpus)
  // Older clients have only aggregate warnings; retain their topology fallback.
  return (cpuAffinity?.performance_levels || []).flatMap((level, i) => {
    const logical = level.available_logical_cpus ?? level.logical_cpus
    return classCounts[i] > 0 && level.physical_cpus > 0 &&
      logical > level.physical_cpus ? [i] : []
  })
}

export function smtWarningText(fullSMTUnits = []) {
  const introduction = (fullSMTUnits || []).length ?
    'Full SMT utilisation may reduce performance.' :
    'This configuration may fully utilise SMT and reduce performance.'
  return introduction + ' Using all hardware threads ' +
    'of an allocated physical-core pool can increase contention. Some CPU workloads may ' +
    'perform better with one fewer worker. Consider reducing the CPU count by ' +
    'one and comparing performance.'
}
