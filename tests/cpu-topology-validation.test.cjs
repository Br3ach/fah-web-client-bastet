const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../src/SettingsView.vue'), 'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replace('export default', 'return');
const component = new Function('CommonSettings', 'GroupSettings', script)({}, {});
function valid(initial, groups, levels) {
  const ctx = {initial_config:{groups:initial}, groups, cpu_managed_mode:true,
    cpu_class_supported:true, cpu_affinity:{performance_levels:levels.map(logical_cpus=>({logical_cpus}))},
    available_cpus:levels.reduce((a,b)=>a+b,0), $util:{isEqual:isDeepStrictEqual}};
  ctx.cpu_policy_changed = component.computed.cpu_policy_changed.call(ctx);
  return component.computed.cpu_config_valid.call(ctx);
}
const saved = {A:{cpu_mode:'classes',cpu_class_counts:[2,2,0]},B:{cpu_mode:'count',cpus:1}};
test('another group can edit count with unchanged mismatched class vector',()=>{
  const next=structuredClone(saved);next.B.cpus=2;assert.equal(valid(saved,next,[4,4]),true);
});
test('nonzero saved missing class counts still contribute to total',()=>{
  const initial=structuredClone(saved);initial.A.cpu_class_counts=[2,2,3];
  const next=structuredClone(initial);next.B.cpus=2;assert.equal(valid(initial,next,[4,4]),false);
  next.B.cpus=1;assert.equal(valid(initial,next,[4,4]),true);
});
test('changing a mismatched vector is rejected',()=>{
  const next=structuredClone(saved);next.A.cpu_class_counts=[1,2,0];assert.equal(valid(saved,next,[4,4]),false);
});
test('new mismatched class group is rejected',()=>{
  const next=structuredClone(saved);next.C={cpu_mode:'classes',cpu_class_counts:[0,0,0]};assert.equal(valid(saved,next,[4,4]),false);
});
test('aggregate class and machine limits remain enforced',()=>{
  const next=structuredClone(saved);next.B.cpus=5;assert.equal(valid(saved,next,[4,4]),false);
  next.B.cpus=2;assert.equal(valid(saved,next,[1,7]),false);
});
