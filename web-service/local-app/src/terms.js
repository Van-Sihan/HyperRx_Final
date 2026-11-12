// 화면 용어 (2026-11-10): 'DUR' on its own is written out as 의약품안전사용서비스(DUR) wherever a reader sees it: in the
// screens' own text, in names the servers send ("DUR 성분정보"), and in the title, aria-label and placeholder of controls.
// A source's own text (the record shown in the source window) is left as written.
export const DUR_FULL='의약품안전사용서비스(DUR)';
const BARE=/(?<!의약품안전사용서비스\()(?<![A-Za-z0-9_])DUR(?![A-Za-z0-9_])/g;
export const fullTerms=t=>String(t??'').replace(BARE,DUR_FULL);
const ATTRS=['title','aria-label','placeholder','alt'];
const KEEP='script,style,.source-fulltext';
function fixAttrs(el){for(const a of ATTRS){const v=el.getAttribute?.(a);if(v&&v.includes('DUR')){const n=fullTerms(v);if(n!==v)el.setAttribute(a,n);}}}
export function fixTerms(node){
 if(!node)return;
 if(node.nodeType===3){
  const v=node.nodeValue;if(!v||!v.includes('DUR')||node.parentElement?.closest(KEEP))return;
  const n=fullTerms(v);if(n!==v)node.nodeValue=n;return;
 }
 if(node.nodeType!==1||node.closest(KEEP))return;
 fixAttrs(node);
 for(const el of node.querySelectorAll(ATTRS.map(a=>`[${a}*="DUR"]`).join(',')))if(!el.closest(KEEP))fixAttrs(el);
 const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
 for(let t=walk.nextNode();t;t=walk.nextNode())if(t.nodeValue.includes('DUR'))fixTerms(t);
}
// Watches the page: whatever is drawn later (panels, tips, dialogs) is fixed as it appears. A fix is idempotent, so the
// observer's own changes settle at once.
export function watchTerms(root=document.body){
 fixTerms(root);
 const seen=new MutationObserver(list=>{for(const m of list){
  if(m.type==='childList')m.addedNodes.forEach(fixTerms);
  else if(m.type==='characterData')fixTerms(m.target);
  else if(m.type==='attributes'&&m.target.nodeType===1&&!m.target.closest(KEEP))fixAttrs(m.target);
 }});
 seen.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
 return seen;
}
