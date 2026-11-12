import test from 'node:test';
import assert from 'node:assert/strict';
import {entityColors,relationColor} from '../src/colors.js';
const palette=['#A','#B','#C'];
test('Entities take their single relation color, shared entities keep every relation color, unlinked ones none',()=>{
 const data={nodes:[{id:'x'},{id:'y'},{id:'z'},{id:'lone'}],hyperedges:[{id:'e0',colorIndex:0,members:['x','y']},{id:'e1',colorIndex:4,members:['y','z','z']}]};
 const c=entityColors(data,palette);
 assert.deepEqual(c.get('x'),['#A']);assert.deepEqual(c.get('y'),['#A','#B']);assert.deepEqual(c.get('z'),['#B']);assert.deepEqual(c.get('lone'),[]);
 assert.equal(relationColor({},5,palette),'#C');
});
test('A filtered view recolors entities from the relations still shown',()=>{
 const shown={nodes:[{id:'x'},{id:'y'}],hyperedges:[{id:'e0',colorIndex:0,members:['x','y']}]};
 assert.deepEqual(entityColors(shown,palette).get('y'),['#A']);
});
