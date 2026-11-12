"""Builds source_meta.json.gz: for every record in the team DB, the readable facts of its original record (file and row, dates,
codes, product, company) so the source window can show them instead of internal ids. No network call.

Inputs are the team's public-data files (team repository commit 6d157c2, folder 2026-10-28_공공데이터_RAG전처리/data) and the
paper file used for the DB (kdb inputs/raw/papers_DX2_239.jsonl). Only records that are in the DB's sources.csv are kept.

    python tools/make_source_meta.py --sources <kdb-work/sources.csv> --dur DUR.jsonl --permit 의약품허가정보_6질환_M코드최초허가_최초허가일.jsonl
        --easy e약은요_final.jsonl --papers papers_DX2_239.jsonl [--out source_meta.json.gz]"""
import argparse,csv,json,os,ast,gzip

def rows(path):
 with open(path,encoding='utf-8') as h:
  for line in h:
   if line.strip():yield json.loads(line)

def as_list(v):
 if isinstance(v,list):return v
 try:
  x=ast.literal_eval(v) if isinstance(v,str) and v.startswith('[') else v
  return x if isinstance(x,list) else ([x] if x else [])
 except (ValueError,SyntaxError):return [v] if v else []

def dur(r):
 codes=[[r.get(f'ingredient_code_{i}',''),r.get(f'ingredient_name_ko_{i}','')] for i in (1,2) if r.get(f'ingredient_code_{i}')]
 return {'k':'dur','file':r.get('source_file',''),'row':r.get('source_row',''),'category':r.get('feature_name',''),'date':r.get('notification_date',''),
  'codes':codes,'status':r.get('status',''),'seq':r.get('dur_seq','')}

def permit(r):
 return {'k':'permit','item_seq':r.get('item_seq',''),'item':r.get('item_name',''),'company':r.get('entp_name',''),'category':r.get('professional_category',''),
  'class':r.get('product_type',''),'atc':r.get('atc_code',''),'permit_date':r.get('item_permit_date',''),'change_date':r.get('change_date',''),
  'ingredients':[f'{c} {a}'.strip() for c,a in zip(as_list(r.get('ingredient_codes')),as_list(r.get('ingredient_amounts')))],
  'section':r.get('feature_name',''),'chunk':[str(r.get('chunk_index','')),str(r.get('chunk_total',''))],
  'group_count':str(r.get('mcode_group_product_count','')),'rule':r.get('representative_selection_rule','')}

def easy(r):
 return {'k':'easy','item_seq':r.get('item_seq',''),'item':r.get('item_name',''),'company':r.get('entp_name',''),'open_date':r.get('open_date',''),
  'update_date':r.get('update_date',''),'sections':str(r.get('included_feature_names','')).split('|') if r.get('included_feature_names') else []}

def paper(r):
 return {'k':'paper','pmid':r.get('pmid',''),'doi':r.get('doi',''),'pmcid':r.get('pmcid',''),'pub_types':r.get('pub_types',[]),
  'retrieved':str(r.get('retrieved_at',''))[:10],'journal':r.get('journal',''),'year':str(r.get('year',''))}

def main():
 a=argparse.ArgumentParser();a.add_argument('--sources',required=True)
 for k in ('dur','permit','easy','papers'):a.add_argument('--'+k,required=True)
 a.add_argument('--out',default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'source_meta.json.gz'))
 o=a.parse_args()
 with open(o.sources,encoding='utf-8-sig',newline='') as h:
  wanted={rid for r in csv.DictReader(h) for rid in r['record_ids'].split('|') if rid}
 meta={}
 for path,fn,key in [(o.dur,dur,'record_id'),(o.permit,permit,'record_id'),(o.easy,easy,'record_id')]:
  for r in rows(path):
   if r.get(key) in wanted:meta[r[key]]=fn(r)
 for r in rows(o.papers):
  rid='PMID-'+str(r.get('pmid',''))
  if rid in wanted:meta[rid]=paper(r)
 missing=sorted(wanted-set(meta))
 with gzip.open(o.out,'wt',encoding='utf-8') as h:
  json.dump({'_note':'Readable facts of each DB record\'s original record, built by tools/make_source_meta.py from the team public-data files (commit 6d157c2) and papers_DX2_239.jsonl.','count':len(meta),'missing':missing,'records':meta},h,ensure_ascii=False,separators=(',',':'))
 print(len(meta),'records,',len(missing),'missing ->',o.out)

if __name__=='__main__':main()
