import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('public',{recursive:true});
await build({entryPoints:['src/app.js'],bundle:true,outfile:'public/app.js',format:'esm',minify:true});
await build({entryPoints:['src/chatbot1.js'],bundle:true,outfile:'public/chatbot1.js',format:'esm',minify:true}); // ver.chatbot1
await build({entryPoints:['src/chatbot2.js'],bundle:true,outfile:'public/chatbot2.js',format:'esm',minify:true}); // ver.chatbot2 (start screen: chat · map · dashboard)
let landing=await readFile('../galYAKsi_smaller_sign.html','utf8');
landing=landing.replace('디자인 목업 · 의료 답변 및 결제 기능은 연결되지 않았습니다.','질문을 입력하면 연결된 분석 화면으로 이동합니다.');
landing=landing.replace('<div class="scrollhint">SCROLL TO MEMBERSHIP ↓</div>','');
landing=landing.replace('</body>',`<script>document.querySelector('#search').onsubmit=e=>{e.preventDefault();const q=document.querySelector('#search input').value.trim();if(q){sessionStorage.setItem('galyaksi-question',q);location.href='/app';}};</script><a href="/app" style="position:fixed;bottom:20px;right:20px;z-index:100;color:#eee8d7;background:#101b2d;padding:12px 18px;border-radius:24px;text-decoration:none;font:13px sans-serif">분석 화면으로 ↗</a></body>`);
await writeFile('public/landing.html',landing);
console.log('Build complete. Original landing connected.');
