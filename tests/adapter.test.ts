import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {GoogleAdapter,scopes} from '../src/adapter';
const config={clientId:'test.apps.googleusercontent.com',deploymentId:'API-DEPLOYMENT',origin:'https://car.jurodak.com'};
let adapter:GoogleAdapter;let requests:any[]=[];
beforeEach(()=>{vi.useFakeTimers();requests=[];vi.stubGlobal('location',{origin:config.origin,protocol:'https:'});vi.stubGlobal('window',{google:{accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:(options:any)=>({requestAccessToken:()=>options.callback({access_token:'TEST_TOKEN_ONLY_IN_MEMORY',expires_in:3600})})}}}});vi.stubGlobal('fetch',vi.fn(async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({done:true,response:{result:{ok:true}}})};}));adapter=new GoogleAdapter(config);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('GIS-/REST-Adapter ohne echtes Konto',()=>{
 it('verwendet Deployment-ID, offiziellen Endpunkt und Bearer-Header',async()=>{await adapter.authorize();await adapter.call('read');expect(requests[0].url).toBe('https://script.googleapis.com/v1/scripts/API-DEPLOYMENT:run');expect(requests[0].options.headers.Authorization).toBe('Bearer TEST_TOKEN_ONLY_IN_MEMORY');expect(requests[0].options.body).not.toContain('TEST_TOKEN');expect(requests[0].url).not.toContain('TEST_TOKEN');expect(JSON.parse(requests[0].options.body)).toEqual({function:'scalaApi',parameters:['read',{}],devMode:false});});
 it('weist fehlende Anmeldung und Ablauf ab',async()=>{await expect(adapter.call('read')).rejects.toThrow(/verbinden/);await adapter.authorize();vi.advanceTimersByTime(55*60*1000);await expect(adapter.call('read')).rejects.toThrow(/abgelaufen/);expect(requests).toHaveLength(0);});
 it('verweigert einen ersten echten Aufruf unter fremder Origin oder HTTP',async()=>{vi.stubGlobal('location',{origin:'http://localhost:5173',protocol:'http:'});expect(adapter.ready()).toBe(false);await expect(adapter.authorize()).rejects.toThrow(/Einrichtung/);});
 it('behandelt unbestätigtes done:false als Fehler',async()=>{await adapter.authorize();vi.stubGlobal('fetch',async()=>({ok:true,status:200,json:async()=>({done:false})}));await expect(adapter.call('commit',{})).rejects.toThrow(/Serverbestätigung/);});
 it('fordert genau die Scopes des Manifests',async()=>{const manifest=await import('../apps-script/appsscript.json');expect(scopes.slice().sort()).toEqual(manifest.oauthScopes.slice().sort());});
});
