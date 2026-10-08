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
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const {component: c} = loadComponent('SettingsView.vue', {CommonSettings: {}, GroupSettings: {}});
const utilSource=fs.readFileSync(path.join(__dirname,'../src/util.js'),'utf8');
const productionUtil=new Function(utilSource.replace(/^import .*$/gm,'').replace('export default Util','return Util.prototype'))();
function capabilities(ctx) {
 return productionUtil.deepCopy({cpuAffinity:ctx.cpu_affinity,availableGPUs:ctx.available_gpus,
  batterySettings:!!ctx.$util?.version_less?.('8.3.1',ctx.version),loggedIn:!!ctx.logged_in});
}
function confirm(ctx,saved) {
 return c.methods.wait_for_config.call(ctx,saved,capabilities(ctx));
}

test('transport send alone cannot clear saved baseline',async()=>{
 const baseline={groups:{'':{cpus:2}}};let displayed;
 const ctx={connected:true,settings_stale:false,settings_valid:true,config_modified:true,name_modified:false,config:{groups:{'':{cpus:4}}},initial_config:baseline,$util:{deepCopy:structuredClone},mach:{configure:async()=>{}},wait_for_config:async()=>{throw Error('rejected')},$root:{message:async(...args)=>displayed=args}};
 assert.equal(await c.methods.save.call(ctx),false);assert.equal(ctx.initial_config,baseline);assert.equal(displayed[0],'error');assert.equal(ctx.saving,false);
});
test('authoritative groups and account confirm accepted values',async()=>{
 const saved={user:'Tester',groups:{'':{cpus:4}}};
 const ctx={connected:true,settings_stale:false,settings_valid:true,logged_in:false,$util:{isEqual:(a,b)=>JSON.stringify(a)==JSON.stringify(b)},mach:{get_data:()=>({config:{user:'Tester'},groups:{'':{config:{cpus:4}}}})},get_group_config:x=>x,get_account_config:x=>x};
 await confirm(ctx,saved);
});
test('unconfirmed values stay dirty after timeout',async()=>{
 const ctx={connected:true,settings_stale:false,settings_valid:true,logged_in:true,$util:{isEqual:()=>false},mach:{get_data:()=>({groups:{}})},get_group_config:x=>x};
 const original=global.setTimeout;global.setTimeout=fn=>{queueMicrotask(fn);return 0};
 try{await assert.rejects(confirm(ctx,{groups:{A:{cpus:4}}}),/confirmation has not arrived/)}finally{global.setTimeout=original}
});
test('disconnect during confirmation is a failed save',async()=>{
 await assert.rejects(confirm({connected:false},{groups:{}}),/disconnected/);
});
test('leave dialog Save resumes original destination only on success',async()=>{
 for(const success of [true,false]){let destination;const to={path:'/other'};const ctx={name_modified:false,config_modified:true,$refs:{confirm_dialog:{exec:async()=> 'save'}},save:async()=>success,$router:{push:x=>destination=x}};
 assert.equal(c.beforeRouteLeave.call(ctx,to,{}),false);await new Promise(resolve=>setImmediate(resolve));assert.equal(destination,success?to:undefined)}
});
test('overlapping save is refused',async()=>{assert.equal(await c.methods.save.call({connected:true,settings_stale:false,settings_valid:true,saving:true}),false)});

test('GPU save confirmation canonicalizes missing and newly detected devices',async()=>{
 const original=global.setTimeout;global.setTimeout=fn=>{queueMicrotask(fn);return 0};
 try {
  for(const [available,requested,stored,accepted] of [
   [{},{missing:{enabled:false}},{missing:{enabled:false}},true],
   [{},{missing:{enabled:false}},{},true],
   [{newGPU:{}},{},{},true],
   [{},{missing:{enabled:true}},{},false]
  ]) {
   const ctx={connected:true,settings_stale:false,settings_valid:true,logged_in:true,available_gpus:available,
    cpu_affinity:null,version:'8.5.7',$util:{version_less:()=>true,isEqual:(a,b)=>{try{assert.deepEqual(a,b);return true}catch{return false}}},
    mach:{get_data:()=>({groups:{A:{config:{cpus:4,gpus:stored}}}})}};
   ctx.get_group_config=config=>c.methods.get_group_config.call(ctx,config);
   const confirmation=confirm(ctx,{groups:{A:{cpus:4,gpus:requested}}});
   if(accepted) await confirmation;else await assert.rejects(confirmation,/confirmation has not arrived/);
  }
 } finally {global.setTimeout=original}
});


test('delayed confirmation beyond five seconds succeeds with capped backoff',async()=>{
 let elapsed=0;const delays=[];
 const saved={groups:{A:{cpus:4}}};
 const ctx={connected:true,settings_stale:false,settings_valid:true,view_active:true,logged_in:true,
  $util:{isEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b)},get_group_config:x=>x,
  mach:{get_data:()=>({groups:elapsed>=12000?{A:{config:{cpus:4}}}:{}})}};
 const original=global.setTimeout;global.setTimeout=(fn,delay)=>{delays.push(delay);elapsed+=delay;queueMicrotask(fn);return 0};
 try {await confirm(ctx,saved);assert.ok(elapsed>=12000&&elapsed<30000);assert.deepEqual(delays.slice(0,4),[100,200,400,800]);assert.ok(delays.every(x=>x<=1000))}
 finally {global.setTimeout=original}
});

test('confirmation stops at thirty seconds and retains the draft',async()=>{
 let elapsed=0;const draft={groups:{A:{cpus:4}}};
 const ctx={connected:true,settings_stale:false,settings_valid:true,config:draft,logged_in:true,$util:{isEqual:()=>false},get_group_config:x=>x,mach:{get_data:()=>({groups:{}})}};
 const original=global.setTimeout;global.setTimeout=(fn,delay)=>{elapsed+=delay;queueMicrotask(fn);return 0};
 try {await assert.rejects(confirm(ctx,draft),/Check the current settings/);assert.equal(elapsed,30000);assert.equal(ctx.config,draft)}finally{global.setTimeout=original}
});

test('leaving the view cancels pending confirmation without a late dialog',async()=>{
 const ctx={connected:true,settings_stale:false,settings_valid:true,view_active:true,logged_in:true,$util:{isEqual:()=>false},get_group_config:x=>x,mach:{get_data:()=>({groups:{}})}};
 const original=global.setTimeout;let polls=0;global.setTimeout=fn=>{polls++;c.beforeUnmount.call(ctx);queueMicrotask(fn);return 0};
 try {await assert.rejects(confirm(ctx,{groups:{}}),/cancelled/);assert.equal(polls,1)}finally{global.setTimeout=original}
 let dialogs=0;Object.assign(ctx,{config_modified:true,config:{groups:{}},$util:{deepCopy:structuredClone},mach:{configure:async()=>{}},wait_for_config:async()=>{throw Error('cancelled')},$root:{message:async()=>dialogs++}});
 assert.equal(await c.methods.save.call(ctx),false);assert.equal(dialogs,0);assert.equal(ctx.saving,false);
});


test('affinity capability loss cannot confirm an unchanged class policy',async()=>{
 const saved={groups:{A:{cpus:4,cpu_mode:'classes',cpu_class_counts:[3,1],gpus:{}}}};
 const ctx={connected:true,settings_stale:false,view_active:true,logged_in:true,
  available_gpus:{},cpu_affinity:{class_selection:true,gpu_cpu_reservation:true},
  $util:{isEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b)},
  mach:{get_data:()=>({config:{},groups:{A:{config:{...saved.groups.A,cpu_class_counts:[2,2]}}}})}};
 const original=global.setTimeout;
 global.setTimeout=fn=>{ctx.cpu_affinity=undefined;queueMicrotask(fn);return 0};
 try {await assert.rejects(confirm(ctx,saved),/confirmation has not arrived/)}
 finally {global.setTimeout=original}
});


test('production save retains submitted capabilities through send and polling metadata changes',async()=>{
 const original=global.setTimeout;
 try {
  for(const when of ['send','poll'])for(const mutation of ['remove','in-place'])for(const accepted of [false,true]) {
   let elapsed=0,changed=false,dialogs=0,payload,discoveryCompared=false;
   const draft={groups:{A:{cpus:4,cpu_mode:'classes',cpu_class_counts:[3,1],
    gpu_reserved_cores:1,gpu_priority:'other-low',gpus:{gpu:{enabled:true}}}}};
   const baseline={groups:{A:{cpus:2}}};
   const ctx={connected:true,settings_stale:false,settings_valid:true,view_active:true,
    logged_in:true,version:'8.5.7',name_modified:false,initial_config:baseline,config:draft,
    available_gpus:{gpu:{}},cpu_affinity:{class_selection:true,gpu_cpu_reservation:true,
      gpu_priority_options:['','other-low']},
    $util:Object.create(productionUtil),$root:{message:async()=>{++dialogs}}};
   Object.defineProperty(ctx,'config_modified',{get:()=>ctx.initial_config!==ctx.config &&
    !productionUtil.isEqual(ctx.initial_config,ctx.config)});
   ctx.$util.isEqual=(a,b)=> {
    if(changed && a.groups?.A?.gpus?.newGPU) {
     assert.equal(a.groups.A.gpus.newGPU.enabled,false);
     assert.equal(b.groups.A.gpus.newGPU.enabled,false);
     discoveryCompared=true;
    }
    return productionUtil.isEqual(a,b);
   };
   function change() {
    changed=true;
    ctx.available_gpus={gpu:{},newGPU:{}};
    if(mutation==='remove')ctx.cpu_affinity=undefined;
    else {delete ctx.cpu_affinity.gpu_cpu_reservation;delete ctx.cpu_affinity.gpu_priority_options;}
   }
   ctx.mach={configure:async sent=>{payload=sent;if(when==='send')change()},
    get_data:()=>({config:{},groups:{A:{config:changed&&accepted?draft.groups.A:
      {...draft.groups.A,cpu_class_counts:[2,2],gpu_reserved_cores:0,gpu_priority:''}}}})};
   ctx.wait_for_config=(saved,caps)=>c.methods.wait_for_config.call(ctx,saved,caps);
   global.setTimeout=(fn,delay)=>{elapsed+=delay;if(when==='poll')change();queueMicrotask(fn);return 0};
   assert.equal(await c.methods.save.call(ctx),accepted,`${when}/${mutation}/${accepted}`);
   assert.equal(payload.groups.A.gpu_priority,'other-low');
   assert.equal(payload.groups.A.gpu_reserved_cores,1);
   assert.deepEqual(payload.groups.A.cpu_class_counts,[3,1]);
   assert.equal(ctx.saving,false);assert.equal(ctx.config,draft);
   assert.equal(discoveryCompared,true);
   assert.equal(dialogs,accepted?0:1);
   if(accepted) {assert.deepEqual(ctx.initial_config,draft);assert.equal(ctx.config_modified,false)}
   else {assert.equal(ctx.initial_config,baseline);assert.equal(elapsed,30000)}
  }
 } finally {global.setTimeout=original}
});


for(const validAfterRename of [false,true])
 test(`save rechecks validity after rename: ${validAfterRename}`,async()=>{
  const baseline={groups:{A:{cpus:2}}};
  const draft={groups:{A:{cpus:4}}};
  let renames=0,sends=0,confirmations=0;
  const ctx={connected:true,settings_stale:false,settings_valid:true,
   name:'Renamed',name_modified:true,initial_config:baseline,config:draft,
   $util:Object.create(productionUtil),logged_in:true,
   mach:{save_name:async name=>{
     assert.equal(name,'Renamed');++renames;
     await Promise.resolve();
     ctx.name_modified=false;ctx.settings_valid=validAfterRename;
    },configure:async payload=>{++sends;assert.equal(payload.groups.A.cpus,4)}},
   wait_for_config:async saved=>{++confirmations;assert.deepEqual(saved,draft)}};
  Object.defineProperty(ctx,'config_modified',{get:()=>!productionUtil.isEqual(ctx.initial_config,ctx.config)});
  assert.equal(await c.methods.save.call(ctx),validAfterRename);
  assert.equal(renames,1);assert.equal(sends,validAfterRename?1:0);
  assert.equal(confirmations,validAfterRename?1:0);
  if(validAfterRename)assert.deepEqual(ctx.initial_config,draft);
  else assert.equal(ctx.initial_config,baseline);
  assert.equal(ctx.config,draft);assert.equal(ctx.saving,false);
 });
