import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('auth/dist',{recursive:true});
await build({entryPoints:['auth/src/worker.ts'],bundle:true,outfile:'auth/dist/_worker.js',format:'esm',platform:'browser',target:'es2022',minify:false});
writeFileSync('auth/dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]})+'\n');
writeFileSync('auth/dist/index.html','<!doctype html><html lang="de"><meta charset="utf-8"><title>Scala Anmeldung</title><p>Anmeldedienst der privaten Fahrzeugakte.</p></html>\n');
console.log('Cloudflare-Pages-Anmeldedienst gebaut. Noch keine Bereitstellung oder Kontoverbindung.');
