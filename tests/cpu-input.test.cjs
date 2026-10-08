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

const loadComponent = require('./gpu-policy-loader.cjs');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {component} = loadComponent('GroupSettings.vue');

test('all CPU sliders reject malformed or out-of-budget input without changing intent', () => {
  const invalid = [-1, 1.5, 0x100000000, NaN, Infinity, '', ' ', '-1', '1.5', '4294967296', null, true, {}, '9'];
  for (const raw of invalid) {
    const ctx = {config: {cpus: 4, cpu_mode: 'classes', cpu_class_counts: [4,0], gpu_reserved_cores: 2},
      cpu_count_limit: 8, gpuCoreLimit: 8, gpu_selected: true, gpu_reservation_supported: true,
      class_editable: true, class_max: () => 8};
    const before = structuredClone(ctx.config);
    for (const method of ['set_cpu_count', 'set_gpu_reserved_cores'])
      component.methods[method].call(ctx, raw);
    component.methods.set_class_count.call(ctx, 0, raw);
    assert.deepEqual(ctx.config, before);
  }
});

test('range strings and uint32 boundaries are accepted, disabled GPU input is ignored', () => {
  assert.equal(CPUPolicy.parseCPUCount('0'), 0);
  assert.equal(CPUPolicy.parseCPUCount('4294967295'), 0xffffffff);
  const ctx = {config: {}, cpu_count_limit: 8, gpuCoreLimit: 4, gpu_selected: true, gpu_reservation_supported: true};
  component.methods.set_cpu_count.call(ctx, '8');
  component.methods.set_gpu_reserved_cores.call(ctx, '4');
  assert.deepEqual(ctx.config, {cpus: 8, gpu_reserved_cores: 4});
  ctx.gpu_selected = false;
  component.methods.set_gpu_reserved_cores.call(ctx, '0');
  assert.equal(ctx.config.gpu_reserved_cores, 4);
});
