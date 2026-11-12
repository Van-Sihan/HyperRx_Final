import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const children=[];
const port=Number(process.env.PORT||8787);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const homeURL=`http://127.0.0.1:${port}/`;
const openRequested=process.argv.includes('--open');
function openLanding(){
 if(!openRequested)return;
 const command=process.platform==='win32'?'powershell.exe':process.platform==='darwin'?'open':'xdg-open';
 const args=process.platform==='win32'?['-NoProfile','-NonInteractive','-Command',`Start-Process '${homeURL}'`]:[homeURL];
 const browser=spawn(command,args,{stdio:'ignore',windowsHide:true});
 browser.on('error',()=>console.log(`Open the landing page: ${homeURL}`));
 browser.unref();
}
function child(command,args){const p=spawn(command,args,{cwd,stdio:'inherit',windowsHide:true,env:process.env});children.push(p);p.on('error',()=>{console.error('Local process failed to start. Check README.');stop(1);});return p;}
function stop(code=0){for(const p of children)p.kill();process.exit(code);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
async function webReady(){try{const r=await fetch(new URL('/api/status',homeURL),{signal:AbortSignal.timeout(3000)});return r.ok&&(await r.json()).service==='galyaksi-local';}catch{return false;}}
if(await webReady()){console.log(`Already running: ${homeURL}`);openLanding();}else{
 const dbURL=process.env.HYPERRAG_URL;
 async function ready(){try{return (await fetch(new URL('/health',dbURL),{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}}
 if(dbURL==='http://127.0.0.1:8788'&&!await ready()){
  const py=fileURLToPath(new URL(process.platform==='win32'?'./.venv/Scripts/python.exe':'./.venv/bin/python',import.meta.url));
  if(!existsSync(py)){console.error('Python environment missing. See README.');process.exit(1);}
  child(py,['-X','utf8','db_server.py']);
  // A container on a small machine loads the DB more slowly (Dockerfile: DB_START_SECONDS=300).
  const wait=Number(process.env.DB_START_SECONDS)||90;
  let connected=false;for(let i=0;i<wait;i++){if(await ready()){connected=true;break;}await new Promise(r=>setTimeout(r,1000));}
  if(!connected){console.error('DB startup timed out.');stop(1);}
 }
 const web=child(process.execPath,['--env-file-if-exists=.env','server.mjs']);
 web.on('exit',code=>stop(code||0));
 let connected=false;for(let i=0;i<50;i++){if(await webReady()){connected=true;break;}await new Promise(r=>setTimeout(r,100));}
 if(!connected){console.error('Web startup timed out.');stop(1);}
 openLanding();
}
