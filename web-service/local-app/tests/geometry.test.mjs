import test from 'node:test';
import assert from 'node:assert/strict';
import {spherePoints,hull,inside,distanceToShape,hubPoint,geodesicSphere,shellFrequency,relationLayout,routeRelation} from '../src/sphere.js';
test('3D layout keeps every entity on a unit sphere, including small results',()=>{for(const n of [0,1,4,245]){const points=spherePoints(n);assert.equal(points.length,n);for(const p of points)assert.ok(Math.abs(Math.hypot(...p)-1)<1e-9);assert.equal(new Set(points.map(p=>p.join(','))).size,n);}});
test('Hyperedge hit area contains members and excludes unrelated positions',()=>{const polygon=hull([{x:0,y:0},{x:10,y:0},{x:5,y:5},{x:10,y:10},{x:0,y:10}]);assert.equal(polygon.length,4);assert.ok(inside({x:5,y:5},polygon));assert.equal(inside({x:20,y:5},polygon),false);});
test('Hover distance covers inside, two-member bands and single members',()=>{
 const square=hull([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]);assert.equal(distanceToShape({x:5,y:5},square),0);assert.equal(distanceToShape({x:15,y:5},square),5);
 assert.equal(distanceToShape({x:5,y:3},[{x:0,y:0},{x:10,y:0}]),3);assert.equal(distanceToShape({x:-4,y:3},[{x:0,y:0},{x:10,y:0}]),5);
 assert.equal(distanceToShape({x:3,y:4},[{x:0,y:0}]),5);assert.equal(distanceToShape({x:1,y:1},[]),Infinity);
});
test('Relation hubs sit on the sphere and fall back to a member when members cancel out',()=>{
 const h=hubPoint([[1,0,0],[0,1,0]]);assert.ok(Math.abs(Math.hypot(...h)-1)<1e-9);assert.ok(Math.abs(h[0]-h[1])<1e-9);
 assert.deepEqual(hubPoint([[1,0,0],[-1,0,0]]),[1,0,0]);
});
test('Geodesic shell has the textbook vertex and edge counts, all on the unit sphere',()=>{
 for(const f of [1,2,3]){const {vertices,edges,faces}=geodesicSphere(f);assert.equal(vertices.length,10*f*f+2);assert.equal(edges.length,30*f*f);assert.equal(faces.length,20*f*f);for(const v of vertices)assert.ok(Math.abs(Math.hypot(...v)-1)<1e-9);assert.ok(edges.every(([a,b])=>a<b&&b<vertices.length));}
});
test('Shell grows with the result and always leaves spare vertices',()=>{assert.equal(shellFrequency(18),2);assert.equal(shellFrequency(67),4);for(const n of [5,40,90,150,220])assert.ok(10*shellFrequency(n)**2+2>=1.6*n);});
test('Relation layout pulls members together and gives each entity its own vertex, deterministically',()=>{
 const groups=[[0,1,2],[3,4],[5,6,7,8],[0,9],[10,11,12],[13,14]],n=15;
 const L=relationLayout(n,groups),again=relationLayout(n,groups);
 assert.equal(new Set(L.vertexOf).size,n);assert.deepEqual(L.vertexOf,again.vertexOf);
 const ang=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])));
 const spread=pos=>groups.flatMap(g=>g.flatMap((a,i)=>g.slice(i+1).map(b=>ang(pos[a],pos[b])))).reduce((s,x,_,arr)=>s+x/arr.length,0);
 assert.ok(spread(L.pos)<spread(spherePoints(n))*.7);
});
test('A routed relation is one connected surface path through all of its members',()=>{
 const L=relationLayout(6,[[0,1,2,3]]),members=[0,1,2,3].map(i=>L.vertexOf[i]),r=routeRelation(L.shell,members,new Set(L.vertexOf));
 const parent=new Map(),find=x=>{while(parent.has(x)&&parent.get(x)!==x)x=parent.get(x);return x;},join=(a,b)=>{parent.set(find(a),find(b));};
 for(const e of r.edges){const [a,b]=L.shell.edges[e];join(a,b);}
 const roots=new Set([r.hub,...members].map(find));assert.equal(roots.size,1);assert.ok(r.faces.length>0);
 const pair=routeRelation(L.shell,members.slice(0,2));assert.equal(pair.junction,false);assert.equal(pair.faces.length,0);assert.ok(pair.edges.length>=1);
});
test('Two-member results sit next to each other, not on opposite sides',()=>{const L=relationLayout(2,[[0,1]]);const [a,b]=L.pos;assert.ok(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]>.5);});
