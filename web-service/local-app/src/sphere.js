// Spherical layout, 2D hit-testing helpers and the 3D "spherical network" view.
import {entityColors,SHARED_CORE} from './colors.js';
// Colors: relations and entities use the same palette and translucency as the 2D map; the mesh is neutral and carries no meaning.
export function spherePoints(count){return Array.from({length:count},(_,i)=>{const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),a=i*Math.PI*(3-Math.sqrt(5));return [Math.cos(a)*r,y,Math.sin(a)*r];});}
export function hull(points){const p=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);if(p.length<3)return p;const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);const half=arr=>{const h=[];for(const x of arr){while(h.length>1&&cross(h.at(-2),h.at(-1),x)<=0)h.pop();h.push(x);}return h;};return half(p).slice(0,-1).concat(half(p.slice().reverse()).slice(0,-1));}
export function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
// Shortest distance from p to a hull: 0 inside a polygon, otherwise distance to its nearest edge, segment or point.
export function distanceToShape(p,poly){
 if(!poly.length)return Infinity;
 if(poly.length>=3&&inside(p,poly))return 0;
 const seg=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));};
 if(poly.length===1)return Math.hypot(p.x-poly[0].x,p.y-poly[0].y);
 let best=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if(poly.length===2&&i===1)break;best=Math.min(best,seg(a,b));}
 return best;
}
const unit=v=>{const l=Math.hypot(...v);return l?v.map(x=>x/l):v;};
// Where a relation's lines meet: the members' mean direction pushed back onto the sphere (falls back to the first member).
export function hubPoint(vectors){const c=[0,0,0];for(const v of vectors)for(let i=0;i<3;i++)c[i]+=v[i];return Math.hypot(...c)>1e-6?unit(c):vectors[0];}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Geodesic sphere: an icosahedron whose faces are split into frequency² triangles, pushed out onto the unit sphere.
// Frequency f gives 10f²+2 vertices, 30f² edges and 20f² faces (f=3 → 92 vertices, 270 edges).
export function geodesicSphere(frequency=3){
 const t=(1+Math.sqrt(5))/2,base=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
 const ico=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 const vertices=[],index=new Map(),edgeKeys=new Set(),edges=[],faces=[];
 const vertex=v=>{const u=unit(v),key=u.map(x=>x.toFixed(6)).join(',');if(!index.has(key)){index.set(key,vertices.length);vertices.push(u);}return index.get(key);};
 const link=(a,b)=>{const key=a<b?a*100000+b:b*100000+a;if(a!==b&&!edgeKeys.has(key)){edgeKeys.add(key);edges.push([Math.min(a,b),Math.max(a,b)]);}};
 for(const [a,b,c] of ico){
  const A=base[a],B=base[b],C=base[c],n=frequency,grid=[];
  for(let i=0;i<=n;i++){grid[i]=[];for(let j=0;j<=n-i;j++)grid[i][j]=vertex([0,1,2].map(k=>A[k]+(B[k]-A[k])*i/n+(C[k]-A[k])*j/n));}
  for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
   link(grid[i][j],grid[i+1][j]);link(grid[i][j],grid[i][j+1]);link(grid[i+1][j],grid[i][j+1]);faces.push([grid[i][j],grid[i+1][j],grid[i][j+1]]);
   if(i+j<n-1)faces.push([grid[i+1][j],grid[i+1][j+1],grid[i][j+1]]);
  }
 }
 return {vertices,edges,faces};
}
const shells=new Map();
// Geodesic shell with adjacency (edge length as weight), cached per frequency.
function shellOf(f){
 if(!shells.has(f)){const g=geodesicSphere(f),adj=g.vertices.map(()=>[]),edgeIndex=new Map();g.edges.forEach(([a,b],k)=>{const w=Math.hypot(...g.vertices[a].map((x,i)=>x-g.vertices[b][i]));adj[a].push([b,w,k]);adj[b].push([a,w,k]);edgeIndex.set(a*100000+b,k);});shells.set(f,{...g,adj,edgeIndex});}
 return shells.get(f);
}
// Smallest shell that leaves room to spare (≥1.6 vertices per entity); f=2 (42) for small results up to f=6 (362).
export function shellFrequency(count){for(let f=2;f<=6;f++)if(10*f*f+2>=Math.max(42,1.6*count))return f;return 6;}
// Relation-aware layout on the sphere: members of the same relation pull toward their common centre, everything repels, positions stay on the unit sphere.
// Deterministic: starts from the Fibonacci layout and uses no randomness.
export function relaxOnSphere(count,groups,iterations=260){
 if(count<3)return [[-.34,0,.94],[.34,0,.94]].slice(0,count).map(unit); // one or two entities: side by side on the front, not at opposite poles
 const p=spherePoints(count);
 const repel=.5/count;
 for(let it=0;it<iterations;it++){
  const step=.09*(1-it/iterations)+.004,f=p.map(()=>[0,0,0]);
  for(const g of groups){if(g.length<2)continue;const c=[0,0,0];for(const i of g)for(let k=0;k<3;k++)c[k]+=p[i][k]/g.length;for(const i of g)for(let k=0;k<3;k++)f[i][k]+=c[k]-p[i][k];}
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){const d=[p[i][0]-p[j][0],p[i][1]-p[j][1],p[i][2]-p[j][2]],s=repel/(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]+1e-4);for(let k=0;k<3;k++){f[i][k]+=d[k]*s;f[j][k]-=d[k]*s;}}
  for(let i=0;i<count;i++)p[i]=unit(p[i].map((x,k)=>x+f[i][k]*step));
 }
 return p;
}
// Places every entity on its own geodesic vertex (best-connected entities choose first). Falls back to free positions if the shell is too small.
export function relationLayout(count,groups){
 const frequency=shellFrequency(count),shell=shellOf(frequency),relaxed=relaxOnSphere(count,groups),degree=new Array(count).fill(0);
 groups.forEach(g=>new Set(g).forEach(i=>degree[i]++));
 const vertexOf=new Array(count).fill(-1);
 if(shell.vertices.length>=count){const used=new Set();[...Array(count).keys()].sort((a,b)=>degree[b]-degree[a]||a-b).forEach(i=>{let best=-1,score=-Infinity;shell.vertices.forEach((v,k)=>{if(!used.has(k)&&dot(v,relaxed[i])>score){score=dot(v,relaxed[i]);best=k;}});used.add(best);vertexOf[i]=best;});}
 return {frequency,shell,degree,vertexOf,pos:vertexOf.map((k,i)=>k>=0?shell.vertices[k]:relaxed[i])};
}
// Dijkstra on the shell; returns the shell-edge indices of the shortest surface path.
function surfacePath(shell,from,to){
 const n=shell.vertices.length,dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),via=new Int32Array(n).fill(-1),done=new Uint8Array(n);dist[from]=0;
 for(;;){let u=-1,best=Infinity;for(let i=0;i<n;i++)if(!done[i]&&dist[i]<best){best=dist[i];u=i;}if(u<0||u===to)break;done[u]=1;for(const [v,w,k] of shell.adj[u])if(dist[u]+w<dist[v]){dist[v]=dist[u]+w;prev[v]=u;via[v]=k;}}
 const out=[];for(let v=to;v!==from&&prev[v]>=0;v=prev[v])out.push(via[v]);return out;
}
// One relation drawn on the surface: shortest shell paths from a junction vertex to every member, plus the shell triangles inside the members' outline (≥3 members).
export function routeRelation(shell,memberVertices,occupied=new Set()){
 const members=[...new Set(memberVertices)];
 if(members.length<2)return {hub:members[0],junction:false,edges:[],faces:[]};
 let hub=members[0],junction=false;
 if(members.length>2){
  const c=hubPoint(members.map(k=>shell.vertices[k])),order=shell.vertices.map((v,k)=>[k,dot(v,c)]).sort((a,b)=>b[1]-a[1]);
  const free=order.find(([k])=>!occupied.has(k));hub=free&&free[1]>=order[0][1]-.02?free[0]:order[0][0];junction=!members.includes(hub);
 }
 const edges=new Set();for(const m of members)if(m!==hub)for(const e of surfacePath(shell,hub,m))edges.add(e);
 let faces=[];
 if(members.length>=3){
  const c=hubPoint(members.map(k=>shell.vertices[k]));
  if(members.every(k=>dot(shell.vertices[k],c)>.34)){
   const u=unit(cross(Math.abs(c[0])<.9?[1,0,0]:[0,1,0],c)),w=cross(c,u),flat=v=>{const d=dot(v,c);return {x:dot(v,u)/d,y:dot(v,w)/d};};
   const poly=hull(members.map(k=>flat(shell.vertices[k])));
   if(poly.length>=3)faces=shell.faces.map((f,i)=>[i,unit([0,1,2].map(k=>shell.vertices[f[0]][k]+shell.vertices[f[1]][k]+shell.vertices[f[2]][k]))]).filter(([,m])=>dot(m,c)>.34&&inside(flat(m),poly)).map(([i])=>i);
  }
 }
 return {hub,junction,edges:[...edges],faces};
}

// keyNodes: ids of the drugs the question asks about; drawn larger with a neutral ring and an always-on bold label.
export function sphereView(container,data,{palette,dark,labels,keyNodes=new Set(),onSelect,onSelectNode=()=>{},onHover=()=>{}}){
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','3D 하이퍼그래프 구체. 드래그로 회전하고 아래 관계 버튼으로 선택하세요.');canvas.tabIndex=0;container.append(canvas);
 const ctx=canvas.getContext('2d'),idx=new Map(data.nodes.map((n,i)=>[n.id,i]));
 const groups=data.hyperedges.map(e=>e.members.map(id=>idx.get(id)).filter(i=>i!==undefined));
 // Layout and routes are computed once per result; only the view rotates.
 const L=relationLayout(data.nodes.length,groups),shell=L.shell,snapped=L.vertexOf.every(k=>k>=0),occupied=new Set(L.vertexOf);
 const relations=data.hyperedges.map((edge,k)=>{const g=groups[k];if(!g.length)return null;const color=palette[(edge.colorIndex??k)%palette.length];return snapped?{edge,color,...routeRelation(shell,g.map(i=>L.vertexOf[i]),occupied)}:{edge,color,members:g,free:true,hubVec:hubPoint(g.map(i=>L.pos[i]))};}).filter(Boolean)
  .sort((a,b)=>b.edge.members.length-a.edge.members.length); // larger areas first, small relations on top
 // Shaded triangles covered by more than one relation are drawn once in a neutral tone (mixing colors would invent a color that belongs to no relation);
 // each relation that shares triangles also gets its region outline in its own color, so every region stays traceable.
 // filter() keeps this layout and only changes which relations (and their entities) are drawn; sharing is recounted among those.
 const edgeKey=(a,b)=>shell.edgeIndex.get(Math.min(a,b)*100000+Math.max(a,b));
 let faceOwners=new Map(),sharedFaces=[],shown=relations,shownNodes=null;
 function computeShares(list){
  faceOwners=new Map();list.forEach(r=>(r.faces||[]).forEach(fi=>faceOwners.set(fi,(faceOwners.get(fi)||0)+1)));
  sharedFaces=[...faceOwners].filter(([,n])=>n>1).map(([fi])=>fi);
  for(const r of list){
   if(!r.faces?.length)continue;
   r.own=r.faces.filter(fi=>faceOwners.get(fi)===1);r.shares=r.own.length<r.faces.length;r.boundary=[];
   if(r.shares){const count=new Map();for(const fi of r.faces){const [a,b,c]=shell.faces[fi];for(const k of [edgeKey(a,b),edgeKey(b,c),edgeKey(a,c)])count.set(k,(count.get(k)||0)+1);}r.boundary=[...count].filter(([,n])=>n===1).map(([k])=>k);}
  }
 }
 computeShares(relations);
 const colorsOf=entityColors(data,palette),core=dark?SHARED_CORE.dark:SHARED_CORE.light;
 const related=new Map(data.nodes.map(n=>[n.id,data.hyperedges.filter(e=>e.members.includes(n.id))]));
 // Labels: when not hovering, only front entities that are among the 15 best connected (all of them for small results).
 const labelled=new Set([...L.degree.keys()].sort((a,b)=>L.degree[b]-L.degree[a]).slice(0,data.nodes.length<=30?data.nodes.length:15));
 // Same label and neutral tones as the 2D map (G6 label #506078 / #e8eef7).
 const ink=dark?{mesh:'#7286a6',glow:'114,134,166',label:'#e8eef7',caption:'#adbed5',key:'#f4f7fb'}:{mesh:'#a3b2c7',glow:'163,178,199',label:'#506078',caption:'#65758b',key:'#1f2937'};
 const KEY_SCALE=1.45,isKey=i=>keyNodes.has(data.nodes[i].id);
 const BACK=.12,DIM=.22; // back of the sphere and non-highlighted elements
 // Start with the best-connected entity facing the viewer, slightly off centre.
 const top=L.pos[[...L.degree.keys()].sort((a,b)=>L.degree[b]-L.degree[a])[0]]||[0,0,1],zz0=Math.hypot(top[0],top[2]);
 let yaw=Math.atan2(-top[0],top[2])+.35,pitch=Math.atan2(top[1],zz0)+.15,zoom=1,w=0,h=0,dpr=1,paths=[],projected=[],drag=null,moved=false,focus=null,focusKey='';
 // Slow idle rotation (about one turn per 50 s). Pauses while the cursor is on the sphere, while dragging, when off screen, and for reduced-motion users.
 const SPIN=.125,spin=!matchMedia('(prefers-reduced-motion: reduce)').matches;let raf=0,last=0,pointerInside=false,visible=true;
 function resize(){w=container.clientWidth;h=container.clientHeight;dpr=Math.min(devicePixelRatio,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';draw();}
 function tick(t){raf=requestAnimationFrame(tick);const dt=last?Math.min(.05,(t-last)/1000):0;last=t;if(pointerInside||drag||!visible||!w)return;yaw+=SPIN*dt;draw();}
 function setFocus(next){const key=next?[...next.edges].join(',')+'|'+[...next.nodes].join(','):'';if(key===focusKey)return;focusKey=key;focus=next;draw();}
 function draw(){
  if(!w||!h)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const R=Math.min(w,h)*.36*zoom,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const project=([x,y,z])=>{const xx=x*cy+z*sy,zz=-x*sy+z*cy,yy=y*cp-zz*sp,depth=y*sp+zz*cp,s=3/(3-depth);return{x:w/2+xx*R*s,y:h/2+yy*R*s,z:depth,s};};
  const halo=ctx.createRadialGradient(w/2,h/2,R*.55,w/2,h/2,R*1.35);halo.addColorStop(0,`rgba(${ink.glow},0.05)`);halo.addColorStop(1,`rgba(${ink.glow},0)`);ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
  // geodesic shell: faint and neutral, back half fainter
  const V=shell.vertices.map(project);ctx.strokeStyle=ink.mesh;ctx.lineWidth=.6;
  for(const [lo,hi,alpha] of [[-2,0,.07],[0,2,.16]]){ctx.globalAlpha=alpha;ctx.beginPath();for(const [i,j] of shell.edges){const a=V[i],b=V[j],d=(a.z+b.z)/2;if(d<lo||d>=hi)continue;ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();}
  ctx.fillStyle=ink.mesh;V.forEach((p,k)=>{if(occupied.has(k))return;ctx.globalAlpha=p.z<0?.12:.28;ctx.beginPath();ctx.arc(p.x,p.y,1.1*p.s,0,Math.PI*2);ctx.fill();});
  // relations on the surface, same palette and translucency as 2D (area .14–.18, line .65); back parts and non-highlighted relations fade out
  paths=[];ctx.lineCap='round';ctx.lineJoin='round';
  const ordered=focus?[...shown].sort((a,b)=>focus.edges.has(a.edge.id)-focus.edges.has(b.edge.id)):shown;
  if(sharedFaces.length){const front=new Path2D(),back=new Path2D();for(const fi of sharedFaces){const [a,b,c]=shell.faces[fi],A=V[a],B=V[b],C=V[c],t=(A.z+B.z+C.z)/3>=0?front:back;t.moveTo(A.x,A.y);t.lineTo(B.x,B.y);t.lineTo(C.x,C.y);t.closePath();}ctx.fillStyle=core;ctx.globalAlpha=.03;ctx.fill(back);ctx.globalAlpha=focus?.05:.12;ctx.fill(front);}
  for(const r of ordered){
   const on=!focus||focus.edges.has(r.edge.id),strong=!!focus&&on,dim=on?1:DIM,fillF=new Path2D(),fillB=new Path2D(),paintF=new Path2D(),paintB=new Path2D(),lineF=new Path2D(),lineB=new Path2D(),edgeF=new Path2D(),edgeB=new Path2D();
   if(r.free){const H=project(r.hubVec);for(const i of r.members){const M=project(L.pos[i]);const t=(H.z+M.z)/2>=0?lineF:lineB;t.moveTo(H.x,H.y);t.lineTo(M.x,M.y);}}
   else{
    const paintAll=strong||!r.shares;
    for(const fi of r.faces){const [a,b,c]=shell.faces[fi],A=V[a],B=V[b],C=V[c],front=(A.z+B.z+C.z)/3>=0,targets=[front?fillF:fillB];if(paintAll||faceOwners.get(fi)===1)targets.push(front?paintF:paintB);for(const t of targets){t.moveTo(A.x,A.y);t.lineTo(B.x,B.y);t.lineTo(C.x,C.y);t.closePath();}}
    if(r.shares&&!strong)for(const ei of r.boundary){const [a,b]=shell.edges[ei],A=V[a],B=V[b],t=(A.z+B.z)/2>=0?edgeF:edgeB;t.moveTo(A.x,A.y);t.lineTo(B.x,B.y);}
    for(const ei of r.edges){const [a,b]=shell.edges[ei],A=V[a],B=V[b],t=(A.z+B.z)/2>=0?lineF:lineB;t.moveTo(A.x,A.y);t.lineTo(B.x,B.y);}
    if(!r.edges.length){const H=V[r.hub],t=H.z>=0?lineF:lineB;t.moveTo(H.x+10*H.s,H.y);t.arc(H.x,H.y,10*H.s,0,Math.PI*2);}
   }
   ctx.fillStyle=ctx.strokeStyle=r.color;
   for(const [fill,line,outline,k] of [[paintB,lineB,edgeB,BACK],[paintF,lineF,edgeF,1]]){
    ctx.globalAlpha=(strong?.26:.14)*k*dim;ctx.fill(fill);
    ctx.globalAlpha=.6*k*dim;ctx.lineWidth=1.1;ctx.setLineDash([4,3]);ctx.stroke(outline);ctx.setLineDash([]);
    ctx.globalAlpha=(strong?.32:.18)*k*dim;ctx.lineWidth=7;ctx.stroke(line);
    ctx.globalAlpha=(strong?.95:.65)*k*dim;ctx.lineWidth=strong?2:1.3;ctx.stroke(line);
   }
   const H=r.junction?V[r.hub]:null;
   if(H){ctx.globalAlpha=.8*(H.z>=0?1:BACK)*dim;ctx.beginPath();ctx.arc(H.x,H.y,2.6*H.s,0,Math.PI*2);ctx.fill();}
   paths.push({line:lineF,fill:r.faces?.length?fillF:null,hub:H&&H.z>=0?H:null,edge:r.edge}); // only the front half can be hovered or clicked
  }
  // entities: glowing dots in the 2D palette order; the back half is nearly hidden
  projected=L.pos.map((v,i)=>L.vertexOf[i]>=0?V[L.vertexOf[i]]:project(v));
  projected.map((p,i)=>({...p,i})).sort((a,b)=>a.z-b.z).forEach(p=>{
   if(shownNodes&&!shownNodes.has(data.nodes[p.i].id))return;
   const id=data.nodes[p.i].id,on=!focus||focus.nodes.has(id),cs=colorsOf.get(id)||[],shared=cs.length>1,color=cs.length===1?cs[0]:core,key=isKey(p.i),r=6.2*p.s*(key?KEY_SCALE:1);
   const a=(p.z>=0?.55+.45*p.z:.12+.13*(1+p.z))*(on?1:DIM);
   const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*3.2);g.addColorStop(0,color);g.addColorStop(1,color+'00');
   ctx.globalAlpha=a*(shared?.25:.5);ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r*3.2,0,Math.PI*2);ctx.fill();
   // One fill only: the relation color, or neutral for an entity in several relations (no split color ring).
   ctx.globalAlpha=a;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
   if(key){ctx.globalAlpha=a;ctx.strokeStyle=ink.key;ctx.lineWidth=2*p.s;ctx.beginPath();ctx.arc(p.x,p.y,r+2.5*p.s,0,Math.PI*2);ctx.stroke();}
   const show=key?p.z>-.3:labels&&(focus?on&&p.z>-.3:p.z>.1&&labelled.has(p.i));
   if(show){ctx.globalAlpha=Math.min(1,a+.15);ctx.font=key?'600 12px Pretendard, sans-serif':'11px Pretendard, sans-serif';ctx.textAlign='center';ctx.fillStyle=key?ink.key:ink.label;ctx.fillText(data.nodes[p.i].label,p.x,p.y+r+(key?14:12));}
  });
  ctx.globalAlpha=1;ctx.textAlign='left';ctx.fillStyle=ink.caption;ctx.font='13px Pretendard, sans-serif';ctx.fillText('3D 구체 · 드래그하여 회전 · 방향키 지원',18,h-18);
 }
 canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];moved=false;onHover(null);canvas.setPointerCapture(e.pointerId);};
 canvas.onpointerenter=()=>{pointerInside=true;};
 canvas.onpointerleave=()=>{pointerInside=false;last=0;if(!drag){onHover(null);setFocus(null);}};
 canvas.onpointermove=e=>{if(!drag){hover(e);return;}const dx=e.clientX-drag[0],dy=e.clientY-drag[1];if(Math.abs(dx)+Math.abs(dy)>2)moved=true;yaw+=dx*.008;pitch+=dy*.008;drag=[e.clientX,e.clientY];draw();};
 canvas.onpointerup=e=>{drag=null;if(moved)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,node=pickNode(x,y);if(node)return onSelectNode(node);const hit=pickEdge(x,y);if(hit)onSelect(hit.edge);};
 canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.4,Math.min(2.5,zoom-e.deltaY*.001));draw();};
 canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();yaw+=e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0;pitch+=e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0;draw();};
 // Hovering highlights the relation (or every relation of the entity) and fades the rest.
 function hover(e){
  const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,node=pickNode(x,y);
  if(node){canvas.style.cursor='pointer';const edges=related.get(node.id)||[];setFocus({edges:new Set(edges.map(x=>x.id)),nodes:new Set([node.id,...edges.flatMap(x=>x.members)])});return onHover({kind:'node',node},e.clientX,e.clientY);}
  const hit=pickEdge(x,y);canvas.style.cursor=hit?'pointer':'grab';setFocus(hit?{edges:new Set([hit.edge.id]),nodes:new Set(hit.edge.members)}:null);onHover(hit?{kind:'edge',...hit}:null,e.clientX,e.clientY);
 }
 // Front-most visible entity within its drawn dot (+4px), otherwise the relation with the fewest members under the cursor (same rule as 2D).
 function pickNode(x,y){const p=projected.map((p,i)=>({...p,i})).filter(p=>p.z>-.2&&(!shownNodes||shownNodes.has(data.nodes[p.i].id))&&Math.hypot(p.x-x,p.y-y)<=6.2*p.s*(isKey(p.i)?KEY_SCALE:1)+4).sort((a,b)=>b.z-a.z)[0];return p?data.nodes[p.i]:null;}
 function pickEdge(x,y){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.lineWidth=14;const hits=paths.filter(p=>ctx.isPointInStroke(p.line,x,y)||(p.fill&&ctx.isPointInPath(p.fill,x,y))||(p.hub&&Math.hypot(p.hub.x-x,p.hub.y-y)<9)).map(p=>p.edge).sort((a,b)=>a.members.length-b.members.length);ctx.restore();return hits.length?{edge:hits[0],overlap:hits.length}:null;}
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 const seen=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;last=0;});seen.observe(container);
 if(spin)raf=requestAnimationFrame(tick);
 function filter(ids){shown=ids?relations.filter(r=>ids.has(r.edge.id)):relations;shownNodes=ids?new Set(shown.flatMap(r=>r.edge.members)):null;computeShares(shown);draw();}
 return{destroy(){cancelAnimationFrame(raf);observer.disconnect();seen.disconnect();canvas.remove();},fitView(){zoom=1;draw();},zoomBy(f){zoom=Math.max(.4,Math.min(2.5,zoom*f));draw();},resize,filter};
}
