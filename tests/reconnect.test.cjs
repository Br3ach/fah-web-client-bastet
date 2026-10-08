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
const assert=require('assert/strict');
const {component: c}=loadComponent('SettingsView.vue', {CommonSettings: {}, GroupSettings: {}});
const stock={info:{version:'8.5.7'},config:{user:'Anonymous',team:0},groups:{'':{config:{cpus:4,gpus:{}}}}};
function context(def,data){const ctx={...def.methods,logged_in:false,version:data.info.version,initial_config:undefined,config:undefined,group:'', $util:{version_less:(a,b)=>a.split('.').map(Number).reduce((v,n,i)=>v||Math.sign(n-(b.split('.')[i]||0)),0)<0,isEqual:(a,b)=>JSON.stringify(a)==JSON.stringify(b),deepCopy:structuredClone,isEmpty:o=>!Object.keys(o).length},mach:{get_info:()=>data.info,get_data:()=>data,get_version:()=>data.info.version}};for(const [k,f]of Object.entries(def.computed))if(!(k in ctx))Object.defineProperty(ctx,k,{get:()=>f.call(ctx),configurable:true});return ctx}

(async()=>{
function setup(data){const ctx=context(c,data);Object.defineProperty(ctx,'connected',{value:true,writable:true});Object.defineProperty(ctx,'name_modified',{value:false,writable:true});ctx.mach.get_name=()=> 'Test';ctx.settings_stale=false;ctx.name_modified=false;ctx.init();return ctx}
const data=structuredClone(stock),ctx=setup(data);ctx.config.groups[''].cpus=9;
c.watch.connected.call(ctx,false);assert.equal(ctx.settings_stale,true);
let sent=0;ctx.mach.configure=async()=>sent++;ctx.close=()=>{};await ctx.save();assert.equal(sent,0);
delete data.info.cpu_affinity;await ctx.reload_settings.call({...ctx,connected:false});assert.equal(ctx.settings_stale,true);
ctx.$root={message:async()=> 'cancel'};await ctx.reload_settings();assert.equal(ctx.config.groups[''].cpus,9);
ctx.$root.message=async()=> 'reload';await ctx.reload_settings();assert.equal(ctx.settings_stale,false);assert.equal(ctx.config.groups[''].cpus,data.groups[''].config.cpus);
console.log('PASS: edits preserved, stale/disconnected saves blocked, cancel preserves draft, explicit reload resets');
for(const direction of ['upgrade','downgrade']){
 const d=structuredClone(stock);if(direction==='downgrade'){d.info.cpu_affinity={class_selection:true,performance_levels:[{},{}]};d.groups[''].config.cpu_mode='classes';d.groups[''].config.cpu_class_counts=[4,2]}
 const x=setup(d);c.watch.connected.call(x,false);
 if(direction==='upgrade'){d.info.cpu_affinity={class_selection:true,performance_levels:[{},{}]};d.groups[''].config.cpu_mode='classes';d.groups[''].config.cpu_class_counts=[4,2]}
 else{delete d.info.cpu_affinity;delete d.groups[''].config.cpu_mode;delete d.groups[''].config.cpu_class_counts}
 c.watch.connected.call(x,true);assert.equal(x.settings_stale,false);assert.equal(x.groups[''].cpu_mode,direction==='upgrade'?'classes':undefined);
 console.log('PASS: clean '+direction+' reconnect automatically refreshes draft');
}
})().catch(e=>{console.error(e);process.exitCode=1});
