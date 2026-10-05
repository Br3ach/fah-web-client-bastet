require('./gpu-policy-loader.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test');
const text=fs.readFileSync(path.join(__dirname,'../src/GroupSettings.vue'),'utf8');
const c=new Function(text.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace('export default','return'))();
test('CPU slider uses the published resource budget with a legacy machine fallback',()=>{
 for(const cpuLimit of [0,8,14,16])
  assert.equal(c.computed.cpu_count_limit.call({cpuAffinity:{},cpuLimit,cpus:16}),cpuLimit);
 assert.equal(c.computed.cpu_count_limit.call({cpuAffinity:undefined,cpus:16}),16);
});
test('class controls still require distinct reported performance classes',()=>{
 for(const cpuAffinity of [undefined,{class_selection:false,performance_levels:[{}]}])
  assert.equal(c.computed.class_supported.call({cpuAffinity}),false);
 assert.equal(c.computed.class_supported.call({cpuAffinity:{class_selection:true,performance_levels:[{},{}]}}),true);
});
