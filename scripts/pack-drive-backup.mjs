import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
const [snapshotFile,folder,output]=process.argv.slice(2);if(!snapshotFile||!folder||!output)throw Error('Aufruf: node scripts/pack-drive-backup.mjs SNAPSHOT.json ORIGINALORDNER AUSGABE.zip');
const snapshot=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));if(snapshot.format!=='vehicle-record-backup'||snapshot.schema_version!==1)throw Error('Unbekanntes Sicherungsformat.');
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x!==null&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const hash=x=>createHash('sha256').update(x).digest('hex');const state=snapshot.state;state.Uploads=[];const files={};let total=0;
for(const d of state.Documents){if(d.missing&&!d.sha256)continue;if(!/^[a-f0-9]{64}$/.test(d.sha256))throw Error('Dokument-Hash fehlt: '+d.title);const b=fs.readFileSync(path.join(folder,d.sha256));if(b.length!==d.size||hash(b)!==d.sha256)throw Error('Original fehlt oder stimmt nicht: '+d.title);files['files/'+d.sha256]=new Uint8Array(b);total+=b.length;if(total>128*1024*1024)throw Error('Sicherung über 128 MiB: bitte im Frontend kontrolliert in Teilarchive exportieren.');}
files['data.json']=strToU8(JSON.stringify({...snapshot,state,state_sha256:hash(canonical(state)),part:1,parts:1,complete:true,missing:[]},null,2));if(fs.existsSync(output))throw Error('Ausgabe existiert bereits. Bitte einen neuen Namen wählen.');fs.writeFileSync(output,zipSync(files,{level:0}));console.log('Geprüftes Wiederherstellungs-ZIP erstellt: '+output);
