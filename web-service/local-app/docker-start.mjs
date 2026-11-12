// Container start (Dockerfile CMD): unpack and check the team DB once (prepare_db.py, into the hyperrx-db volume),
// then start the DB server and the web server (launch.mjs). Later starts skip the unpacking.
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
if(!existsSync(here('./data/kdb-work/verified.json'))){
 const zip=process.env.KDB_ZIP;
 if(!zip||!existsSync(zip)||!existsSync(zip+'.md5')){
  console.error(`Team DB not found. Put kdb-v1.0.2-20261105.zip and its .zip.md5 where docker-compose.yml mounts them (KDB_ZIP=${zip||'unset'}), then start again.`);
  process.exit(1);
 }
 console.log('First start: unpacking and checking the team DB. This takes a few minutes.');
 const r=spawnSync(here('./.venv/bin/python'),['-X','utf8',here('./prepare_db.py')],{stdio:'inherit',cwd:here('./')});
 if(r.status!==0)process.exit(r.status||1);
}
await import('./launch.mjs');
