import test from 'node:test';import assert from 'node:assert/strict';
import {LAB_IDS,defaultTemplate,evaluateChecks} from '../server/lab-templates.mjs';
test('all ten labs have rules that distinguish missing evidence from completed evidence',()=>{
 assert.equal(LAB_IDS.length,10);
 for(const id of LAB_IDS){const template=defaultTemplate(id);assert.ok(template.checks.length,id);assert.equal(evaluateChecks(template.checks,{}).passed,false,id);}
 for(const [id,state] of [['lab07',{feedbackBursts:3}],['lab08',{persistenceLoads:1}],['lab09',{aiTransitions:2}],['lab10',{poolReturned:3}]])assert.equal(evaluateChecks(defaultTemplate(id).checks,state).passed,true,id);
});
test('LAB01 evidence threshold matches three-coin built-in scene',()=>assert.equal(evaluateChecks(defaultTemplate('lab01').checks,{scene:{objects:[{},{}]},score:3,completed:true}).passed,true));
