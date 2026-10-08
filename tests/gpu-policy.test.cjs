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

require('./gpu-policy-loader.cjs');
const assert = require('node:assert/strict');
const {test} = require('node:test');

test('GPU eligibility follows enabled compute backends and detected support',()=>{
 const cases=[
  ['CUDA', {cuda:{}}, {}, true],
  ['HIP', {hip:{}}, {}, true],
  ['OpenCL', {opencl:{}}, {}, true],
  ['disabled CUDA', {cuda:{}}, {cuda:false}, false],
  ['disabled HIP', {hip:{}}, {hip:false}, false],
  ['disabled OpenCL', {opencl:{}}, {opencl:false}, false],
  ['HIP fallback', {cuda:{},hip:{}}, {cuda:false}, true],
  ['OpenCL fallback', {cuda:{},hip:{},opencl:{}}, {cuda:false,hip:false}, true],
  ['all backends disabled', {cuda:{},hip:{},opencl:{}}, {cuda:false,hip:false,opencl:false}, false],
  ['no compute backend', {}, {}, false],
  ['unsupported GPU', {supported:false,cuda:{}}, {}, false],
  ['missing support flag', {supported:undefined,cuda:{}}, {}, false]
 ];
 for (const [name,device,preferences,eligible] of cases) {
  const group={gpus:{GPU:{enabled:true}},...preferences};
  const detected={GPU:{supported:true,...device}};
  assert.deepEqual(activeGPUIds(group,detected),eligible?['GPU']:[],name);
 }
 assert.deepEqual(activeGPUIds({gpus:{GPU:{enabled:false}}},{GPU:{supported:true,cuda:{}}}),[]);
 assert.deepEqual(activeGPUIds({gpus:{GPU:{enabled:true}}}),[]);
 assert.deepEqual(activeGPUIds({}),[]);
});

test('GPU IDs have stable lexical order without mutating saved selections or detection',()=>{
 const selection=Object.freeze({enabled:true});
 const group=Object.freeze({gpus:Object.freeze({Z:selection,A:selection,M:selection})});
 const device=Object.freeze({supported:true,cuda:Object.freeze({})});
 const detected=Object.freeze({M:device,Z:device,A:device});
 assert.deepEqual(activeGPUIds(group,detected),['A','M','Z']);
 assert.deepEqual(activeGPUIds({gpus:{M:selection,Z:selection,A:selection}},detected),['A','M','Z']);
 assert.deepEqual(Object.keys(group.gpus),['Z','A','M']);
 assert.deepEqual(Object.keys(detected),['M','Z','A']);
});
