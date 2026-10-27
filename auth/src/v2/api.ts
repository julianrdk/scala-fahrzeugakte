import {fuelBody,fuelStatus,searchFuel,FuelError,type FuelEnv} from '../fuel';
import {action,bootstrap,document,upload} from './actions';
import {identity} from './identity';
import {testMail} from './jobs';
import {ApiError,problem,type V2Env} from './types';
export async function jsonBody(request:Request){if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')problem(415,'JSON-Anfrage erforderlich.');const max=new URL(request.url).pathname.endsWith('/restoreStart')?16*1024*1024:1024*1024;let size=0;const chunks:Uint8Array[]=[];const reader=request.body?.getReader();if(reader)for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();problem(413,'Anfrage zu groß.');}chunks.push(r.value);}try{const v=JSON.parse(await new Blob(chunks.map(b=>new Uint8Array(b).buffer)).text());if(!v||typeof v!=='object'||Array.isArray(v))problem(400,'JSON-Objekt erforderlich.');return v;}catch{problem(400,'Ungültige JSON-Anfrage.');}}
export async function handleV2(request:Request,env:V2Env&FuelEnv){
 const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'}),respond=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{
  if(new URL(request.url).origin!==env.AUTH_ORIGIN||request.headers.get('Origin')!==env.APP_ORIGIN)problem(403,'Zugriff nur von der eingerichteten Website erlaubt.');headers.set('Access-Control-Allow-Origin',env.APP_ORIGIN);
  if(request.method==='OPTIONS'){headers.set('Access-Control-Allow-Methods','GET, POST');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');return new Response(null,{status:204,headers});}
  const a=await identity(request,env),path=new URL(request.url).pathname;
  if(path==='/v2/bootstrap'&&request.method==='GET')return respond(await bootstrap(env,a.owner));
  if(path==='/v2/files'&&request.method==='POST')return respond({result:await upload(env,a.owner,request)});
  const file=path.match(/^\/v2\/documents\/([^/]+)\/(original|thumbnail)$/);if(file&&request.method==='GET'){const f=await document(env,a.owner,decodeURIComponent(file[1]),file[2]==='thumbnail');headers.set('Content-Type',f.record.mime);headers.set('Content-Length',String(f.bytes.length));return new Response(f.bytes,{headers});}
  if(path==='/v2/fuel/status'&&request.method==='GET')return respond(await fuelStatus(env));
  if(path==='/v2/fuel/search'&&request.method==='POST')return respond(await searchFuel(env,await fuelBody(request)));
  const match=path.match(/^\/v2\/actions\/([A-Za-z]+)$/);if(match&&request.method==='POST'){const arg=await jsonBody(request);if(match[1]==='testMail')return respond({result:await testMail(env,a,arg)});return respond(await action(env,a.owner,match[1],arg));}
  problem(404,'Aufruf nicht gefunden.');
 }catch(error){if(error instanceof FuelError){if(error.retryAfter)headers.set('Retry-After',String(error.retryAfter));return respond({error:error.message,code:error.code,retryAfter:error.retryAfter},error.status);}if(error instanceof ApiError)return respond({error:error.message,code:error.code},error.status);const message=String(error);if(message.includes('RECORD_CONFLICT'))return respond({error:'Konflikt: Akte inzwischen geändert. Bitte neu laden.',code:'CONFLICT'},409);if(/D1_|SQLITE|no such|R2|fetch|CLERK/i.test(message))return respond({error:'Datendienst derzeit nicht verfügbar oder noch nicht vollständig eingerichtet.',code:'DATA_SERVICE'},503);return respond({error:error instanceof Error?error.message:'Speichern wurde nicht bestätigt.',code:'INVALID_DATA'},400);}
}
