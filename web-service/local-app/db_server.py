"""Local read-only retrieval bridge for the team's verified Hyper-RAG release."""
import os,sys,json,csv,hashlib,asyncio,logging,contextvars
from pathlib import Path
from contextlib import asynccontextmanager
from evidence import MedicationIndex,describe_source,source_document,attach_provenance
from clinical import ClinicalIndex
from entity_notes import EntityNotes
import openai_keys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'vendor'/'Hyper-RAG'))
from dotenv import load_dotenv
load_dotenv(ROOT/'.env',encoding='utf-8-sig')
from fastapi import FastAPI,HTTPException,Header
from pydantic import BaseModel,Field
from typing import Literal
from openai import AsyncOpenAI
from hyperrag import HyperRAG,QueryParam
import hyperrag.hyperrag as engine
from hyperrag.prompt import PROMPTS
from hyperrag.utils import EmbeddingFunc
import numpy as np
# A failed model call must give its slot back (openai_keys.limit_calls); set before HyperRAG wraps the functions.
engine.limit_async_func_call=openai_keys.limit_calls
WORK=ROOT/'data'/'kdb-work'
state={};lock=asyncio.Lock()
# The OpenAI client of the search being run: the reader's own key (X-OpenAI-Key) or, when allowed, the server's.
current_client=contextvars.ContextVar('openai_client',default=None)
@asynccontextmanager
async def lifespan(app):
 verified=json.loads((WORK/'verified.json').read_text())
 settings=json.loads((WORK/'query_settings.json').read_text(encoding='utf-8'))
 prompt=(WORK/settings['keyword_prompt_file']).read_text(encoding='utf-8')
 if hashlib.md5(prompt.encode()).hexdigest()!=settings['keyword_prompt_md5']:raise RuntimeError('Keyword prompt checksum mismatch')
 PROMPTS['keywords_extraction']=prompt
 # No server key (REQUIRE_USER_KEY=1 or none in .env): the server still starts, and each search needs the reader's key.
 key=openai_keys.server_key()
 server_client=AsyncOpenAI(api_key=key,timeout=60,max_retries=1) if key else None
 def client():return current_client.get() or server_client
 async def llm(prompt,system_prompt=None,history_messages=None,**kwargs):
  kwargs.pop('hashing_kv',None)
  messages=([{'role':'system','content':system_prompt}] if system_prompt else [])+(history_messages or [])+[{'role':'user','content':prompt}]
  response=await client().chat.completions.create(model=os.getenv('OPENAI_MODEL',settings['llm_model']),messages=messages,max_completion_tokens=2000,**kwargs)
  return response.choices[0].message.content
 async def embedding(texts):
  response=await client().embeddings.create(model=settings['embedding_model'],input=texts,dimensions=settings['embedding_dim'])
  return np.array([x.embedding for x in response.data])
 rag=HyperRAG(working_dir=str(WORK),llm_model_func=llm,enable_llm_cache=False,embedding_func=EmbeddingFunc(embedding_dim=settings['embedding_dim'],max_token_size=8192,func=embedding))
 logging.getLogger('hyper_rag').setLevel(logging.WARNING)
 with (WORK/'sources.csv').open(encoding='utf-8-sig',newline='') as f:sources={r['chunk_id']:r for r in csv.DictReader(f)}
 content_ids={hashlib.sha256(v['content'].encode()).hexdigest():k for k,v in rag.text_chunks._data.items()}
 # The anchor step also reads the hypergraph (read-only) to add hyperedges that join the asked drugs; see MedicationIndex.pair_edges.
 hg=rag.chunk_entity_relation_hypergraph._hg
 graph={'v_data':hg._v_data,'v_inci':hg._v_inci,'e_data':hg._e_data}
 medications=MedicationIndex(rag.text_chunks._data,sources,graph)
 # Rule lookups for the evidence dashboard (DUR pairs and flags, label sentences); no LLM call. See clinical.py.
 state.update(rag=rag,settings=settings,sources=sources,content_ids=content_ids,verified=verified,medications=medications,clinical=ClinicalIndex(rag.text_chunks._data,sources,medications),server_key=bool(server_client),
  # 노드 사전: an entity's description sentence by sentence with the records each most likely came from. See entity_notes.py.
  entity=EntityNotes(rag.text_chunks._data,sources,graph,medications))
 print('DB READY: '+str(len(rag.text_chunks._data))+' chunks',flush=True)
 yield
 if server_client:await server_client.close()
app=FastAPI(lifespan=lifespan)
class Query(BaseModel):
 question:str=Field(min_length=1,max_length=2000)
 mode:Literal['naive','hyper']='hyper'
 database:str|None=None
 # False reproduces the evaluated pipeline (no exact medication-name anchoring).
 anchor:bool=True
@app.get('/health')
async def health():
 return {'ready':bool(state),'version':state['verified']['version'],'documents':len(state['rag'].full_docs._data),'chunks':len(state['rag'].text_chunks._data),'entities':state['verified']['entities'],'hyperedges':state['verified']['hyperedges'],'model':os.getenv('OPENAI_MODEL','gpt-4o-mini'),'embedding':'text-embedding-3-small','server_key':state['server_key'],'require_user_key':openai_keys.require_user_key()}
class ClinicalQuery(BaseModel):
 question:str=Field(min_length=1,max_length=2000)
@app.post('/clinical')
async def clinical(q:ClinicalQuery):
 """DUR 병용금기 pairs, per-drug DUR flags and label sentences for the drugs named in the question. Read-only, no OpenAI call."""
 return {'database':state['verified']['version'],**state['clinical'].summary(q.question)}
@app.post('/drugs')
async def drugs(q:ClinicalQuery):
 """The drugs named in the question (ClinicalIndex.targets, one per ingredient group), for the RAG/HyperRAG recommendation
 shown while the question is typed. Drug classes (NSAIDs, 이뇨제 …) are not counted. Read-only, no OpenAI call."""
 c=state['clinical'];found=[c.name_of(g) for g in c.targets(q.question)]
 return {'drugs':found,'count':len(found)}
class EntityQuery(BaseModel):
 names:list[str]=Field(min_length=1,max_length=8)
@app.post('/entity')
async def entity(q:EntityQuery):
 """노드 사전: an entity's DB description sentence by sentence, each with the records it most likely came from. Read-only, no OpenAI call."""
 names=tuple(dict.fromkeys(n.strip()[:200] for n in q.names if n.strip()))
 out=await asyncio.to_thread(state['entity'].describe,names)
 if not out:raise HTTPException(404,'해당 항목을 DB에서 찾지 못했습니다.')
 return {'database':state['verified']['version'],**out}
@app.get('/evidence/{chunk_id}')
async def evidence_document(chunk_id:str):
 doc=source_document(chunk_id,state['rag'].text_chunks._data,state['sources'])
 if not doc:raise HTTPException(404,'해당 원문을 찾을 수 없습니다.')
 return doc
async def retrieve(question,mode):
 """Engine retrieval only (one keyword-extraction + embedding pass). No anchoring, no generation."""
 s=state['settings']
 param=QueryParam(mode=mode,top_k=s['top_k'],max_token_for_text_unit=s['max_token_for_text_unit'],max_token_for_entity_context=s['max_token_for_entity_context'],max_token_for_relation_context=s['max_token_for_relation_context'],only_need_context=True,return_type='json')
 result=await asyncio.wait_for(state['rag'].aquery(question,param),timeout=120)
 return result if isinstance(result,dict) else {'context':str(result or ''),'text_units':[]}
@app.post('/hyperrag/query')
async def query(q:Query,x_openai_key:str|None=Header(default=None)):
 # The reader's key is used for this one search and then closed; it is never logged or stored.
 key=(x_openai_key or '').strip()
 if key and not openai_keys.KEY_FORMAT.fullmatch(key):raise HTTPException(400,'OpenAI API 키 형식이 올바르지 않습니다. sk-로 시작하는 키를 넣어 주세요.')
 if not key and not state['server_key']:raise HTTPException(401,'OpenAI API 키가 필요합니다.')
 own=AsyncOpenAI(api_key=key,timeout=60,max_retries=1) if key else None
 token=current_client.set(own)
 try:
  async with lock:result=await retrieve(q.question,q.mode)
 except Exception as e:
  status,message=openai_keys.failure(e)
  logging.getLogger('db_bridge').warning('Query failed: %s (%s)',type(e).__name__,status)
  raise HTTPException(status,message) from None
 finally:
  current_client.reset(token)
  if own:await own.close()
 return await finalize(q.question,result,q.mode,q.anchor)
async def finalize(question,result,mode,anchor=True):
 """Optional medication anchoring, then source titles and hyperedge provenance. Mutates and returns a payload."""
 if anchor:result=state['medications'].refine(question,result)
 for index,doc in enumerate(result.get('text_units',[])):
  cid=doc.get('id') if doc.get('id') in state['sources'] else state['content_ids'].get(hashlib.sha256(doc['content'].encode()).hexdigest())
  source=state['sources'].get(cid,{})
  doc.update(id=cid or str(index),source=source,**describe_source(source,doc['content']))
  if source.get('pmid','').isdigit():doc['source_url']='https://pubmed.ncbi.nlm.nih.gov/'+source['pmid']+'/'
 # Each asked drug's own 효능군 / 효능·효과 record (MedicationIndex.drug_basics), titled like the documents.
 for doc in result.get('drug_basics',[]):
  source=state['sources'].get(doc['id'],{})
  doc.update(source=source,**describe_source(source,doc['content']))
 registry={};edges=[]
 for edge in result.get('hyperedges',[]):
  members=edge.get('entity_set',edge.get('id_set',[]))
  if isinstance(members,str):members=members.split('|#|')
  try:stored=await state['rag'].chunk_entity_relation_hypergraph.get_hyperedge(members)
  except (KeyError,ValueError,TypeError):stored=None
  linked,docs=attach_provenance(edge,stored,state['rag'].text_chunks._data,state['sources'],state['verified']['version'])
  edges.append(linked)
  for d in docs:registry[d['id']]=d
 result['hyperedges']=edges;result['evidence_documents']=list(registry.values())
 return {'success':True,'retrieval_only':True,'response':'','mode':mode,'anchor':anchor,'database':state['verified']['version'],**result}
if __name__=='__main__':
 import uvicorn
 uvicorn.run(app,host='127.0.0.1',port=8788,access_log=False)
