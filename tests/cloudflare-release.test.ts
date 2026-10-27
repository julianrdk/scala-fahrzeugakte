import {afterAll,describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'fahrzeugakte-release-')),configure=path.resolve('scripts/configure.mjs'),validate=path.resolve('scripts/validate-release.mjs');
afterAll(()=>{if(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temporary).startsWith('fahrzeugakte-release-'))fs.rmSync(temporary,{recursive:true});});
function build(key:string){fs.mkdirSync(path.join(temporary,'public'),{recursive:true});fs.writeFileSync(path.join(temporary,'public/config.json'),JSON.stringify({origin:'https://car.jurodak.com',clientId:'GOOGLE_EINTRAGEN',deploymentId:'GOOGLE_EINTRAGEN'}));const env={...process.env,APP_BACKEND:'cloudflare',PAGES_DOMAIN:'car.jurodak.com',API_ORIGIN:'https://auth.jurodak.com',CLERK_PUBLISHABLE_KEY:key,GOOGLE_CLIENT_ID:'',GOOGLE_DEPLOYMENT_ID:'',AUTH_ORIGIN:''};execFileSync(process.execPath,[configure,'--ci'],{cwd:temporary,env,stdio:'pipe'});return JSON.parse(fs.readFileSync(path.join(temporary,'public/config.json'),'utf8'));}
describe('Veröffentlichung mit eigenen Konten',()=>{
 it('erzeugt und prüft Cloudflare-Konfiguration ohne Google-Werte oder Secrets',()=>{const key='pk_live_'+Buffer.from('clerk.synthetic.invalid$').toString('base64'),config=build(key);expect(config).toEqual({backend:'cloudflare',origin:'https://car.jurodak.com',apiOrigin:'https://auth.jurodak.com',clerkPublishableKey:key});expect(()=>execFileSync(process.execPath,[validate],{cwd:temporary,stdio:'pipe'})).not.toThrow();});
 it('verweigert Development-Schlüssel und Platzhalter für die Veröffentlichung',()=>{for(const key of ['pk_live_EINTRAGEN','pk_test_'+Buffer.from('synthetic.clerk.accounts.dev$').toString('base64')]){build(key);expect(()=>execFileSync(process.execPath,[validate],{cwd:temporary,stdio:'pipe'})).toThrow();}});
});
