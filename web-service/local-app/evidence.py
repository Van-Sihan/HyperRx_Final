"""Readable source metadata and exact medication anchors, derived only from the local corpus."""
import re,json,unicodedata

def compact(text):
 return re.sub(r'\s+','',unicodedata.normalize('NFKC',str(text)).casefold())

def drug_names(content):
 pattern=r'(?:대상 성분은\s*|과\(와\)\s*|^\[[^\]]+\]\s*)([^()\n]+)\(([^()]+)\)\((?:단일제|복합제)\)'
 return [(a.strip().removeprefix('대상 성분은').strip(),b.strip()) for a,b in re.findall(pattern,content)]

# Official names of the sources the team DB was built from, as the 공공데이터포털 pages give them (checked 2026-11-05).
# DUR comes from the ingredient service (7 rule types, records carry ingredient codes); 허가 from the product approval
# service's detail operation (fields EE/UD/NB/PN_DOC_DATA); e약은요 from its overview service; papers from PubMed.
SOURCES={
 'dur':{'name':'식품의약품안전처_의약품안전사용서비스(DUR)성분정보','short':'DUR 성분정보','provider':'식품의약품안전처','portal':'공공데이터포털','page':'https://www.data.go.kr/data/15056780/openapi.do'},
 'permit':{'name':'식품의약품안전처_의약품 제품 허가정보','short':'의약품 제품 허가정보','provider':'식품의약품안전처','portal':'공공데이터포털','page':'https://www.data.go.kr/data/15095677/openapi.do','operation':'의약품 제품 허가 상세정보'},
 'easy':{'name':'식품의약품안전처_의약품개요정보(e약은요)','short':'의약품개요정보(e약은요)','provider':'식품의약품안전처','portal':'공공데이터포털','page':'https://www.data.go.kr/data/15075057/openapi.do','operation':'의약품개요정보 조회'},
 'paper':{'name':'PubMed','short':'PubMed','provider':'미국 국립의학도서관(NLM)','portal':'','page':'https://pubmed.ncbi.nlm.nih.gov/'},
}
DUR_OPERATIONS={c:f'{c} 정보조회' for c in ['병용금기','특정연령대금기','임부금기','용량주의','투여기간주의','노인주의','효능군중복']}
def source_info(kind,feature=''):
 """Official source name, its 공공데이터포털 page and the operation a record came from ("병용금기 정보조회")."""
 info=SOURCES.get(kind)
 if not info:return {'name':'검색 문서','short':'검색 문서','provider':'','portal':'','page':'','operation':''}
 operation=DUR_OPERATIONS.get(feature.removeprefix('DUR_'),'') if kind=='dur' else info.get('operation','')
 return {**info,'operation':operation}

# APA 7 references of the DB's papers (tools/make_paper_refs.py, from the PubMed records saved at collection time).
_PAPER_REFS=None
def paper_reference(pmid):
 global _PAPER_REFS
 if _PAPER_REFS is None:
  try:
   from pathlib import Path
   _PAPER_REFS=json.loads(Path(__file__).with_name('paper_refs.json').read_text(encoding='utf-8')).get('refs',{})
  except FileNotFoundError:_PAPER_REFS={}
 return _PAPER_REFS.get(str(pmid or ''))

# Readable facts of each record's original record (tools/make_source_meta.py, from the team's public-data files and paper file).
_SOURCE_META=None
def source_meta(record_id):
 global _SOURCE_META
 if _SOURCE_META is None:
  try:
   import gzip
   from pathlib import Path
   with gzip.open(Path(__file__).with_name('source_meta.json.gz'),'rt',encoding='utf-8') as h:_SOURCE_META=json.load(h).get('records',{})
  except FileNotFoundError:_SOURCE_META={}
 return _SOURCE_META.get(record_id)

def _day(v):
 v=str(v or '').strip()
 return f'{v[:4]}-{v[4:6]}-{v[6:8]}' if re.fullmatch(r'\d{8}',v) else v

def origin(record_ids):
 """Rows (label, value, link) that say where a record came from, in words: file and row, dates, codes, product, company.
 The DB's internal ids stay available separately. Several ids mean records with the same text merged into one chunk."""
 ids=[x for x in str(record_ids or '').split('|') if x]
 m=source_meta(ids[0]) if ids else None
 if not m:return None
 rows=[]
 add=lambda label,value,url='':rows.append([label,value,url]) if value else None
 k=m.get('k')
 if k=='dur':
  add('원자료',f"DUR 성분정보 {m['category']} 파일, {m['row']}번째 행" if m.get('row') else '')
  add('고시일자',_day(m.get('date')))
  for code,name in m.get('codes',[]):add('성분코드',f'{code} {name}'.strip())
  add('상태','정상 (삭제되지 않은 기록)' if m.get('status')=='정상' else m.get('status',''))
 elif k=='permit':
  add('제품',' · '.join(x for x in [m.get('item'),m.get('company'),m.get('category')] if x))
  add('품목기준코드',m.get('item_seq'))
  add('허가일',_day(m.get('permit_date')));add('최근 변경',_day(m.get('change_date')))
  ings=m.get('ingredients',[]) # long herbal combinations: the first three, then a count
  for x in ings[:3]:add('주성분',x)
  if len(ings)>3:add('주성분',f'외 {len(ings)-3}개 성분')
  add('ATC 코드',m.get('atc'));add('분류',m.get('class'))
  i,n=(m.get('chunk') or ['',''])[:2]
  add('문서',f"{m.get('section')}, {n}개 조각 중 {i}번째" if n and n!='1' else m.get('section',''))
  g=m.get('group_count')
  if g and g.isdigit():add('대표 제품',f'같은 주성분 조합 제품 {g}개 중 가장 먼저 허가된 제품' if int(g)>1 else '같은 주성분 조합의 유일한 제품')
 elif k=='easy':
  add('제품',' · '.join(x for x in [m.get('item'),m.get('company')] if x))
  add('품목기준코드',m.get('item_seq'))
  add('공개일',_day(m.get('open_date')));add('수정일',_day(m.get('update_date')))
  add('담긴 항목',', '.join(m.get('sections',[])))
 elif k=='paper':
  add('PMID',m.get('pmid'),f"https://pubmed.ncbi.nlm.nih.gov/{m['pmid']}/" if m.get('pmid') else '')
  add('DOI',m.get('doi'),f"https://doi.org/{m['doi']}" if m.get('doi') else '')
  add('PMC',m.get('pmcid'),f"https://pmc.ncbi.nlm.nih.gov/articles/{m['pmcid']}/" if m.get('pmcid') else '')
  add('출판 형태',', '.join(m.get('pub_types',[])))
  add('PubMed에서 받은 날',m.get('retrieved'))
 if len(ids)>1:add('같은 본문 기록',f'{len(ids)}건 (본문이 같아 하나로 합쳐 넣음)')
 return {'rows':rows,'ids':ids}

def describe_source(source,content):
 kind=source.get('source','')
 feature=source.get('feature','')
 info=source_info(kind,feature);label=info['name']
 category=feature.removeprefix('DUR_') if kind=='dur' else {'PERMIT_EFFICACY':'효능·효과','PERMIT_ADMINISTRATION':'용법·용량','PERMIT_PRECAUTION':'사용상의 주의사항'}.get(feature,'')
 if kind=='dur':
  names=drug_names(content)
  name=' · '.join(a for a,b in names)
  if not category:
   m=re.match(r'\[([^\]]+)\]',content);category=m.group(1) if m else '안전사용 정보'
  title=' — '.join(x for x in [name,category] if x)
 elif source.get('item_name'):
  title=' — '.join(x for x in [source['item_name'],category] if x)
 else:
  # A paper's first line is its title; other sources fall back to a short actual excerpt.
  title=content.strip().split('\n')[0][:180].strip() if content.strip() else label
 out={'title':title or label,'source_label':label,'source_short':info['short'],'source_operation':info['operation'],'source_page':info['page'],'source_provider':info['provider'],'record_id':source.get('record_ids',''),'category':category}
 if kind=='paper':
  ref=paper_reference(source.get('pmid'))
  if ref:out['citation']=ref
 o=origin(source.get('record_ids'))
 if o:out['origin']=o
 return out

# What may follow a drug name in a salt or hydrate entity name, after compact(): "클로피도그렐황산수소염", "clopidogrelbisulfate".
# Same rule as the web UI (src/medications.js); words that merely end in 염 ("…피부염") do not qualify.
SALT_KO=re.compile(r'(?:[가-힣]{1,6}(?:산|산수소)염|[가-힣]{1,6}실레이트|나트륨|칼륨|칼슘|마그네슘)?(?:(?:일|이|삼|반)?수화물)?')
SALT_EN=re.compile(r'(?:hydrochloride|hcl|sulfate|bisulfate|hydrogensulfate|besylate|besilate|maleate|mesylate|mesilate|tartrate|citrate|fumarate|succinate|sodium|potassium|calcium|magnesium)?(?:monohydrate|dihydrate|trihydrate|hydrate)?')

# A drug's own basic records (see MedicationIndex.drug_basics): an approval 효능·효과 record is cut to its first part.
BASIC_EFFICACY_CHARS=600

def ingredient_names(text):
 """Korean and English active-ingredient names from an approval record's header ("주성분: 심바스타틴 20 밀리그램 | …
 주성분 영문명: Simvastatin"), or [] for a combination product (several ingredients) or a record without them."""
 head=text[:600]
 ko=re.search(r'주성분:\s*([^|\]]+)',head);en=re.search(r'주성분 영문명:\s*([^|\]]+)',head)
 if not ko or ';' in ko.group(1) or (en and '/' in en.group(1)):return []
 name=re.match(r'[^\d]+',ko.group(1).strip())
 return [n for n in [name.group(0).strip() if name else '',en.group(1).strip() if en else ''] if n]

def names_drug(full,bare,aliases):
 """An entity name (compact form, and compact form without parentheticals) stands for a drug when it is one of the drug's
 aliases or a salt/hydrate form of one. "와파린장기복용환자" or "심바스타틴40mg" do not count."""
 if full in aliases or bare in aliases:return True
 for a in aliases:
  if full.startswith(a) and len(full)>len(a):
   rest=full[len(a):]
   if SALT_KO.fullmatch(rest) or SALT_EN.fullmatch(rest):return True
 return False

class MedicationIndex:
 def __init__(self,chunks,sources,graph=None):
  """graph (optional): {'v_data','v_inci','e_data'} of the hypergraph, used to add hyperedges that join two asked drugs."""
  self.chunks=chunks
  self.graph=graph
  self.entity_names={v:(compact(v),compact(re.sub(r'\([^)]*\)','',str(v)))) for v in (graph or {}).get('v_data',{})}
  self.normalized={cid:compact(d['content']) for cid,d in chunks.items()}
  self.aliases={}
  for cid,s in sources.items():
   if s.get('source')=='dur':
    for ko,en in drug_names(chunks.get(cid,{}).get('content','')):
     aliases=tuple(dict.fromkeys([compact(ko),compact(en)]))
     for alias in aliases:
      if len(alias)>=2:self.aliases.setdefault(alias,set()).update(aliases)
   elif s.get('item_name'):
    alias=compact(s['item_name'])
    if len(alias)>=3:self.aliases.setdefault(alias,set()).add(alias)
  # Each drug's own basic records for drug_basics(): the DUR 효능군중복 record of the single ingredient (효능군, 계열명) and
  # the 효능·효과 of single-ingredient approved products, earliest approved (lowest item_seq) first.
  self.group_records=[];self.efficacy_records=[]
  for cid,s in sources.items():
   text=chunks.get(cid,{}).get('content','')
   if s.get('feature')=='DUR_효능군중복' and '(단일제)' in text[:160]:
    names=drug_names(text)
    if names:self.group_records.append(({compact(n) for n in names[0]},cid))
   elif s.get('feature')=='PERMIT_EFFICACY':
    names=ingredient_names(text)
    if names:self.efficacy_records.append(({compact(n) for n in names},s.get('item_seq') or '',cid))
  self.efficacy_records.sort(key=lambda r:(r[1],r[2]))
 def drug_basics(self,targets):
  """For each asked drug, at most one 효능군 record and one 효능·효과 record of that drug alone, so the answer can describe
  what the drug is from its own records rather than from interaction records that happen to mention it."""
  out=[]
  for group in targets:
   aliases=set(group);name=next((a for a in group if not a.isascii()),group[0])
   match=lambda keys:any(names_drug(k,k,aliases) for k in keys)
   found=[('효능군',next((cid for keys,cid in self.group_records if match(keys)),None)),('효능·효과',next((cid for keys,_,cid in self.efficacy_records if match(keys)),None))]
   for kind,cid in found:
    if not cid:continue
    text=self.chunks[cid]['content']
    if kind=='효능·효과' and len(text)>BASIC_EFFICACY_CHARS:text=text[:BASIC_EFFICACY_CHARS].rstrip()+'…'
    out.append({'id':cid,'content':text,'drug':name,'basic_kind':kind})
  return out
 def targets(self,question):
  q=compact(question);matches=[]
  for alias,group in self.aliases.items():
   if alias not in q:continue
   if alias.isascii() and not re.search(r'(?<![a-z0-9])'+re.escape(alias)+r'(?![a-z0-9])',unicodedata.normalize('NFKC',question).casefold()):continue
   matches.append((alias,group))
  # Prefer a complete drug name over a shorter name embedded within it.
  kept=[(a,g) for a,g in matches if not any(a!=b and a in b for b,_ in matches)]
  return [sorted(g) for i,(a,g) in enumerate(kept) if not any(g==h for _,h in kept[:i])]
 def pair_edges(self,targets,limit=20):
  """Hyperedges in the whole DB that contain entities of two or more asked drugs (any spelling). The engine ranks hyperedges
  by member count and cuts at the relation token budget, so short DUR rule edges such as (심바스타틴, 클래리트로마이신) are
  usually dropped; these are looked up directly instead. More drugs first, then fewer members."""
  if not self.graph or len(targets)<2:return []
  inci=self.graph.get('v_inci',{});found={}
  for i,group in enumerate(targets):
   aliases=set(group)
   for v,(full,bare) in self.entity_names.items():
    if names_drug(full,bare,aliases):
     for e in inci.get(v,()):found.setdefault(e,set()).add(i)
  joined=[(e,hit) for e,hit in found.items() if len(hit)>=2]
  joined.sort(key=lambda x:(-len(x[1]),len(x[0]),str(x[0])))
  return [e for e,_ in joined[:limit]]
 def refine(self,question,result,limit=30):
  targets=self.targets(question)
  if not targets:return result
  def score(text):
   text=compact(text)
   return sum(any(alias in text for alias in group) for group in targets)
  hits=[(score(text),cid) for cid,text in self.normalized.items() if score(text)]
  hits.sort(key=lambda x:-x[0])
  # Match original candidates where possible, then add direct mentions missed by vectors.
  candidate_order={compact(d.get('content','')):i for i,d in enumerate(result.get('text_units',[]))}
  hits.sort(key=lambda x:(-x[0],candidate_order.get(self.normalized[x[1]],100000)))
  docs=[];budget=0
  for _,cid in hits:
   content=self.chunks[cid]['content']
   if docs and budget+len(content)>18000:continue
   docs.append({'id':cid,'content':content});budget+=len(content)
   if len(docs)>=limit:break
  edges=[e for e in result.get('hyperedges',[]) if score(json.dumps(e,ensure_ascii=False))]
  member_set=lambda e:(lambda ids:ids.split('|#|') if isinstance(ids,str) else list(ids))(e.get('entity_set',e.get('id_set',[])))
  # Hyperedges joining the asked drugs, straight from the DB, ahead of the engine's edges (same fields as the engine's JSON).
  have={tuple(sorted(member_set(e))) for e in edges};pairs=[]
  for k in self.pair_edges(targets):
   if tuple(sorted(k)) in have:continue
   d=self.graph['e_data'][k]
   pairs.append({'id':f'pair-{len(pairs)}','entity_set':list(k),'description':d.get('description',''),'keywords':d.get('keywords',''),'weight':d.get('weight',0),'rank':len(k),'added_by':'question-drug-pair'})
  edges=pairs+edges
  members=set()
  for e in edges:members.update(member_set(e))
  entities=[e for e in result.get('entities',[]) if e.get('entity_name',e.get('name')) in members or score(e.get('entity_name',e.get('name','')))]
  known={e.get('entity_name',e.get('name')) for e in entities}
  for e in pairs:
   for v in e['entity_set']:
    if v not in known and v in self.graph['v_data']:
     d=self.graph['v_data'][v];known.add(v)
     entities.append({'id':f'pair-entity-{len(known)}','entity_name':v,'entity_type':d.get('entity_type','UNKNOWN'),'description':d.get('description','UNKNOWN'),'additional_properties':d.get('additional_properties','UNKNOWN'),'rank':len(self.graph.get('v_inci',{}).get(v,()))})
  # Each asked drug's own basic records travel beside the documents (outside their 30-document / 18,000-character budget,
  # which records naming several asked drugs fill first).
  basics=self.drug_basics(targets)
  refined={**result,'text_units':docs,'entities':entities,'hyperedges':edges,'drug_basics':basics,'retrieval':{'strategy':'exact-medication-anchor','matched_aliases':targets,'direct_documents':len(hits),'returned_documents':len(docs),'excluded_candidate_documents':sum(not score(d.get('content','')) for d in result.get('text_units',[])),'added_pair_hyperedges':len(pairs),'drug_basics':len(basics)}}
  # Do not leave unrelated vector context in the prompt after filtering its visible sources.
  refined['context']=json.dumps({'entities':entities,'hyperedges':edges,'text_units':docs},ensure_ascii=False)
  return refined

def split_ids(value):
 if isinstance(value,(list,tuple,set)):return list(dict.fromkeys(str(x) for x in value if x))
 return list(dict.fromkeys(x.strip() for x in str(value or '').split('<SEP>') if x.strip()))

def source_document(cid,chunks,sources,excerpt_only=False,members=()):
 chunk=chunks.get(cid)
 if not chunk:return None
 content=chunk.get('content','');source=sources.get(cid,{})
 doc={'id':cid,**describe_source(source,content),'source_kind':source.get('source',''),'feature':source.get('feature',''),'pmid':source.get('pmid','')}
 if source.get('pmid','').isdigit():doc['source_url']='https://pubmed.ncbi.nlm.nih.gov/'+source['pmid']+'/'
 # The excerpt is a literal slice, never a generated paraphrase.
 positions=[content.casefold().find(str(m).casefold()) for m in members if str(m).strip()]
 positions=[p for p in positions if p>=0]
 start=max(0,min(positions)-100) if positions else 0
 doc.update(excerpt=content[start:start+750],excerpt_start=start,excerpt_end=min(len(content),start+750),content_length=len(content))
 doc['member_evidence']=[]
 for member in members:
  # Literal case-insensitive match with optional whitespace; preserve original offsets.
  chars=''.join(str(member).split())
  if not chars:continue
  match=re.search(r'\s*'.join(re.escape(c) for c in chars),content,re.IGNORECASE)
  if not match:continue
  left=max(0,match.start()-90);right=min(len(content),match.end()+150)
  doc['member_evidence'].append({'member':str(member),'excerpt':content[left:right],'start':left,'end':right,'match_start':match.start(),'match_end':match.end()})
 doc['matched_members']=[m['member'] for m in doc['member_evidence']]
 if not excerpt_only:doc['content']=content
 return doc

def attach_provenance(edge,stored,chunks,sources,database):
 members=edge.get('entity_set',edge.get('id_set',[]))
 if isinstance(members,str):members=members.split('|#|')
 ids=split_ids((stored or {}).get('source_id'))
 documents=[];missing=[]
 for cid in ids:
  doc=source_document(cid,chunks,sources,excerpt_only=True,members=members)
  if doc:documents.append(doc)
  else:missing.append(cid)
 tags=list(dict.fromkeys(x.strip() for x in re.split(r'<SEP>|[,，;；\n]',str(edge.get('keywords',''))) if x.strip()))
 provenance={'method':'indexed-extraction','database':database,'source_count':len(ids),'resolved_count':len(documents),'missing_ids':missing,'status':'linked' if documents and not missing else 'partial' if documents else 'unresolved'}
 return {**edge,'source_spans':[{k:d[k] for k in ['id','excerpt','excerpt_start','excerpt_end','matched_members','member_evidence']} for d in documents],'source_ids':ids,'source_document_ids':[d['id'] for d in documents],'tags':tags,'provenance':provenance},documents
