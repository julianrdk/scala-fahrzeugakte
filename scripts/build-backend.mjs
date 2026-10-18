import {build} from 'esbuild';
import {mkdirSync,writeFileSync,copyFileSync,readFileSync} from 'node:fs';
await build({entryPoints:['apps-script/src/backend.ts'],bundle:true,write:true,outfile:'apps-script/dist/Code.js',format:'iife',globalName:'ScalaBackend',platform:'browser',target:'es2020',minify:false});
const file='apps-script/dist/Code.js';
const wrappers='\nfunction scalaApi(action, argument) { return ScalaBackend.dispatch(action, argument); }\nfunction setupOwner() { return ScalaBackend.setup(); }\nfunction installOwnerTrigger() { return ScalaBackend.installTrigger(); }\nfunction dailyOwnerTask() { return ScalaBackend.daily(); }\n';
writeFileSync(file,readFileSync(file,'utf8')+wrappers);copyFileSync('apps-script/appsscript.json','apps-script/dist/appsscript.json');
copyFileSync('apps-script/appsscript.multi-user.json','apps-script/dist/appsscript.multi-user.json');
for(const name of ['scalaApi','setupOwner','installOwnerTrigger','dailyOwnerTask'])if(!readFileSync(file,'utf8').includes('function '+name+'('))throw Error('Top-Level-Funktion fehlt: '+name);
console.log('Apps Script gebaut; alle vier Top-Level-Einstiegspunkte erhalten.');
