"""Rule-based summary for the evidence dashboard, read only from the local corpus. No LLM, no network.

For the drugs named in a question it returns
- whether each pair is listed in DUR 병용금기 and the listed reason (the regulator's own wording),
- the other DUR categories of each drug (임부금기, 노인주의, 용량주의, 투여기간주의, 특정연령대금기, 효능군중복),
- sentences in the drugs' own label texts (허가 사용상의 주의사항) that name the other drug, and metabolic sentences linked to them,
- how many stored papers name both drugs.
Every sentence is a literal slice of a stored chunk with its offsets, so the screen can quote it and open the source."""
import re,json,unicodedata
from itertools import combinations
from pathlib import Path
from evidence import compact,names_drug,SALT_KO,SALT_EN,source_info,paper_reference,DUR_OPERATIONS

def load_variants(path=Path(__file__).with_name('name_variants.json')):
 try:return json.loads(Path(path).read_text(encoding='utf-8')).get('groups',[])
 except FileNotFoundError:return []

# ---- DUR records ----
# Names may hold one level of parentheses: "요오드화나트륨(131I)(Sodium Iodide(131I))(단일제)".
NEST=r'(?:[^()]|\([^()]*\))'
PART=re.compile(rf'\s*(?P<ko>{NEST}+?)\((?P<en>{NEST}*)\)\((?P<form>단일제|복합제)(?:;\s*복합 구성 성분:\s*(?P<comp>.*))?\)\s*',re.S)
COMPONENT=re.compile(r'\[D\d+\]([^/]+?)\(((?:[^()]|\([^()]*\))*)\)(?=/\[D|$)')
PAIR=re.compile(r'\[병용금기\]\s*(?P<a>.+?)과\(와\)\s*(?P<b>.+?)은 함께 쓰지 않습니다\.(?:\s*금기·주의 내용:\s*(?P<reason>.*))?',re.S)
FLAG=re.compile(r'\[(?P<cat>[^\]]+)\]\s*대상 성분은\s*(?P<drug>.+?)입니다\.(?P<rest>.*)',re.S)
FIELDS={'dosage_form':r'제형은\s*(.+?)입니다\.','grade':r'임부 금기 등급:\s*([^.\s]+)','max_dose':r'최대 투여량:\s*(.+?)\.(?=\s|$)','max_days':r'최대 투여기간:\s*(.+?)\.(?=\s|$)','age':r'연령 기준:\s*(.+?)\.(?=\s|$)','group':r'효능군:\s*(.+?)\.(?=\s|$)','family':r'계열명:\s*(.+?)\.(?=\s|$)','detail':r'금기·주의 내용:\s*(.+)$','note':r'비고:\s*(.+)$'}
FLAG_ORDER=['임부금기','노인주의','용량주의','투여기간주의','특정연령대금기','효능군중복']

def parse_part(text):
 m=PART.fullmatch(text)
 if not m:return None
 components=[{'name':ko.strip(),'en':en.strip()} for en,ko in COMPONENT.findall((m.group('comp') or '').strip())]
 return {'name':m.group('ko').strip(),'en':m.group('en').strip(),'form':m.group('form'),'components':components}

def parse_pair(content):
 m=PAIR.fullmatch(content.strip())
 if not m:return None
 a,b=parse_part(m.group('a')),parse_part(m.group('b'))
 if not a or not b:return None
 return {'a':a,'b':b,'reason':(m.group('reason') or '').strip()}

def parse_flag(content):
 m=FLAG.fullmatch(content.strip())
 if not m:return None
 drug=parse_part(m.group('drug'))
 if not drug:return None
 rest=m.group('rest');fields={}
 for key,pattern in FIELDS.items():
  f=re.search(pattern,rest,re.S)
  if f:fields[key]=f.group(1).strip()
 if 'detail' in fields and 'note' in fields:fields['detail']=fields['detail'].split('비고:')[0].strip() or fields['detail']
 return {'category':m.group('cat').strip(),'drug':drug,**fields}

# ---- names in running text ----
# Korean has no spaces inside a word, so a Korean name counts only at the start of a word or right after a particle written
# without a space ("와파린과아스피린"). "항트롬빈" does not contain 트롬빈, "에스오메프라졸" does not contain 오메프라졸.
PARTICLES='과와및랑고나도는은을를에의'
def name_regex(names):
 parts=[]
 for name in sorted({n for n in names if n},key=len,reverse=True):
  if len(name)<(3 if name.isascii() else 2):continue
  body=r'\s*'.join(re.escape(c) for c in name)
  parts.append(rf'(?<![a-z0-9]){body}(?![a-z0-9])' if name.isascii() else rf'(?:(?<![가-힣])|(?<=[{PARTICLES}])){body}')
 return re.compile('|'.join(parts),re.I) if parts else None

# ---- label texts ----
# The header may hold a bracketed class code ("[02180]동맥경화용제") before the English names, so inner [..] pairs are allowed.
HEADER=re.compile(r'\[(?P<item>[^|\]]+)\|\s*주성분:\s*(?P<ko>[^|\]]*)(?P<rest>(?:[^\[\]]|\[[^\]]*\])*)\]')
LEAD=re.compile(r'\[(?:[^\[\]]|\[[^\]]*\])*\]\s*(?:(?:사용상의 주의사항|효능·?효과|용법·?용량)(?=\s))?')
# A numbered section title. Quoted or bracketed cross-references ("('2. … 말 것' 항 참조)") are not titles.
HEADING=re.compile(r'(?<![\d.(‘\'"“「])(\d{1,2})\.\s*(경고|다음 (?:환자|사람)에(?:는|게는) (?:투여하지|복용하지|사용하지) 말 것|다음 (?:환자|사람)에(?:는|게는) 신중히 (?:투여|복용|사용)할 것|이상반응|일반적 주의|상호작용|임부(?:,| 및) 수유부[^.\n’\'"”」]{0,12}|소아에 대한 투여|고령자에 대한 투여|과량투여시의 처치|적용상의 주의)(?![’\'"”」]|\s*(?:항\s*)?참조)')
ENZYME=re.compile(r'CYP\s?\d[A-Z]\d{0,2}|P-?gp|P-당단백(?:질)?|OATP\s?\d[A-Z]\d|BCRP|UGT\s?\d[A-Z]\d{0,2}',re.I)
MECHANISM=re.compile(r'대사|기질|저해제이다|억제제이다|유도제이다')
MODULATE=re.compile(r'억제|저해|유도|기질')
ACTION=re.compile(r'병용투여하지|병용하지|투여하지 말|금기|중지|중단|감량|용량|피해야|권장되지|주의|관찰|모니터링')
LIST_START=re.compile(r'\d{1,2}\)\s|\(\d{1,2}\)\s|[①-⑳○●]')
FOLLOW=re.compile(r'(?:만일|만약|따라서|그러므로|이러한 경우|이 경우)')
# Strongest statements first: a contraindication list outranks a warning, an interaction note, a careful-use note.
SECTION_RANK=['투여하지 말 것','복용하지 말 것','사용하지 말 것','경고','상호작용','신중히','일반적 주의']
def section_rank(section):return next((i for i,k in enumerate(SECTION_RANK) if k in section),len(SECTION_RANK))
enzymes_in=lambda text:{re.sub(r'[\s-]','',x).upper() for x in ENZYME.findall(text)}

# What may follow an ingredient name in a label header besides a salt: a dosage-form word ("아스피린장용펠렛", "aspirinentericpellet").
FORM_KO=re.compile(r'(?:장용)?(?:펠렛|과립|미분화|미세결정|분말)')
FORM_EN=re.compile(r'(?:enteric)?(?:coated)?(?:pellets?|granules?)|micronized')
def suffix_ok(rest):
 """A salt or hydrate ending, a dosage-form word, or both in that order ("칼슘삼수화물과립", "calciumtrihydrategranule")."""
 for k in range(len(rest)+1):
  head,tail=rest[:k],rest[k:]
  if (SALT_KO.fullmatch(head) or SALT_EN.fullmatch(head)) and (not tail or FORM_KO.fullmatch(tail) or FORM_EN.fullmatch(tail)):return True
 return False
# A diluted raw material is written around its drug's name: "희석된니트로글리세린(니트로글리세린2%유당)", "dilutenitroglycerinsolution".
DILUTED=re.compile(r'(?:희석(?:된|한)?|묽은|diluted?)(?P<drug>[^(]+?)(?:용액|solution)?(?:\(.*)?')
def undiluted(name):
 m=DILUTED.fullmatch(name)
 return m.group('drug') if m else name
def is_ingredient(name,aliases):
 name=undiluted(name)
 if names_drug(name,name,aliases):return True
 return any(name.startswith(a) and len(name)>len(a) and suffix_ok(name[len(a):]) for a in aliases)

def ingredient_names(header):
 """Compact ingredient names from a label header: the Korean 주성분 field without amounts, and the English names."""
 names=set()
 for part in header.group('ko').split(';'):
  m=re.match(r'\s*([^\d;]+?)\s*(?:\d|밀리그램|마이크로그램|그램|밀리리터|$)',part)
  if m and compact(m.group(1)):names.add(compact(m.group(1)))
 en=re.search(r'주성분 영문명:\s*([^|\]]*)',header.group('rest'))
 if en:names.update(compact(x) for x in en.group(1).split('/') if compact(x))
 return names

def sentences(text):
 """Literal (start, end) spans. Splits at a period followed by space outside brackets (not after a digit or "예"), at line breaks,
 before list markers such as "4)", "(1)", "①" (one contraindication per span) and around section titles."""
 spans=[];start=0;depth=0;n=len(text);i=0
 lead=LEAD.match(text) # the label header and the section title are not sentences
 if lead:spans.append((0,lead.end()));start=i=lead.end()
 while i<n:
  c=text[i]
  h=HEADING.match(text,i) if depth==0 and (i==0 or text[i-1].isspace()) else None
  if h:
   if i>start:spans.append((start,i))
   spans.append((i,h.end()));start=i=h.end();continue
  if depth==0 and c.isspace() and i>start and LIST_START.match(text,i+1):
   spans.append((start,i));start=i+1
  elif c in '([':depth+=1
  elif c in ')]':depth=max(0,depth-1)
  elif depth==0 and c=='\n':
   spans.append((start,i));start=i+1
  elif depth==0 and c=='.' and (i+1==n or text[i+1].isspace()) and i>0 and not text[i-1].isdigit() and text[i-1]!='예':
   spans.append((start,i+1));start=i+1
  i+=1
 spans.append((start,n))
 out=[]
 for s,e in spans:
  while s<e and text[s].isspace():s+=1
  while e>s and text[e-1].isspace():e-=1
  if e-s>=2:out.append((s,e))
 return out

def section_of(text,pos):
 """The last section title before pos that stands outside brackets (same rule as sentences())."""
 last=None;depth=0;j=0
 for m in HEADING.finditer(text,0,pos):
  for c in text[j:m.start()]:
   if c in '([':depth+=1
   elif c in ')]':depth=max(0,depth-1)
  j=m.start()
  if depth==0 and (m.start()==0 or text[m.start()-1].isspace()):last=m
 return f'{last.group(1)}. {last.group(2).strip()}' if last else ''

def linked_enzymes(sentence,hits):
 """Enzymes the sentence ties to the other drug: the drug sits in the bracket of an enzyme phrase ("강력한 CYP3A4 억제제(예, …
 클라리트로마이신 …)"), or the sentence says so of the drug itself ("클래리트로마이신은 CYP3A4 저해제이다"). A drug merely listed next
 to an enzyme ("아스피린, CYP2C19 유도제 …") does not count."""
 out=set()
 for hs,he in hits:
  depth=0;opening=None
  for k in range(hs-1,-1,-1):
   c=sentence[k]
   if c in ')]':depth+=1
   elif c in '([':
    if depth==0:opening=k;break
    depth-=1
  if opening is not None:
   lead=sentence[max(0,opening-90):opening]
   if MODULATE.search(lead):out|=enzymes_in(lead)
  tail=sentence[he:he+60]
  if re.match(r'\s*(?:은|는)\s',tail) and MODULATE.search(tail):out|=enzymes_in(tail)
 return out

class ClinicalIndex:
 def __init__(self,chunks,sources,medications,variants=None):
  self.medications=medications;self.chunks=chunks
  self.variants=load_variants() if variants is None else variants
  self.pairs=[];self.flags=[];self.labels=[];self.papers=[];self.pmid={};self.display={}
  for cid,s in sources.items():
   content=chunks.get(cid,{}).get('content','')
   kind,feature=s.get('source'),s.get('feature','')
   if kind=='dur' and feature=='DUR_병용금기':
    p=parse_pair(content)
    if p:self.pairs.append({**p,'chunk_id':cid,'record_id':s.get('record_ids','')})
   elif kind=='dur':
    f=parse_flag(content)
    if f:self.flags.append({**f,'chunk_id':cid,'record_id':s.get('record_ids','')})
   elif kind=='permit':
    h=HEADER.match(content)
    if h:
     en=re.search(r'주성분 영문명:\s*([^|\]]*)',h.group('rest'))
     self.labels.append({'chunk_id':cid,'item':h.group('item').strip(),'feature':feature,'ingredients':ingredient_names(h),'parts':max(len(h.group('ko').split(';')),len(en.group(1).split('/')) if en else 1),'text':content})
   elif kind=='paper':self.papers.append(cid);self.pmid[cid]=s.get('pmid','')
  # Drug names: every DUR record side, single-agent or combination, so drugs that DUR lists only in combinations
  # (e.g. 니르마트렐비르) are still found. Korean and English names of one side are the same drug.
  self.group_of={};self.single=set()
  sides=[s for rec in self.pairs for s in (rec['a'],rec['b'])]+[f['drug'] for f in self.flags]
  for side in sides:
   names=[n for n in (compact(side['name']),compact(side['en'])) if n]
   for name,original in zip((compact(side['name']),compact(side['en'])),(side['name'],side['en'])):
    if name:self.display.setdefault(name,original)
   if side['form']=='단일제':self.single.update(names)
   self._join(names)
  for v in self.variants: # temporary spellings join their DUR drug
   canonical=compact(v.get('canonical',''))
   if canonical in self.group_of:self._join([canonical,*(compact(x) for x in v.get('spellings',[])),compact(v.get('en',''))])
  self.known=set(self.display)
 def _join(self,names):
  names=[n for n in names if n]
  if not names:return
  group=set(names)
  for n in names:group|=self.group_of.get(n,set())
  for n in group:self.group_of[n]=group

 # ---- names ----
 def targets(self,question):
  """Drug groups named in the question, in order of first appearance. A name inside a longer matched name is dropped only
  where it overlaps ("이소트레티노인" hides 트레티노인 there, but "트레티노인과 이소트레티노인" names both)."""
  q=unicodedata.normalize('NFKC',str(question)).casefold();flat=compact(q)
  candidates=[n for n in self.group_of if n in flat]
  pattern=name_regex(candidates)
  if not pattern:return []
  hits=[(m.start(),m.end(),compact(m.group(0))) for m in pattern.finditer(q)]
  kept=[h for h in hits if not any(o!=h and o[0]<=h[0] and h[1]<=o[1] and o[1]-o[0]>h[1]-h[0] for o in hits)]
  out=[]
  for _,_,name in sorted(kept):
   group=self.group_of.get(name)
   if group and group not in out:out.append(group)
  return out
 def name_of(self,group):
  dur=[n for n in group if n in self.display]
  korean=sorted([n for n in dur if not n.isascii()],key=len)
  return self.display[korean[0]] if korean else self.display.get(dur[0],dur[0]) if dur else sorted(group)[0]
 @staticmethod
 def matches(side,aliases):
  return compact(side['name']) in aliases or compact(side['en']) in aliases

 # ---- DUR ----
 def direct(self,side):
  """A record side applies to the drug itself when it is the single agent, or when DUR never lists that drug as a single agent
  (then its combination is the drug, as with 니르마트렐비르/리토나비르)."""
  return side['form']=='단일제' or not ({compact(side['name']),compact(side['en'])}&self.single)
 def pair_records(self,a,b):
  out=[]
  for rec in self.pairs:
   if self.matches(rec['a'],a) and self.matches(rec['b'],b):out.append((rec,False))
   elif self.matches(rec['a'],b) and self.matches(rec['b'],a):out.append((rec,True))
  combo=lambda side:'+'.join([side['name'],*(c['name'] for c in side['components'])])
  # 'combinations': the combination products in a record that are not the asked drug itself (니르마트렐비르+리토나비르 is the drug).
  records=[{'chunk_id':r['chunk_id'],'record_id':r['record_id'],'a':r['b'] if swap else r['a'],'b':r['a'] if swap else r['b'],'reason':r['reason'],'direct':self.direct(r['a']) and self.direct(r['b']),'combinations':[combo(x) for x in (r['a'],r['b']) if not self.direct(x)]} for r,swap in out]
  records.sort(key=lambda r:(not r['direct'],r['a']['form']!='단일제',r['b']['form']!='단일제'))
  direct=[r for r in records if r['direct']]
  # Reasons of the drugs themselves first; reasons only found in combination-product records are kept apart.
  reasons=list(dict.fromkeys(r['reason'] for r in (direct or records) if r['reason']))
  combo=[x for x in dict.fromkeys(r['reason'] for r in records if not r['direct'] and r['reason']) if x not in reasons] if direct else []
  return {'listed':bool(direct),'direct':len(direct),'records':records,'reasons':reasons,'combination_reasons':combo}
 def drug_flags(self,aliases):
  by={}
  for f in self.flags:
   if self.matches(f['drug'],aliases):by.setdefault(f['category'],[]).append(f)
  out=[]
  for cat in sorted(by,key=lambda c:FLAG_ORDER.index(c) if c in FLAG_ORDER else 99):
   recs=sorted(by[cat],key=lambda f:f['drug']['form']!='단일제')
   first=recs[0]
   out.append({'category':cat,'count':len(recs),'single':sum(r['drug']['form']=='단일제' for r in recs),**{k:first[k] for k in ['grade','max_dose','max_days','age','group','family','detail','note','dosage_form'] if k in first},'form':first['drug']['form'],'chunk_id':first['chunk_id'],'record_id':first['record_id']})
  return out

 # ---- labels ----
 def own_labels(self,aliases):
  return [l for l in self.labels if any(is_ingredient(n,aliases) for n in l['ingredients'])]
 def co_ingredients(self,label,owner_names):
  """Base names (DUR spelling) of a combination product's other ingredients: "클로피도그렐황산염" → "클로피도그렐"."""
  out=set()
  for n in label['ingredients']:
   if is_ingredient(n,owner_names):continue
   bases=[k for k in self.known if len(k)>=3 and n.startswith(k) and is_ingredient(n,{k})]
   out.add(max(bases,key=len) if bases else n)
  return out
 def mentions(self,owner,owner_labels,owner_names,other,other_names):
  """Sentences in the owner's labels that name the other drug. Two kinds of combination-product text are skipped:
  a product that contains both drugs (it names the other drug as its own ingredient), and a sentence that is about the
  product's other ingredient (it names that ingredient and not the owner drug), e.g. "와파린과 클로피도그렐을 병용투여시 …"
  in a clopidogrel+aspirin product is not about aspirin."""
  pattern=name_regex(other_names)
  if not pattern:return []
  found=[]
  for label in owner_labels:
   if any(is_ingredient(n,other_names) for n in label['ingredients']):continue
   co=self.co_ingredients(label,owner_names) if label['parts']>1 else set()
   text=label['text'];spans=None
   for m in pattern.finditer(text):
    spans=spans or sentences(text)
    k=next((k for k,(s,e) in enumerate(spans) if s<=m.start()<e),None)
    s,e=spans[k] if k is not None else (m.start(),m.end())
    # A following sentence that only continues the instruction ("만일 … 불가피하다면 …") is kept with it, still one literal slice.
    if k is not None and k+1<len(spans) and FOLLOW.match(text,spans[k+1][0]) and ACTION.search(text[spans[k+1][0]:spans[k+1][1]]) and spans[k+1][1]-s<=560:e=spans[k+1][1]
    if any(x['start']==s and x['chunk_id']==label['chunk_id'] for x in found):continue
    whole=text[s:e]
    if co:
     key=compact(whole)
     if any(b in key for b in co) and not any(o in key for o in owner_names):continue
    if e-s>560:
     ws=max(s,m.start()-160);we=min(e,ws+420)
    else:ws,we=s,e
    hits=[{'start':h.start()-ws,'end':h.end()-ws} for h in pattern.finditer(text,ws,we)]
    linked=linked_enzymes(whole,[(h.start()-s,h.end()-s) for h in pattern.finditer(text,s,e)])
    found.append({'chunk_id':label['chunk_id'],'item':label['item'],'section':section_of(text,s),'about':owner,'names':other,'text':text[ws:we],'start':ws,'end':we,'cut_start':ws>s,'cut_end':we<e,'hits':hits,'spelling':m.group(0),'action':bool(ACTION.search(whole)),'single':label['parts']==1,'enzymes':sorted(linked),'_key':compact(whole)})
  return found
 def mechanism(self,labels,enzymes,skip):
  """Metabolic sentences in the asked drugs' labels that name an enzyme or transporter tied to the other drug in a related
  sentence, and that are about the drug itself: they name it or say "이 약", and in a combination product they do not
  speak of the product's other ingredient instead ("이 약의 주성분인 아토르바스타틴은 …" is not about ezetimibe)."""
  if not enzymes:return []
  out=[]
  for label,owner,owner_names in labels:
   text=label['text'];owner_pattern=name_regex(owner_names)
   co=self.co_ingredients(label,owner_names) if label['parts']>1 else set()
   for s,e in sentences(text):
    sent=text[s:e];key=compact(sent)
    if key in skip or e-s>420 or not MECHANISM.search(sent):continue
    tokens=enzymes_in(sent)
    if not tokens&enzymes:continue
    names_owner=bool(owner_pattern and owner_pattern.search(sent))
    if not names_owner and '이 약' not in sent:continue
    if co and not names_owner and any(b in key for b in co):continue
    skip.add(key)
    out.append({'chunk_id':label['chunk_id'],'item':label['item'],'section':section_of(text,s),'about':owner,'text':sent,'start':s,'end':e,'enzymes':sorted(tokens&enzymes),'_own':names_owner,'_single':label['parts']==1})
  out.sort(key=lambda x:(not x['_own'],not x['_single']))
  for x in out:x.pop('_own');x.pop('_single')
  return out[:3]

 def summary(self,question,limit=6):
  found=self.targets(question);groups=found[:limit]
  drugs=[]
  for g in groups:
   aliases={n for n in g if n in self.display}
   labels=self.own_labels(g)
   drugs.append({'name':self.name_of(g),'aliases':sorted(aliases),'spellings':sorted(g),'known':True,'flags':self.drug_flags(aliases),'label_products':sorted({l['item'] for l in labels}),'_labels':labels})
  pairs=[]
  for i,j in combinations(range(len(drugs)),2):
   A,B=drugs[i],drugs[j]
   dur=self.pair_records(set(A['aliases']),set(B['aliases']))
   status='listed' if dur['listed'] else 'combination_only' if dur['records'] else 'not_listed'
   found_sentences=self.mentions(A['name'],A['_labels'],set(A['spellings']),B['name'],set(B['spellings']))+self.mentions(B['name'],B['_labels'],set(B['spellings']),A['name'],set(A['spellings']))
   # The same sentence often appears in many products' labels: show it once with the products that carry it.
   merged={}
   for x in found_sentences:
    k=x.pop('_key')
    if k in merged:merged[k]['products'].append(x['item'])
    else:merged[k]={**x,'products':[x['item']]}
   mentions=sorted(merged.values(),key=lambda x:(section_rank(x['section']),not x['single'],not x['action'],len(x['text'])))
   enzymes={t for x in mentions for t in x['enzymes']}
   both_in=lambda l:any(is_ingredient(n,set(A['spellings'])) for n in l['ingredients']) and any(is_ingredient(n,set(B['spellings'])) for n in l['ingredients'])
   labels=[(l,A['name'],set(A['spellings'])) for l in A['_labels'] if not both_in(l)]+[(l,B['name'],set(B['spellings'])) for l in B['_labels'] if not both_in(l)]
   mech=self.mechanism(labels,enzymes,set(merged))
   both=[cid for cid in self.papers if any(a in self.medications.normalized.get(cid,'') for a in A['spellings']) and any(b in self.medications.normalized.get(cid,'') for b in B['spellings'])]
   pairs.append({'a':i,'b':j,'status':status,'dur':dur,'label':{'mentions':mentions,'mechanism':mech,'searched':{A['name']:len(A['label_products']),B['name']:len(B['label_products'])}},'papers':{'count':len(both),'items':[{'chunk_id':c,'title':self.chunks[c]['content'].strip().split('\n')[0][:160],'citation':paper_reference(self.pmid.get(c))} for c in both[:5]]}})
  for d in drugs:d.pop('_labels')
  # Official names of the sources behind each card, so the screen never has to spell them itself.
  sources={'dur':source_info('dur'),'permit':source_info('permit','PERMIT_PRECAUTION'),'paper':source_info('paper'),'dur_operations':DUR_OPERATIONS}
  return {'drugs':drugs,'pairs':pairs,'limited':len(found)>limit,'sources':sources}
