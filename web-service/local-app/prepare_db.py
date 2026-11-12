from pathlib import Path
import os, zipfile, hashlib, json, pickle, collections, shutil
ROOT=Path(__file__).resolve().parent
# Team DB release to unpack. setup-windows.cmd and .env.example name the same version.
KDB='kdb-v1.0.2-20261105'
# The ZIP sits in the parent folder; a container mounts it elsewhere and names it in KDB_ZIP (docker-compose.yml).
archive=Path(os.environ['KDB_ZIP']) if os.environ.get('KDB_ZIP') else ROOT.parent/(KDB+'.zip')
expected=archive.with_suffix('.zip.md5').read_text().split()[0]
with archive.open('rb') as f: actual=hashlib.file_digest(f,'md5').hexdigest()
if actual!=expected: raise RuntimeError('ZIP checksum mismatch')
work=ROOT/'data'/'kdb-work';work.mkdir(parents=True,exist_ok=True)
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'md5').hexdigest()
with zipfile.ZipFile(archive) as z:
 prefix=KDB+'/'
 checks={line.split(None,1)[1].strip():line.split()[0] for line in z.read(prefix+'checksums.md5').decode().splitlines() if line.strip()}
 files=['hypergraph_chunk_entity_relation.hgdb','kv_store_text_chunks.json','kv_store_full_docs.json','vdb_chunks.json','vdb_entities.json','vdb_relationships.json','query_settings.json','MANIFEST.md','hyperrag_patch.diff','prompts/keywords_bilingual_v2.txt']
 for name in files:
  target=work/name;target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or digest(target)!=checks[name]:
   with z.open(prefix+name) as src,target.open('wb') as dst:shutil.copyfileobj(src,dst)
  if digest(target)!=checks[name]:raise RuntimeError('File checksum mismatch: '+name)
  print('Verified:',name,flush=True)
 for item in z.infolist():
  if item.filename.endswith('.csv') and item.file_size>1000000:
   data=z.read(item)
   if hashlib.md5(data).hexdigest()!=checks['출처대조표.csv']:raise RuntimeError('Source mapping checksum mismatch')
   (work/'sources.csv').write_bytes(data)
 class Checked(pickle.Unpickler):
  def find_class(self,module,name):
   if (module,name)==('collections','defaultdict'):return collections.defaultdict
   if (module,name)==('builtins','set'):return set
   raise RuntimeError('Unapproved pickle class: '+module+'.'+name)
 with (work/'hypergraph_chunk_entity_relation.hgdb').open('rb') as f: graph=Checked(f).load()
 counts={'entities':len(graph['v_data']),'hyperedges':len(graph['e_data'])}
(work/'verified.json').write_text(json.dumps({'archiveMd5':actual,'version':KDB,'checksumsVerified':True,**counts}),encoding='utf-8')
print('DB working copy ready; original ZIP untouched.')
