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
const {test}=require('node:test');
const settings=loadComponent('SettingsView.vue', {CommonSettings: {}, GroupSettings: {}});

test('Cancel uses the upstream back navigation',()=>{
 let returned=false;
 const ctx={confirmed:false,$router:{back:()=>returned=true}};
 ctx.close=()=>settings.component.methods.close.call(ctx);
 settings.component.methods.cancel.call(ctx);
 assert.equal(returned,true);assert.equal(ctx.confirmed,true);
});
test('saving RG settings stays on settings and clears saved edits',async()=>{
 const sent=[];const ctx={connected:true,settings_stale:false,settings_valid:true,name_modified:false,config_modified:true,config:{groups:{'':{cpus:4}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},mach:{configure:async c=>sent.push(c)},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Save must not navigate')}};
 await settings.component.methods.save.call(ctx);assert.equal(sent.length,1);assert.equal(sent[0].groups[''].cpus,4);assert.deepEqual(ctx.initial_config,ctx.config);assert.notEqual(ctx.initial_config,ctx.config);
});
test('failed save preserves the unsaved baseline',async()=>{
 const initial={groups:{'':{cpus:2}}};const ctx={connected:true,settings_stale:false,settings_valid:true,name_modified:false,config_modified:true,initial_config:initial,config:{groups:{'':{cpus:4}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},mach:{configure:async()=>{throw Error('save failed')}},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Unexpected navigation')}};
 assert.equal(await settings.component.methods.save.call(ctx),false);assert.equal(ctx.initial_config,initial);
});
test('edits made during save remain unsaved',async()=>{
 const ctx={connected:true,settings_stale:false,settings_valid:true,name_modified:false,config_modified:true,config:{groups:{'':{cpus:4}}},$util:{deepCopy:c=>JSON.parse(JSON.stringify(c))},wait_for_config:async()=>{},$root:{message:async()=>{}},close:()=>{throw Error('Unexpected navigation')}};
 ctx.mach={configure:async c=>{assert.equal(c.groups[''].cpus,4);ctx.config.groups[''].cpus=6}};
 await settings.component.methods.save.call(ctx);assert.equal(ctx.initial_config.groups[''].cpus,4);assert.equal(ctx.config.groups[''].cpus,6);
});

function draftContext() {
 const writes=[];
 const ctx={connected:true,settings_stale:false,saving:false,valid_name:true,
  cpu_config_valid:true,name_modified:true,config_modified:true,config:{groups:{}},
  $refs:{common:{valid:true}},mach:{save_name:async()=>writes.push('name'),
   configure:async()=>writes.push('config')}};
 for(const name of ['settings_valid','modified','confirm_dialog_buttons'])
  Object.defineProperty(ctx,name,{get:()=>settings.component.computed[name].call(ctx)});
 ctx.save=()=>settings.component.methods.save.call(ctx);
 return {ctx,writes};
}

test('invalid settings block every write and disable dialog Save',async()=>{
 for(const invalidate of [ctx=>ctx.valid_name=false,
   ctx=>ctx.$refs.common.valid=false,ctx=>ctx.cpu_config_valid=false,
   ctx=>ctx.connected=false,ctx=>ctx.settings_stale=true,ctx=>ctx.saving=true]) {
  const {ctx,writes}=draftContext();invalidate(ctx);
  assert.equal(ctx.confirm_dialog_buttons.find(b=>b.name=='save').disabled,true);
  assert.equal(await ctx.save(),false);assert.deepEqual(writes,[]);
  assert.equal(ctx.confirm_dialog_buttons.find(b=>b.name=='discard').disabled,undefined);
 }
});

test('validity changes while leave dialog is open cannot save or navigate',async()=>{
 const {ctx,writes}=draftContext();let respond;const routes=[];
 ctx.$refs.confirm_dialog={exec:()=>new Promise(resolve=>respond=resolve)};
 ctx.$router={push:to=>routes.push(to)};
 assert.equal(ctx.confirm_dialog_buttons.find(b=>b.name=='save').disabled,false);
 assert.equal(settings.component.beforeRouteLeave.call(ctx,{path:'/machines'},{}),false);
 ctx.cpu_config_valid=false;
 assert.equal(ctx.confirm_dialog_buttons.find(b=>b.name=='save').disabled,true);
 respond('save');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes,[]);assert.deepEqual(routes,[]);
 assert.equal(ctx.confirmed,undefined);
 ctx.cpu_config_valid=true;
 assert.equal(ctx.confirm_dialog_buttons.find(b=>b.name=='save').disabled,false);
 delete ctx.$refs.common;assert.equal(ctx.settings_valid,true);
});
