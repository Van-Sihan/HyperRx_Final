"""노드 사전 (2026-11-09): an entity's DB description, sentence by sentence, each with the records it most likely came from.

The DB (Hyper-RAG extraction with gpt-4o-mini, merged summaries) keeps one description per entity and the ids of the chunks
it was drawn from, but not which sentence came from which chunk. Each description sentence is therefore matched here to the
sentences of the records that name the entity.
 - anchors: what makes the sentence specific: other drugs, effects and conditions named in it (entity names of the DB),
   doses ("200 mg") and abbreviations ("CYP3A4", "AUC"). An anchor found in most record sentences is too common to tell
   them apart and is dropped. A sentence with no anchor left ("… 매우 신중하게 사용해야 한다.") gets no record.
 - cover: the share of the sentence's character pairs (bigrams; words for an English sentence) that a record sentence
   also holds, each weighted by how rare it is among the record sentences (the entity's own name weighs almost nothing);
 - fit: the same share the other way round, so a long passage that holds a little of everything does not win over the
   short sentence that says the same thing.
A record sentence must hold an anchor of the sentence and cover enough of it. A second or third record is added only when it
holds an anchor the earlier ones did not.

This is a lookup aid shown as such in the panel: the description is never rewritten, and the marks are literal record
sentences. Read-only, no OpenAI call.
"""
import re,math,unicodedata
from functools import lru_cache
from evidence import compact,split_ids,describe_source

MIN_COVER=0.2     # the first record sentence must hold this share of the sentence (weighted bigrams)
MIN_ANCHOR=0.25   # ... and this share of its anchors (weighted)
MORE_ANCHOR=0.15  # a further record must add this share of anchors the earlier ones did not hold
MAX_SOURCES=3
MAX_RECORDS=800   # records searched per lookup
COMMON=0.3        # an anchor in more than this share of the record sentences is dropped
KIND_ORDER={'dur':0,'permit':1,'easy':2,'paper':3}
ANCHOR_TYPES={'ACTIVE_INGREDIENT','DRUG_PRODUCT','ADVERSE_EVENT','DISEASE_OR_CONDITION','DRUG_CLASS','PATIENT_GROUP'}
# Entity names the extraction gave to plain words ("특히", "경우", "이 약물"); they say nothing about which record a sentence is from.
GENERIC={'단일제','복합제','정제','캡슐','과립','액제','시럽','산제','액상','제형','제제','성분','약물','약','이약물','이약','다른약물','약물들',
         '부작용','이상반응','약물이상반응','병용','금기','병용금기','병용사용','상호작용','약물상호작용','치료','효과','약효','위험','주의',
         '환자','환자들','성인','소아','노인','남성','사용','투여','용량','농도','혈중농도','증상','질환','영향','경우','특히','저하','연장','중증',
         '위험성','건강','심장','신장','위장','부족','악화','손상','드문부작용','심각한부작용','drug','drugs','patient','patients'}
# A name of two syllables counts only as a word of its own ("무좀 치료", "무좀에"), not inside another word ("반하여").
PARTICLE='은는이가을를에의와과도로만으'
PARA=re.compile(r'<SEP>|\n\s*\n')
# A sentence ends at . ! ? before a space, or before Hangul with no space ("복용하지 마십시오.이 약을"), or at a line break.
SENT=re.compile(r'(?<=[.!?])\s+|(?<=[가-힣]\.)(?=[가-힣\[(])|\n+')
WORD=re.compile(r'[a-z][a-z0-9-]{2,}')
STOP={'the','and','for','with','that','this','are','was','were','from','used','use','when','its','which','has','have','been','into','not','can','may','also','such','other','than','their'}
DOSE=re.compile(r'\d+(?:\.\d+)?(?:mg|밀리그램|mcg|μg|ml|%|배)|\d+세(?:미만|이상|이하)?')
NO_ANCHOR_COVER=0.45  # a sentence with no anchor is linked only to a record sentence that holds this much of it
NO_ANCHOR_FIT=0.1
ACRO=re.compile(r'(?<![A-Za-z])(?:[A-Z][A-Za-z0-9]*[A-Z0-9][A-Za-z0-9]*|[A-Z]-[a-z]{1,4})(?![A-Za-z])')

def letters(text):
 return re.sub(r'[^0-9a-z가-힣]','',compact(text))
def is_korean(text):
 t=letters(text)
 return bool(t) and len(re.findall(r'[가-힣]',t))>=len(t)*0.3
def grams(text,mode):
 if mode=='en':return {w for w in WORD.findall(str(text).casefold()) if w not in STOP}
 s=letters(text)
 return {s[i:i+2] for i in range(len(s)-1)}
def sentences(text):
 return [s.strip() for s in SENT.split(str(text or '')) if len(s.strip())>=6]
def idf(n,df):
 return math.log((n+1)/(df+0.5))
def compact_spaced(text):
 return unicodedata.normalize('NFKC',str(text)).casefold()
def names_in(text,own):
 """The entity is named in a record sentence as a word of its own: "로바스타틴" is not in "아트로바스타틴"."""
 low=compact_spaced(text)
 return any(re.search(r'(?<![가-힣a-z])'+r'\s*'.join(map(re.escape,o)),low) for o in own)

class EntityNotes:
 def __init__(self,chunks,sources,graph,medications):
  """graph: {'v_data','v_inci','e_data'} of the hypergraph; medications: evidence.MedicationIndex (compact texts, aliases)."""
  self.chunks=chunks;self.sources=sources;self.v_data=graph.get('v_data',{});self.med=medications
  # The terms (compacted) with the name and type to show: 'ACTIVE_INGREDIENT', 'ADVERSE_EVENT', … (the panel sorts them).
  self.term_info={};inci=graph.get('v_inci',{})
  for name,d in self.v_data.items():
   # A name the extraction used once and never put in a relation is mostly a stray phrase, not a term.
   if d.get('entity_type') not in ANCHOR_TYPES or len(split_ids(d.get('source_id')))<2 or not inci.get(name):continue
   for x in (str(name),re.sub(r'\([^)]*\)','',str(name)).strip()):
    c=compact(x)
    if len(c)>=2 and c not in GENERIC and not re.fullmatch(r'[\d.,%]+',c) and (re.search(r'[가-힣]',c) or len(c)>=4):self.term_info.setdefault(c,(x,d.get('entity_type')))
  self.vocab=sorted(self.term_info,key=len,reverse=True)
  self.describe=lru_cache(maxsize=256)(self._describe)

 def names_of(self,names):
  """The entity names and their spellings (DUR aliases: 이트라코나졸 ⇄ itraconazole), compacted, two letters or more."""
  out=set()
  for n in names:
   for x in (str(n),re.sub(r'\([^)]*\)','',str(n))):
    c=compact(x)
    if len(c)>=2:out.add(c);out.update(self.med.aliases.get(c,()))
  return {x for x in out if len(x)>=2}

 def terms(self,sentence,own):
  """Other entity names in the sentence, in the order they stand. The longest is taken first; a name inside a longer one
  counts only where it also stands apart ("에스암로디핀, 암로디핀" holds both, "아토르바스타틴" does not hold "스타틴")."""
  c=compact(sentence);low=compact_spaced(sentence);left=c;found=[]
  for v in self.vocab:
   if v not in left or any(o in v or v in o for o in own):continue
   if len(v)<=2 and not re.search(rf'(?<![가-힣]){re.escape(v)}(?=[{PARTICLE}]|[^가-힣]|$)',low):continue
   found.append((left.find(v),v));left=left.replace(v,'\0'*len(v))
  return [v for _,v in sorted(found)]

 def anchors(self,sentence,own):
  """Other entity names in the sentence, doses and abbreviations."""
  c=compact(sentence);found=self.terms(sentence,own)
  found+=[d for d in DOSE.findall(c) if not any(d in f for f in found)]
  found+=[compact(a) for a in ACRO.findall(sentence) if len(a)>=2 and not any(compact(a) in f for f in found) and not any(compact(a) in o for o in own)]
  return list(dict.fromkeys(found))

 def units(self,names,own):
  """Record sentences that name the entity, alone and with the sentence after (an effect often follows the name)."""
  ids=[]
  for n in names:ids+=split_ids(self.v_data.get(n,{}).get('source_id'))
  ids+=[cid for cid,text in self.med.normalized.items() if any(o in text for o in own)]
  # The entity's own source records first; a hub entity ("단일제") is capped so a lookup stays quick.
  ids=list(dict.fromkeys(c for c in ids if c in self.chunks))[:MAX_RECORDS]
  out=[]
  for cid in sorted(ids,key=lambda c:(KIND_ORDER.get(self.sources.get(c,{}).get('source'),9),c)):
   content=self.chunks[cid].get('content','');sents=sentences(content)
   # A DUR record is one rule told over a few sentences (the drug, then the age, grade or reason): it is one unit, and
   # its marks are the sentences that hold what matched.
   if self.sources.get(cid,{}).get('source')=='dur':
    if names_in(content,own):out.append({'id':cid,'marks':None,'sents':sents,'c':compact(content),'g':{m:grams(content,m) for m in ('ko','en')}})
    continue
   for i,s in enumerate(sents):
    if not names_in(s,own):continue
    # A sentence with the next is one mark, so the source view marks the two together where they stand (a short
    # line such as "10 mg, 단회 투여" may stand earlier in the record too).
    for parts in ([s],[s,sents[i+1]] if i+1<len(sents) else None):
     if parts:out.append({'id':cid,'marks':[' '.join(parts)],'c':compact(' '.join(parts)),'g':{m:set().union(*(grams(x,m) for x in parts)) for m in ('ko','en')}})
  return out

 def match(self,sentence,units,w,weight,own):
  n=len(units)
  if not n:return []
  mode='ko' if is_korean(sentence) else 'en'
  g=grams(sentence,mode);gw=w[mode];total=sum(gw.get(x,0) for x in g)
  df={a:sum(a in u['c'] for u in units) for a in self.anchors(sentence,own)}
  aw={a:idf(n,k) for a,k in df.items() if k and (n<10 or k/n<=COMMON)}
  if not g or total<=0:return []
  if not aw:
   # No anchor: only a record sentence that says most of the same thing ("… 치료 기간 중 언제든지 발생할 수 있다").
   best=None
   for i,u in enumerate(units):
    ug=u['g'][mode];hit=sum(gw[x] for x in g&ug);cover=hit/total;fit=hit/weight[mode][i] if weight[mode][i] else 0
    if cover>=NO_ANCHOR_COVER and fit>=NO_ANCHOR_FIT and (best is None or cover**0.75*fit**0.25>best[0]):best=(cover**0.75*fit**0.25,u,cover)
   return [{'id':best[1]['id'],'marks':best[1]['marks'] or best[1]['sents'][:1],'cover':round(best[2],3),'anchors':[]}] if best else []
  atotal=sum(aw.values());left=set(g);held=set();picked=[]
  while len(picked)<MAX_SOURCES:
   best=None
   for i,u in enumerate(units):
    if any(p['id']==u['id'] for p in picked):continue
    has={a for a in aw if a in u['c']}
    new=sum(aw[a] for a in has-held)/atotal
    if not new:continue
    ug=u['g'][mode]
    cover=sum(gw[x] for x in left&ug)/total
    fit=sum(gw[x] for x in g&ug)/weight[mode][i] if weight[mode][i] else 0
    share=sum(aw[a] for a in has)/atotal
    score=cover**0.5*fit**0.2*share**0.3
    if best is None or score>best[0]:best=(score,u,cover,share,new,has)
   if not best:break
   _,u,cover,share,new,has=best
   if (cover<MIN_COVER or share<MIN_ANCHOR) if not picked else new<MORE_ANCHOR:break
   marks=u['marks'] or [s for s in u['sents'] if any(a in compact(s) for a in has)] or u['sents'][:1]
   picked.append({'id':u['id'],'marks':marks,'cover':round(cover,3),'anchors':sorted(has)});left-=u['g'][mode];held|=has
  return picked

 def _describe(self,names):
  names=tuple(n for n in names if n in self.v_data)
  if not names:return None
  own=self.names_of(names);units=self.units(names,own)
  w,weight={},{}
  for m in ('ko','en'):
   df={}
   for u in units:
    for x in u['g'][m]:df[x]=df.get(x,0)+1
   w[m]={x:idf(len(units),k) for x,k in df.items()}
   weight[m]=[sum(w[m][x] for x in u['g'][m]) for u in units]
  paragraphs=[];seen=set()
  for name in names:
   for part in PARA.split(str(self.v_data[name].get('description',''))):
    part=part.strip()
    if not part or part in seen:continue
    seen.add(part)
    # Each sentence with its records and the terms it names (for the panel's 한눈에 보기 and its topics).
    sents=[{'text':s,'sources':self.match(s,units,w,weight,own),'terms':[{'name':self.term_info[v][0],'type':self.term_info[v][1]} for v in self.terms(s,own)]}
           for s in sentences(part)] or [{'text':part,'sources':[],'terms':[]}]
    paragraphs.append({'entity':name,'lang':'ko' if is_korean(part) else 'en','sentences':sents})
  docs={}
  for p in paragraphs:
   for s in p['sentences']:
    for x in s['sources']:
     if x['id'] not in docs:
      d=describe_source(self.sources.get(x['id'],{}),self.chunks.get(x['id'],{}).get('content',''))
      docs[x['id']]={'id':x['id'],'source_kind':self.sources.get(x['id'],{}).get('source',''),**{k:d.get(k,'') for k in ['title','source_label','source_short','category']}}
  return {'names':list(names),'type':self.v_data[names[0]].get('entity_type',''),'paragraphs':paragraphs,'documents':list(docs.values()),
          'method':'anchor-bigram','record_sentences':len(units)}
