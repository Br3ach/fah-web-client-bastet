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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fields = JSON.parse(fs.readFileSync('src/unit_fields.json', 'utf8'));
const source = fs.readFileSync('src/unit.js', 'utf8');
const context = {fields};
vm.runInNewContext(source.replace("import fields from './unit_fields.json'", '')
  .replace('export default Unit', 'globalThis.Unit = Unit'), context);
const utilSource = fs.readFileSync('src/util.js', 'utf8');
const productionUtil = new Function(utilSource.replace(/^import .*$/gm, '').replace('export default Util', 'return Util.prototype'))();

test('affinity wait is visible in icon and text rows and clears with backend metadata', () => {
  const groupWarnings = ['Existing group warning'];
  const data = {state: 'RUN', group: '', pause_reason: '', gpus: [],
    affinity_warning: 'Affinity rejected: "mask" <test>'};
  const util = {escape_html: s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')};
  const unit = new context.Unit({$util: util}, data,
    {get_warnings: () => groupWarnings, get_config: () => ({})});
  assert.match(unit.get_field_content('Status'), /fa-exclamation-triangle/);
  assert.match(unit.get_field_content('Status Text'), /Affinity rejected/);
  assert.match(unit.get_field_title('Status'), /Affinity rejected/);
  assert.match(unit.warnings, /Existing group warning/);
  assert.match(unit.warnings, /&quot;mask&quot; &lt;test&gt;/);
  assert.deepEqual(groupWarnings, ['Existing group warning']);
  delete data.affinity_warning;
  assert.doesNotMatch(unit.get_field_content('Status'), /fa-exclamation-triangle/);
  assert.doesNotMatch(unit.status_text, /Affinity rejected/);
  assert.equal(unit.status_title, 'Running');
});

test('GPU priority failure is visible in rows, escaped, and clears after recovery', () => {
 const data={state:'RUN',group:'',pause_reason:'',gpus:['gpu'],gpu_priority_warning:'Priority denied <test>'};
 const util={escape_html:s=>s.replace(/</g,'&lt;').replace(/>/g,'&gt;')};
 const unit=new context.Unit({$util:util},data,{get_warnings:()=>[],get_config:()=>({})});
 assert.match(unit.get_field_content('Status'),/fa-exclamation-triangle/);
 assert.match(unit.status_text,/Priority denied/);
 assert.match(unit.status_title,/Priority denied/);
 assert.match(unit.warnings,/&lt;test&gt;/);
 data.gpu_priority_warning='';
 assert.doesNotMatch(unit.get_field_content('Status'),/fa-exclamation-triangle/);
 assert.doesNotMatch(unit.status_text,/Priority denied/);
});


test('launch environment warning is visible, escaped and removed after recovery', () => {
 const message=`Scheduler denied "normal" & <idle> 'fallback'`;
 const data={state:'RUN',group:'',gpus:[],launch_environment_warning:message};
 const unit=new context.Unit({$util:productionUtil},data,
  {get_warnings:()=>[],get_config:()=>({})});
 assert.match(unit.get_field_content('Status'),/fa-exclamation-triangle/);
 assert.match(unit.get_field_content('Status Text'),/Scheduler denied/);
 assert.equal(unit.get_field_title('Status'),'Running\n'+message);
 assert.ok(unit.warnings.includes('&quot;normal&quot; &amp; &lt;idle&gt; &#039;fallback&#039;'));
 delete data.launch_environment_warning;
 assert.equal(unit.warnings,'');
 assert.equal(unit.get_field_content('Status'),unit.status);
 assert.equal(unit.get_field_title('Status'),'Running');
 assert.doesNotMatch(unit.get_field_content('Status Text'),/Scheduler denied/);
});

test('combined WU warnings retain order and selective removal without mutating group warnings', () => {
 const groupWarnings=Object.freeze(['Group warning']);
 const data={state:'RUN',group:'',gpus:[],affinity_warning:'Affinity',
  gpu_priority_warning:'Priority',launch_environment_warning:'Scheduler'};
 const unit=new context.Unit({$util:productionUtil},data,
  {get_warnings:()=>groupWarnings,get_config:()=>({})});
 assert.deepEqual(Array.from(unit.wu_warnings),['Affinity','Priority','Scheduler']);
 assert.equal(unit.status_title,'Running\nAffinity\nPriority\nScheduler');
 assert.ok(unit.warnings.includes('Group warning\nAffinity\nPriority\nScheduler'));
 delete data.launch_environment_warning;
 assert.deepEqual(Array.from(unit.wu_warnings),['Affinity','Priority']);
 assert.equal(unit.status_title,'Running\nAffinity\nPriority');
 assert.match(unit.get_field_content('Status'),/fa-exclamation-triangle/);
 assert.doesNotMatch(unit.get_field_content('Status Text'),/Scheduler/);
 data.affinity_warning='';data.gpu_priority_warning='';
 assert.equal(unit.get_field_content('Status'),unit.status);
 assert.ok(unit.warnings.includes('Group warning'));
 assert.deepEqual(groupWarnings,['Group warning']);
});
