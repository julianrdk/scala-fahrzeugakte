import {ClerkProvider,SignIn,SignUp,useAuth} from '@clerk/react';
import {deDE} from '@clerk/localizations';
import {useEffect,useMemo,useRef,useState} from 'react';
import {App} from './App';
import {CloudflareAdapter} from './CloudflareAdapter';
import {clearThumbnailCache} from './thumbnail';
import type {Config} from './adapter';
import {recordTiming} from './timings';
export default function ClerkApp({config}:{config:Config}){
 if(!config.clerkPublishableKey||/EINTRAGEN|ABLESEN/.test(config.clerkPublishableKey)||!config.apiOrigin)return <div className="login-screen"><main className="login-card"><h1>Fahrzeugakte</h1><p>Die eigene Kontoeinrichtung ist vorbereitet. Clerk-Schlüssel und Cloudflare-API-Adresse müssen noch eingerichtet werden.</p><p>Die Anleitung findest du im Projekt unter „Eigene Konten einrichten“.</p><a className="button" href="?test=1">Lokalen Testmodus öffnen</a></main></div>;
 return <ClerkProvider publishableKey={config.clerkPublishableKey} localization={deDE} appearance={{variables:{colorPrimary:'#19644b'},elements:{rootBox:{width:'100%'},cardBox:{width:'100%',boxShadow:'none'},card:{width:'100%',boxShadow:'none'}}}} signInUrl="/?auth=sign-in" signUpUrl="/?auth=sign-up" signInForceRedirectUrl="/#/" signUpForceRedirectUrl="/#/" afterSignOutUrl="/"><Session config={config}/></ClerkProvider>;
}
function Session({config}:{config:Config}){
 const {userId,sessionId,isLoaded}=useAuth(),started=useRef(performance.now()),measured=useRef(false);
 useEffect(()=>{if(isLoaded&&!measured.current){measured.current=true;recordTiming('Anmeldung prüfen',started.current);}},[isLoaded]);
 // Remount before rendering another identity, rather than clearing private state in a later effect.
 return <AccountSession key={(userId??'signed-out')+':'+(sessionId??'none')} config={config}/>;
}
function AccountSession({config}:{config:Config}){
 const {isLoaded,isSignedIn,userId,sessionId,getToken,signOut}=useAuth(),token=useRef(getToken),[initial,setInitial]=useState<any>(null),[error,setError]=useState('');token.current=getToken;
 const adapter=useMemo(()=>userId?new CloudflareAdapter(config,userId,()=>token.current(),()=>{setInitial(null);setError('Deine Anmeldung ist abgelaufen oder nicht mehr gültig. Bitte erneut anmelden.');}):null,[config,userId,sessionId]);
 useEffect(()=>{let active=true;setInitial(null);setError('');if(adapter){adapter.resume();adapter.bootstrap().then(result=>{if(active)setInitial(result);}).catch(e=>{if(active)setError(e.message);});}return()=>{active=false;adapter?.dispose();};},[adapter]);
 if(!isLoaded||isSignedIn&&!initial&&!error)return <div className="login-screen"><main className="login-card"><h1>Fahrzeugakte</h1><p role="status">{isLoaded?'Akte wird geladen …':'Anmeldung wird geprüft …'}</p></main></div>;
 if(!isSignedIn)return <div className="login-screen"><main className="login-card clerk-card"><h1>Fahrzeugakte</h1>{new URLSearchParams(location.search).get('auth')==='sign-up'?<SignUp routing="hash"/>:<SignIn routing="hash" withSignUp={false} transferable={false}/>}<p className="muted">Zugang nur mit Einladung.</p></main></div>;
 if(error||!adapter||!initial)return <div className="login-screen"><main className="login-card"><h1>Fahrzeugakte</h1><p role="alert">{error}</p><button className="button" onClick={()=>location.reload()}>Erneut laden</button><button className="button" onClick={()=>signOut({redirectUrl:'/'})}>Abmelden</button></main></div>;
 return <App key={userId+':'+sessionId} external={{adapter,config,initial,logout:async()=>{adapter.dispose();await clearThumbnailCache();await signOut({redirectUrl:'/'});}}}/>;
}
