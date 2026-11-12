import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseDoc,sanitizeTable,parseMaterial,rankProducts,groupProducts,lookupLabel,ingredients,decode} from '../mfds-label.mjs';

const EE='<DOC title="효능효과" type="EE">\n <SECTION title="">\n  <ARTICLE title="">\n   <PARAGRAPH tagName="p" textIndent="" marginLeft=""><![CDATA[1. 칸디다성 질염]]></PARAGRAPH>\n   <PARAGRAPH tagName="p"><![CDATA[2. 어루러기]]></PARAGRAPH>\n  </ARTICLE>\n </SECTION>\n</DOC>';
const NB='<DOC title="사용상의주의사항" type="NB"><SECTION title=""><ARTICLE title="1. 경고"><PARAGRAPH tagName="p"><![CDATA[울혈성심부전 환자에게 투여하지 않는다.<br/>투여 중 증상이 생기면 중단한다.]]></PARAGRAPH></ARTICLE>'+
 '<ARTICLE title="6. 상호작용"><PARAGRAPH tagName="table"><![CDATA[<table style="x" onclick="alert(1)"><tbody><tr><td rowspan="2" style="width:9pt"><p>지질조절제</p></td><td><script>alert(1)</script><a href="javascript:x">로바스타틴</a> &amp; 심바스타틴</td></tr></tbody></table>]]></PARAGRAPH></ARTICLE>'+
 '<ARTICLE title="캡슐은 반드시 그대로 삼켜야 한다." /></SECTION></DOC>';
const item=(seq,name,{ingr='[M083734]이트라코나졸',cancel='정상',change='20240101',nb=NB}={})=>({ITEM_SEQ:seq,ITEM_NAME:name,ENTP_NAME:'제약사',ETC_OTC_CODE:'전문의약품',ITEM_PERMIT_DATE:'20000101',CHANGE_DATE:change,
 MAIN_ITEM_INGR:ingr,CANCEL_NAME:cancel,MATERIAL_NAME:'총량 : 1캡슐(556 밀리그램) 중|성분명 : 이트라코나졸|분량 : 100|단위 : 밀리그램|규격 : EP',EE_DOC_DATA:EE,UD_DOC_DATA:'',NB_DOC_DATA:nb,ATC_CODE:'J02AC02'});

test('A label document reads as its sections, articles and paragraphs; tables keep only their cells',()=>{
 const ee=parseDoc(EE);
 assert.deepEqual(ee,[{title:'',articles:[{title:'',blocks:[{kind:'p',text:'1. 칸디다성 질염'},{kind:'p',text:'2. 어루러기'}]}]}]);
 const nb=parseDoc(NB)[0].articles;
 assert.deepEqual(nb.map(a=>a.title),['1. 경고','6. 상호작용','캡슐은 반드시 그대로 삼켜야 한다.']);
 assert.equal(nb[0].blocks[0].text,'울혈성심부전 환자에게 투여하지 않는다.\n투여 중 증상이 생기면 중단한다.');
 const html=nb[1].blocks[0].html;
 assert.equal(nb[1].blocks[0].kind,'table');
 assert.equal(html,'<table><tbody><tr><td rowspan="2"><p>지질조절제</p></td><td>alert(1)로바스타틴 &amp; 심바스타틴</td></tr></tbody></table>');
 assert.doesNotMatch(html,/script|onclick|javascript|style/);
 assert.equal(sanitizeTable('<img src=x onerror=alert(1)><b>굵게</b>'),'굵게');
 // A table that starts at <tbody> is wrapped, or the browser would drop its rows.
 assert.equal(sanitizeTable('<tbody> <tr> <td style="width:9pt"> <p>적응증</p> </td> </tr> </tbody>'),'<table><tbody> <tr> <td> <p>적응증</p> </td> </tr> </tbody></table>');
 assert.equal(decode('A&amp;B &#54620; &lt;'),'A&B 한 <');
});
test('The ingredient and its amount, and the product shown for an ingredient',()=>{
 assert.deepEqual(parseMaterial('총량 : 1캡슐(556 밀리그램) 중|성분명 : 이트라코나졸|분량 : 100|단위 : 밀리그램|규격 : EP;총량 : 1캡슐|성분명 : 첨가물|분량 : 1|단위 : 그램'),
  [{total:'1캡슐(556 밀리그램) 중',name:'이트라코나졸',amount:'100',unit:'밀리그램'},{total:'1캡슐',name:'첨가물',amount:'1',unit:'그램'}]);
 assert.deepEqual(ingredients('[M083734]이트라코나졸|[M270057]이트라코나졸고체분산체'),['이트라코나졸','이트라코나졸고체분산체']);
 const ranked=rankProducts([
  item('1','스포라녹스액(이트라코나졸)',{cancel:'취하',change:'20260101'}),        // withdrawn
  item('2','코니트라캡슐(이트라코나졸)(수출용)',{change:'20260301'}),               // export only
  item('3','이트라정(이트라코나졸)',{change:'20240101'}),
  item('4','스포라녹스캡슐(이트라코나졸)',{change:'20260416'}),
  item('5','히트라졸정(이트라코나졸고체분산체)',{ingr:'[M092870]이트라코나졸고체분산체',change:'20260501'}), // a formulation: after the exact ones
  item('6','복합정',{ingr:'[M1]이트라코나졸|[M2]다른성분',change:'20260601'})],'이트라코나졸');                 // a combination: out
 assert.deepEqual(ranked.map(x=>x.ITEM_SEQ),['4','3','5']);
 // All of them in groups for the reader's list: in use, only for export, withdrawn or expired. An ingredient listed once
 // per strength ("로바스타틴|로바스타틴") is one ingredient, not a combination.
 const g=groupProducts([item('1','로바로드정(로바스타틴)',{ingr:'[M1]로바스타틴',cancel:'유효기간만료'}),item('2','로바콜정(로바스타틴)(수출용)',{ingr:'[M1]로바스타틴'}),
  item('3','로바타딘정(로바스타틴)',{ingr:'[M1]로바스타틴|[M1]로바스타틴|[M1]로바스타틴',change:'20250211'}),item('4','로바이틴정(로바스타틴)',{ingr:'[M1]로바스타틴',change:'20250211'})],'로바스타틴');
 assert.deepEqual([g.inUse,g.exportOnly,g.ended].map(x=>x.map(i=>i.ITEM_SEQ)),[['3','4'],['2'],['1']]);
 // Only export products: they are shown rather than nothing.
 assert.deepEqual(rankProducts([item('7','로바콜정(로바스타틴)(수출용)',{ingr:'[M1]로바스타틴'})],'로바스타틴').map(x=>x.ITEM_SEQ),['7']);
});
test('The lookup asks the service once per name, keeps the answer on disk without the key, and needs a key only to ask',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'label-'));let calls=[];
 const fetchImpl=async url=>{calls.push(String(url));const q=new URL(url).searchParams;const items=q.get('item_seq')?[item('200003111','이트라정(이트라코나졸)')]:[item('200003111','이트라정(이트라코나졸)'),item('202105228','스포라녹스캡슐(이트라코나졸)',{change:'20260416'})];
  return {text:async()=>JSON.stringify({body:{totalCount:items.length,items}})};};
 try{
  const r=await lookupLabel({names:['ITRACONAZOLE','이트라코나졸']},{key:'secret%2Bkey',cacheDir:dir,fetchImpl});
  assert.equal(r.product.name,'스포라녹스캡슐(이트라코나졸)');assert.equal(r.count,2);assert.equal(r.defaultSeq,'202105228');
  assert.deepEqual(r.products.map(o=>[o.itemSeq,o.group,o.status]),[['202105228','inUse','정상'],['200003111','inUse','정상']]);
  assert.equal(r.product.url,'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=202105228');
  assert.equal(r.source.name,'의약품안전나라');assert.match(r.search,/searchDrug\?searchYn=true&itemName=%EC%9D%B4/);
  assert.equal(calls.length,1);assert.match(calls[0],/item_name=%EC%9D%B4%ED%8A%B8/);assert.match(calls[0],/serviceKey=secret%2Bkey/); // the key decoded once, encoded once
  assert.doesNotMatch(JSON.stringify(r),/secret/);
  // The cache answers again without the key; a picked product is asked by its code.
  const again=await lookupLabel({names:['이트라코나졸']},{key:'',cacheDir:dir,fetchImpl});assert.equal(again.product.itemSeq,'202105228');assert.equal(calls.length,1);
  const picked=await lookupLabel({names:['이트라코나졸'],itemSeq:'200003111'},{key:'k',cacheDir:dir,fetchImpl});
  assert.equal(picked.product.itemSeq,'200003111');assert.equal(picked.chosen,true);assert.deepEqual(picked.products.map(o=>o.itemSeq),['202105228','200003111']);assert.equal(picked.defaultSeq,'202105228');assert.match(calls[1],/item_seq=200003111/);
  await assert.rejects(lookupLabel({names:['심바스타틴']},{key:'',cacheDir:dir,fetchImpl}),e=>e.needsKey===true&&e.status===503);
  assert.equal(await lookupLabel({names:['ITRACONAZOLE']},{key:'k',cacheDir:dir,fetchImpl}),null); // no Korean name to search by
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('A refused key or a passed limit is an error and is not cached; "no data" is a real empty answer (2026-11-10)',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'label-'));
 const gate=(status,code,msg)=>async()=>({status,ok:status<400,text:async()=>JSON.stringify({OpenAPI_ServiceResponse:{cmmMsgHeader:{errMsg:msg,returnAuthMsg:msg,returnReasonCode:code}}})});
 try{
  // What the portal answered for an unknown key (403, code 30): it read as "0 products" and was kept for 14 days.
  await assert.rejects(lookupLabel({names:['심바스타틴']},{key:'k',cacheDir:dir,fetchImpl:gate(403,'30','SERVICE_KEY_IS_NOT_REGISTERED_ERROR')}),
   e=>e.status===401&&e.needsKey===true&&/인증키가 올바르지 않거나/.test(e.message));
  await assert.rejects(lookupLabel({names:['심바스타틴']},{key:'k',cacheDir:dir,fetchImpl:gate(200,'22','LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')}),e=>e.status===429&&/한도/.test(e.message));
  const xml=async()=>({status:200,text:async()=>'<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'});
  await assert.rejects(lookupLabel({names:['심바스타틴']},{key:'k',cacheDir:dir,fetchImpl:xml}),e=>e.needsKey===true);
  await assert.rejects(lookupLabel({names:['심바스타틴']},{key:'k',cacheDir:dir,fetchImpl:async()=>({status:500,text:async()=>'{}'})}),e=>e.status===502&&!e.needsKey);
  assert.deepEqual(await readdir(dir).catch(()=>[]),[]); // nothing was cached
  // Next, a good key gets the products: no earlier failure stands in its way.
  const good=async()=>({status:200,ok:true,text:async()=>JSON.stringify({header:{resultCode:'00',resultMsg:'NORMAL SERVICE.'},body:{totalCount:1,items:[item('199900001','조코정(심바스타틴)',{ingr:'[M1]심바스타틴'})]}})});
  assert.equal((await lookupLabel({names:['심바스타틴']},{key:'k',cacheDir:dir,fetchImpl:good})).product.itemSeq,'199900001');
  const none=async()=>({status:200,ok:true,text:async()=>JSON.stringify({header:{resultCode:'03',resultMsg:'NODATA_ERROR'},body:{totalCount:0}})});
  const empty=await lookupLabel({names:['없는약이름']},{key:'k',cacheDir:dir,fetchImpl:none});
  assert.equal(empty.product,null);assert.equal(empty.count,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
