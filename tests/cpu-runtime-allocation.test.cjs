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
const assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');const {test}=require('node:test');
const {source, component} = loadComponent('GroupSettings.vue');
function shortage(allocation,extra={}) {
 const ctx={config:{cpu_mode:'count',cpus:8},groupName:'A',class_counts:[],
  cpuAffinity:{group_allocations:{A:allocation}},$util:{isEqual:isDeepStrictEqual},...extra};
 ctx.runtime_cpu_allocation=component.computed.runtime_cpu_allocation.call(ctx);
 return component.computed.runtime_cpu_shortage.call(ctx);
}
const allocation={configured_cpus:8,allocated_workers:6,cpu_mode:'count'};
test('matching saved reduced allocation includes zero workers without changing requested settings',()=>{
 assert.equal(shortage(allocation),allocation);
 assert.equal(shortage({...allocation,allocated_workers:0}).allocated_workers,0);
 assert.equal(shortage({...allocation,allocated_workers:8}),undefined);
});
test('allocation-changing drafts and stale policy metadata are hidden',()=>{
 assert.equal(shortage(allocation,{allocationPolicyChanged:true}),undefined);
 assert.equal(shortage(allocation,{config:{cpus:7}}),undefined);
 assert.equal(shortage(allocation,{groupName:'B'}),undefined);
 const classes={...allocation,cpu_mode:'classes',cpu_class_counts:[8,0]};
 const ctx={config:{cpu_mode:'classes'},class_counts:[8,0]};
 assert.equal(shortage(classes,ctx),classes);
 assert.equal(shortage(classes,{...ctx,class_counts:[0,8]}),undefined);
 assert.equal(shortage({...classes,cpu_class_counts:undefined},ctx),undefined);
});
test('legacy and invalid allocation metadata degrade gracefully',()=>{
 assert.equal(shortage(undefined),undefined);
 for(const value of [undefined,null,-1,1.5,'6'])
  assert.equal(shortage({...allocation,allocated_workers:value}),undefined);
 assert.equal(shortage(allocation,{cpuAffinity:undefined}),undefined);
 assert(source.includes('Currently allocated:'));
});
