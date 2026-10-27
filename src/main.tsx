import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import type {Config} from './adapter';
import './styles.css';
const ClerkApp=lazy(()=>import('./ClerkApp'));
function Root(){const [config,setConfig]=useState<Config|null>(null),[error,setError]=useState('');useEffect(()=>{let alive=true;fetch('./config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Konfiguration nicht erreichbar.');return r.json();}).then(c=>{if(alive)setConfig(c);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);if(!config)return <div className="login-screen"><main className="login-card"><h1>Fahrzeugakte</h1><p role="status">{error||'App wird geladen …'}</p></main></div>;return config.backend==='cloudflare'&&!new URLSearchParams(location.search).has('test')?<Suspense fallback={<div className="login-screen"><p>Anmeldung wird geladen …</p></div>}><ClerkApp config={config}/></Suspense>:<App/>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>);
