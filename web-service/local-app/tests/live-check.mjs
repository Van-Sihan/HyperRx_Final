// Explicit manual integration check; never included in npm test.
import {runQuery} from '../service.mjs';
import {writeFile} from 'node:fs/promises';
const question='심바스타틴과 클래리트로마이신을 함께 복용해도 되나요?';
for(const mode of ['rag','hyperrag','llm']){
 try{
  const r=await runQuery({question,mode,demo:false});
  await writeFile(`data/live-${mode}.json`,JSON.stringify(r,null,2));
  console.log(JSON.stringify({mode,ok:true,documents:r.documents.length,nodes:r.graph.nodes.length,hyperedges:r.graph.hyperedges.length,elapsed:r.elapsed}));
 }catch(e){console.log(JSON.stringify({mode,ok:false,error:e.message}));process.exitCode=1;}
}
