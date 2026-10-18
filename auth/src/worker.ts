import {scopes} from '../../shared/google-scopes';

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Env {
  DB: {prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown>};
  APP_ORIGIN: string;
  AUTH_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_DEPLOYMENT_ID: string;
  OWNER_EMAIL: string;
  TOKEN_KEY: string;
  ACCOUNT_MODE?: 'owner'|'multi';
}
type Tokens = {access: string; refresh: string; expires: number};
type Session = {owner_sub: string; owner_email: string; csrf: string; expires_at: number; tokens: string};
const SESSION = '__Host-scala_session', LOGIN = '__Host-scala_login';
const DAY = 86400000, MAX_BODY = 7 * 1024 * 1024;
const actions = new Set(['read','status','createVehicle','smoke','upload','commit','edit','attachDocument','document','odometer','completeReminder','backup','restoreStart','restoreUpload','restorePreview','restoreSwitch','orphanFiles','testMail']);
const multiUser = (env:Env) => env.ACCOUNT_MODE === 'multi';
const encoder = new TextEncoder();
class HttpError extends Error {constructor(public status: number, message: string) {super(message);}}
function fail(status: number, message: string): never {throw new HttpError(status, message);}
async function authStage<T>(code: string, action: () => Promise<T>): Promise<T> {
  try {return await action();} catch(error) {
    if(error instanceof HttpError) throw error;
    // Only fixed stage/table names reach the browser. Never expose exception text,
    // Google responses, authorization codes, tokens, identity or database values.
    const missing = error instanceof Error ? /no such table:\s*(?:main\.)?([a-z_]+)/i.exec(error.message)?.[1] : undefined;
    if(missing && ['oauth_requests','credentials','sessions','account_jobs'].includes(missing)) {
      fail(503,'In der Anmeldedatenbank fehlt die Tabelle '+missing+'. Bitte die vorbereiteten SQL-Befehle vollständig ausführen. Fehlercode: DB_TABELLE_FEHLT.');
    }
    fail(503,'Die Anmeldung konnte nicht abgeschlossen werden. Fehlercode: '+code+'. Bitte diesen Fehlercode zur Prüfung mitteilen.');
  }
}
function b64(bytes: Uint8Array) {let raw = ''; for (const b of bytes) raw += String.fromCharCode(b); return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unb64(raw: string) {return Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));}
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function hash(raw: string) {return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(raw))));}
async function key(env: Env) {const bytes = unb64(env.TOKEN_KEY.trim()); if(bytes.length !== 32) fail(503,'Anmeldedienst ist noch nicht vollständig eingerichtet.'); return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);}
async function seal(env: Env, value: unknown, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)}, await key(env), encoder.encode(JSON.stringify(value)));
  return b64(iv)+'.'+b64(new Uint8Array(data));
}
async function open<T>(env: Env, value: string, purpose: string): Promise<T> {
  const [iv, data] = value.split('.');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(purpose)}, await key(env), unb64(data));
  return JSON.parse(new TextDecoder().decode(plain));
}
function validOrigin(raw: string) {try {return new URL(raw).origin === raw && raw.startsWith('https://');} catch {return false;}}
function configured(env: Env) {
  return !!env.DB && validOrigin(env.APP_ORIGIN) && validOrigin(env.AUTH_ORIGIN)
    && env.APP_ORIGIN !== env.AUTH_ORIGIN && env.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com')
    && /^[\w-]{20,}$/.test(env.GOOGLE_DEPLOYMENT_ID ?? '') && !!env.GOOGLE_CLIENT_SECRET?.trim()
    && (!env.ACCOUNT_MODE||['owner','multi'].includes(env.ACCOUNT_MODE))
    && (multiUser(env)||/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.OWNER_EMAIL?.trim() ?? '')) && /^[\w-]{43}$/.test(env.TOKEN_KEY?.trim() ?? '');
}
function cookie(request: Request, name: string) {
  const values = (request.headers.get('Cookie') ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(name+'='));
  if(values.length !== 1) return '';
  const value = values[0].slice(name.length+1); return /^[\w-]{43}$/.test(value) ? value : '';
}
const setCookie = (name: string, value: string, age?: number) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax${age === undefined ? '' : '; Max-Age='+age}`;
function headers(request: Request, env: Env) {
  const h = new Headers({'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
  if(request.headers.get('Origin') === env.APP_ORIGIN) {
    h.set('Access-Control-Allow-Origin',env.APP_ORIGIN); h.set('Access-Control-Allow-Credentials','true');
  }
  return h;
}
function json(request: Request, env: Env, data: unknown, status = 200) {const h = headers(request,env); h.set('Content-Type','application/json; charset=utf-8'); return new Response(JSON.stringify(data),{status,headers:h});}
function redirect(request: Request, env: Env, url: string) {const h = headers(request,env); h.set('Location',url); return new Response(null,{status:303,headers:h});}
function requireOrigin(request: Request, env: Env) {if(request.headers.get('Origin') !== env.APP_ORIGIN) fail(403,'Anfrage von dieser Website nicht erlaubt.');}
async function session(request: Request, env: Env): Promise<Session> {
  const raw = cookie(request,SESSION); if(!raw) fail(401,'Bitte erneut mit Google anmelden.');
  const s = await env.DB.prepare('SELECT s.owner_sub, s.csrf, s.expires_at, c.owner_email, c.tokens FROM sessions s JOIN credentials c ON c.owner_sub = s.owner_sub WHERE s.session_hash = ? AND s.expires_at > ?').bind(await hash(raw),Date.now()).first<Session>();
  if(!s || !multiUser(env)&&s.owner_email !== env.OWNER_EMAIL.trim().toLowerCase()) fail(401,'Bitte erneut mit Google anmelden.');
  return s;
}
function requireCsrf(request: Request, s: Session) {if(request.headers.get('X-Scala-CSRF') !== s.csrf) fail(403,'Sitzungsprüfung fehlgeschlagen. Bitte die Seite neu laden.');}
function granted(raw: unknown) {if(typeof raw !== 'string') return false; const got = new Set(raw.split(' ').map(x => x === 'email' ? 'https://www.googleapis.com/auth/userinfo.email' : x)); return scopes.every(x => got.has(x));}
function validToken(result: any) {return typeof result.access_token === 'string' && result.access_token.length > 0 && Number.isFinite(Number(result.expires_in)) && Number(result.expires_in) > 360;}
async function googleFetch(url: string, init: RequestInit) {
  // workerd rejects redirect:'error' before sending the request. Manual mode
  // plus explicit rejection preserves the intended no-redirect guarantee.
  const response = await fetch(url,{...init,redirect:'manual'});
  if(response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    fail(502,'Google hat eine unerwartete Weiterleitung zurückgegeben. Der Aufruf wurde abgebrochen.');
  }
  return response;
}
async function tokenRequest(env: Env, fields: Record<string,string>) {
  return googleFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET.trim()})});
}
async function accessToken(env: Env, s: Session) {
  const tokens = await open<Tokens>(env,s.tokens,'tokens:'+s.owner_sub);
  if(tokens.expires > Date.now()+360000) return tokens.access;
  const response = await tokenRequest(env,{grant_type:'refresh_token',refresh_token:tokens.refresh});
  const result = await response.json() as any;
  if(!response.ok) {
    if(result.error === 'invalid_grant') {
      const removed = await env.DB.prepare('DELETE FROM credentials WHERE owner_sub = ? AND tokens = ? RETURNING owner_sub').bind(s.owner_sub,s.tokens).first();
      if(removed) await env.DB.prepare('DELETE FROM sessions WHERE owner_sub = ?').bind(s.owner_sub).run();
      fail(401,'Google-Freigabe abgelaufen oder widerrufen. Bitte erneut anmelden.');
    }
    fail(502,'Google-Anmeldung konnte gerade nicht erneuert werden. Bitte später erneut versuchen.');
  }
  if(!validToken(result) || (result.scope && !granted(result.scope))) fail(502,'Google hat keine vollständige Zugriffsberechtigung bestätigt.');
  const next: Tokens = {access:result.access_token,refresh:result.refresh_token || tokens.refresh,expires:Date.now()+Number(result.expires_in)*1000};
  await env.DB.prepare('UPDATE credentials SET tokens = ? WHERE owner_sub = ? AND tokens = ?').bind(await seal(env,next,'tokens:'+s.owner_sub),s.owner_sub,s.tokens).run();
  return next.access;
}
async function login(request: Request, env: Env) {
  return authStage('ANMELDESTART',async()=>{
  const until = Date.now()+600000, state = random(), browser = random(), verifier = random(), stateHash = await hash(state);
  const remember = new URL(request.url).searchParams.get('remember') === '1' ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_requests WHERE expires_at <= ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO oauth_requests (state_hash,browser_hash,verifier,remember,expires_at) VALUES (?,?,?,?,?)').bind(stateHash,await hash(browser),await seal(env,verifier,'pkce:'+stateHash),remember,until)
  ]);
  const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.search = new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.AUTH_ORIGIN+'/callback',response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent select_account',state,code_challenge:await hash(verifier),code_challenge_method:'S256'}).toString();
  const response = redirect(request,env,target.href); response.headers.append('Set-Cookie',setCookie(LOGIN,browser,600)); return response;
  });
}
async function callback(request: Request, env: Env) {
  const query = new URL(request.url).searchParams, state = query.get('state') ?? '', browser = cookie(request,LOGIN);
  if(!/^[\w-]{43}$/.test(state) || !browser || query.getAll('state').length !== 1) fail(400,'Anmeldung konnte nicht zugeordnet werden. Bitte neu starten.');
  const stateHash = await hash(state), hashBrowser = await hash(browser);
  // DELETE RETURNING consumes the browser-bound request atomically; callbacks cannot be replayed.
  const pending = await authStage('RUECKSPRUNG_LESEN',()=>env.DB.prepare('DELETE FROM oauth_requests WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING verifier, remember').bind(stateHash,hashBrowser,Date.now()).first<{verifier:string;remember:number}>());
  if(!pending) fail(400,'Anmeldung abgelaufen oder bereits verwendet. Bitte neu starten.');
  if(query.has('error') || !query.get('code') || query.getAll('code').length !== 1) fail(400,'Google-Anmeldung wurde nicht bestätigt. Bitte neu starten.');
  const verifier = await authStage('SCHLUESSEL_PRUEFEN',()=>open<string>(env,pending.verifier,'pkce:'+stateHash));
  const {exchanged,tokens} = await authStage('GOOGLE_TOKEN',async()=>{
    const exchanged = await tokenRequest(env,{grant_type:'authorization_code',code:query.get('code')!,redirect_uri:env.AUTH_ORIGIN+'/callback',code_verifier:verifier});
    return {exchanged,tokens:await exchanged.json() as any};
  });
  if(!exchanged.ok || !validToken(tokens) || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token || !granted(tokens.scope)) fail(400,'Google hat nicht alle benötigten Berechtigungen bestätigt. Bitte die Anmeldung erneut starten und alle benötigten Zugriffe freigeben.');
  const {identityResponse,identity} = await authStage('GOOGLE_KONTO',async()=>{
    const identityResponse = await googleFetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}});
    return {identityResponse,identity:await identityResponse.json() as any};
  });
  const email = typeof identity.email==='string'?identity.email.trim().toLowerCase():'';
  if(!identityResponse.ok || identity.email_verified !== true || typeof identity.sub !== 'string' || !identity.sub || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !multiUser(env)&&email!==env.OWNER_EMAIL.trim().toLowerCase()) fail(403,'Zugriff mit diesem Google-Konto nicht möglich.');
  const raw = random(), until = Date.now()+(pending.remember ? 30*DAY : DAY/2);
  const encrypted = await authStage('ZUGANG_VERSCHLUESSELN',()=>seal(env,{access:tokens.access_token,refresh:tokens.refresh_token,expires:Date.now()+Number(tokens.expires_in)*1000},'tokens:'+identity.sub));
  const nextRun = await authStage('TAGESLAUF_PLANEN',async()=>nextDailyCheck(Date.now()));
  await authStage('SITZUNG_SPEICHERN',async()=>env.DB.batch([
    env.DB.prepare('INSERT INTO credentials (owner_sub,owner_email,tokens) VALUES (?,?,?) ON CONFLICT(owner_sub) DO UPDATE SET owner_email=excluded.owner_email, tokens=excluded.tokens').bind(identity.sub,email,encrypted),
    env.DB.prepare('INSERT INTO sessions (session_hash,owner_sub,csrf,expires_at) VALUES (?,?,?,?)').bind(await hash(raw),identity.sub,random(),until),
    env.DB.prepare('INSERT INTO account_jobs (owner_sub,next_run) VALUES (?,?) ON CONFLICT(owner_sub) DO NOTHING').bind(identity.sub,nextRun)
  ]));
  // Replace a prior browser session rather than leaving an unused session alive for 30 days.
  const old = cookie(request,SESSION); if(old) await authStage('ALTE_SITZUNG',async()=>env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(await hash(old)).run());
  const response = redirect(request,env,env.AUTH_ORIGIN+'/complete');
  response.headers.append('Set-Cookie',setCookie(LOGIN,'',0));
  response.headers.append('Set-Cookie',setCookie(SESSION,raw,pending.remember ? 30*86400 : undefined)); return response;
}
function complete(request: Request, env: Env) {
  const nonce = random(), h = headers(request,env);
  h.set('Content-Type','text/html; charset=utf-8'); h.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
  return new Response(`<!doctype html><html lang="de"><meta charset="utf-8"><title>Anmeldung abgeschlossen</title><p>Anmeldung abgeschlossen. Du kannst dieses Fenster schließen.</p><a href="${env.APP_ORIGIN}">Zur Fahrzeugakte</a><script nonce="${nonce}">if(window.opener){window.opener.postMessage({type:'scala-session-ready'},${JSON.stringify(env.APP_ORIGIN)});window.close();}</script></html>`,{headers:h});
}
// Escape each decoded chunk as one JSON string argument. Large originals never need a
// second full JSON parse/stringify inside the Free plan's short CPU budget. The Google
// backend parses and validates the complete argument before running any operation.
export function scriptBody(body: ReadableStream<Uint8Array> | null, action: string) {
  const reader = (body ?? new Response('{}').body!).getReader(), decoder = new TextDecoder('utf-8',{fatal:true});
  let first = true, total = 0;
  return new ReadableStream<Uint8Array>({async pull(controller) {
    try {
      if(first) {first = false; controller.enqueue(encoder.encode('{"function":"scalaApi","parameters":['+JSON.stringify(action)+',"')); return;}
      const chunk = await reader.read();
      if(chunk.done) {const last = decoder.decode(); controller.enqueue(encoder.encode(JSON.stringify(last).slice(1,-1)+'"],"devMode":false}')); controller.close(); return;}
      total += chunk.value.byteLength; if(total > MAX_BODY) {await reader.cancel(); throw new HttpError(413,'Anfrage zu groß.');}
      controller.enqueue(encoder.encode(JSON.stringify(decoder.decode(chunk.value,{stream:true})).slice(1,-1)));
    } catch(error) {controller.error(error);}
  },cancel(reason) {return reader.cancel(reason);}});
}
async function handle(request: Request, env: Env) {
  const url = new URL(request.url);
  if(url.pathname === '/' && request.method === 'GET') return json(request,env,{service:'Fahrzeugakte Anmeldung',version:4});
  if(!configured(env)) fail(503,'Anmeldedienst ist noch nicht vollständig eingerichtet.');
  if(url.origin !== env.AUTH_ORIGIN) fail(403,'Bitte die eingerichtete Anmeldeadresse verwenden.');
  if(request.method === 'OPTIONS') {
    requireOrigin(request,env);
    if(!['/session','/logout','/automation'].includes(url.pathname) && !url.pathname.startsWith('/api/')) fail(404,'Unbekannter Aufruf.');
    const h = headers(request,env); h.set('Access-Control-Allow-Methods','GET, POST'); h.set('Access-Control-Allow-Headers','Content-Type, X-Scala-CSRF'); return new Response(null,{status:204,headers:h});
  }
  if(url.pathname === '/login' && request.method === 'GET') return login(request,env);
  if(url.pathname === '/callback' && request.method === 'GET') return callback(request,env);
  if(url.pathname === '/complete' && request.method === 'GET') return complete(request,env);
  requireOrigin(request,env);
  if(url.pathname === '/session' && request.method === 'GET') {const s = await session(request,env); return json(request,env,{signedIn:true,csrf:s.csrf,expiresAt:s.expires_at,email:s.owner_email,accountId:s.owner_sub});}
  if(url.pathname === '/automation' && request.method === 'GET') {const s=await session(request,env);const job=await env.DB.prepare('SELECT next_run,last_run,last_error FROM account_jobs WHERE owner_sub=?').bind(s.owner_sub).first();return json(request,env,job??{next_run:null,last_run:null,last_error:'Tagesprüfung noch nicht eingerichtet.'});}
  if(url.pathname === '/logout' && request.method === 'POST') {
    const s = await session(request,env); requireCsrf(request,s);
    await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(await hash(cookie(request,SESSION))).run();
    const response = json(request,env,{ok:true}); response.headers.append('Set-Cookie',setCookie(SESSION,'',0)); return response;
  }
  const action = url.pathname.startsWith('/api/') ? url.pathname.slice(5) : '';
  if(request.method !== 'POST' || !actions.has(action)) fail(404,'Unbekannter Aufruf.');
  const s = await session(request,env); requireCsrf(request,s);
  if(request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') fail(415,'JSON-Anfrage erforderlich.');
  if(Number(request.headers.get('Content-Length')) > MAX_BODY) fail(413,'Anfrage zu groß.');
  const token = await accessToken(env,s);
  // No automatic replay of a write after an uncertain response. Existing operation IDs handle retries.
  const upstream = await googleFetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(env.GOOGLE_DEPLOYMENT_ID)+':run',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:scriptBody(request.body,action),duplex:'half'
  } as RequestInit);
  const h = headers(request,env); h.set('Content-Type','application/json; charset=utf-8');
  return new Response(upstream.body,{status:upstream.status,headers:h});
}
export default {async fetch(request: Request, env: Env) {
  try {return await handle(request,env);} catch(error) {
    const known = error instanceof HttpError;
    const response = json(request,env,{error:known ? error.message : 'Anmeldedienst derzeit nicht verfügbar. Bitte später erneut versuchen.',code:known && error.status === 401 ? 'SIGN_IN_REQUIRED' : 'AUTH_SERVICE_ERROR'},known ? error.status : 503);
    if(known && error.status === 401) response.headers.append('Set-Cookie',setCookie(SESSION,'',0));
    if(request.method === 'GET' && ['/login','/callback'].includes(new URL(request.url).pathname)) {
      const message = (known ? error.message : 'Anmeldedienst derzeit nicht verfügbar. Bitte später erneut versuchen.').replace(/[<>&"]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[x]!));
      response.headers.set('Content-Type','text/html; charset=utf-8');
      return new Response('<!doctype html><html lang="de"><meta charset="utf-8"><title>Anmeldung nicht abgeschlossen</title><h1>Anmeldung nicht abgeschlossen</h1><p>'+message+'</p><p>Schließe dieses Fenster und starte die Anmeldung in der Fahrzeugakte erneut.</p></html>',{status:response.status,headers:response.headers});
    }
    return response;
  }
}};

export function nextDailyCheck(at:number){
 const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'});
 const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'});
 for(let day=0;day<3;day++){
  const date=day===0?dateFormat.format(at):new Date(Date.parse(dateFormat.format(at)+'T12:00:00Z')+day*DAY).toISOString().slice(0,10);
  let candidate=Date.parse(date+'T06:00:00Z');if(hourFormat.format(candidate)!=='08')candidate+=3600000;
  if(candidate>at)return candidate;
 }
 throw Error('Nächster Prüftermin konnte nicht bestimmt werden.');
}

// Invoked only by the separate Cron Worker's scheduled event, never by an HTTP route.
// One account per tick keeps work small and lets each caller's Google identity own
// the files and MailApp execution. Lease expiry permits recovery after worker aborts.
export async function runScheduled(env:Env){
 if(!configured(env))throw Error('Anmeldedienst ist nicht eingerichtet.');
 const at=Date.now();
 const claimed=await env.DB.prepare('UPDATE account_jobs SET lease_until=? WHERE owner_sub=(SELECT j.owner_sub FROM account_jobs j JOIN credentials c ON c.owner_sub=j.owner_sub WHERE j.next_run<=? AND j.lease_until<=? ORDER BY j.next_run LIMIT 1) AND lease_until<=? RETURNING owner_sub').bind(at+9*60000,at,at,at).first<{owner_sub:string}>();
 if(!claimed)return {processed:0};
 try{
  const credentials=await env.DB.prepare('SELECT owner_sub,owner_email,tokens FROM credentials WHERE owner_sub=?').bind(claimed.owner_sub).first<Session>();
  if(!credentials||!multiUser(env)&&credentials.owner_email!==env.OWNER_EMAIL.trim().toLowerCase())fail(401,'Kontofreigabe nicht verfügbar.');
  const token=await accessToken(env,credentials);
  const response=await googleFetch('https://script.googleapis.com/v1/scripts/'+encodeURIComponent(env.GOOGLE_DEPLOYMENT_ID)+':run',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({function:'scalaApi',parameters:['daily',{}],devMode:false})});
  const result=await response.json() as any;
  if(!response.ok||result.done!==true||result.error||result.response?.result?.ok!==true)fail(502,'Tägliche Prüfung nicht bestätigt.');
  await env.DB.prepare('UPDATE account_jobs SET next_run=?,lease_until=0,last_run=?,last_error=NULL WHERE owner_sub=?').bind(nextDailyCheck(Date.now()),Date.now(),claimed.owner_sub).run();
  return {processed:1,ok:true};
 }catch(error){
  const revoked=error instanceof HttpError&&error.status===401;
  await env.DB.prepare('UPDATE account_jobs SET next_run=?,lease_until=0,last_error=? WHERE owner_sub=?').bind(Date.now()+(revoked?DAY:3600000),revoked?'Google-Freigabe erneuern.':'Tägliche Prüfung fehlgeschlagen; erneuter Versuch vorgesehen.',claimed.owner_sub).run();
  return {processed:1,ok:false};
 }
}
