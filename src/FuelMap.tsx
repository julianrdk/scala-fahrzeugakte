import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import type {FuelGrade,FuelPoint,FuelStation} from '../shared/fuel';
import {fuelPrice} from '../shared/fuel';
import 'leaflet/dist/leaflet.css';

export function FuelMap({center,stations,grade,selected,onSelect}:{center:FuelPoint;stations:FuelStation[];grade:FuelGrade|'all';selected:string|null;onSelect:(id:string)=>void}){
 const host=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null),library=useRef<typeof Leaflet|null>(null),markers=useRef(new Map<string,Leaflet.Marker>()),layers=useRef<Leaflet.LayerGroup|null>(null);
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let canceled=false;import('leaflet').then(L=>{
  if(canceled||!host.current)return;library.current=L;
  const view=L.map(host.current,{scrollWheelZoom:false}).setView([center.lat,center.lng],center.label==='Deutschland'?6:13);map.current=view;
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(view);
  tiles.on('tileerror',()=>setError('Kartenkacheln konnten nicht geladen werden. Die Tankstellenliste bleibt nutzbar.'));
  layers.current=L.layerGroup().addTo(view);setReady(true);
 }).catch(()=>setError('Die Karte konnte nicht geladen werden. Bitte die Verbindung prüfen.'));
 return()=>{canceled=true;map.current?.remove();map.current=null;layers.current=null;};},[]);
 useEffect(()=>{
  const L=library.current,view=map.current,group=layers.current;if(!ready||!L||!view||!group)return;
  group.clearLayers();markers.current.clear();
  if(center.label!=='Deutschland'){const pointLabel=document.createElement('span');pointLabel.textContent=center.label;L.circleMarker([center.lat,center.lng],{radius:8,color:'#fff',weight:3,fillColor:'#2563eb',fillOpacity:1}).bindTooltip(pointLabel).addTo(group);}
  for(const station of stations){
   const label=grade==='all'?'⛽':fuelPrice(station.prices[grade]),icon=L.divIcon({className:'fuel-map-marker'+(!station.isOpen?' closed':''),html:'',iconSize:grade==='all'?[32,32]:[86,32],iconAnchor:grade==='all'?[16,16]:[43,16]});
   const marker=L.marker([station.lat,station.lng],{icon,title:station.name,keyboard:true}).addTo(group);
   const node=marker.getElement();if(node){node.textContent=label;node.setAttribute('aria-label',station.name+(grade==='all'?'':': '+label+' pro Liter'));}
   const popup=document.createElement('div'),title=document.createElement('strong'),address=document.createElement('p'),prices=document.createElement('p');
   title.textContent=station.name;address.textContent=[station.street,station.houseNumber,station.postCode,station.place].filter(Boolean).join(' ');
   prices.textContent=grade==='all'?['e5','e10','diesel'].map(g=>(g==='diesel'?'Diesel':g.toUpperCase())+': '+fuelPrice(station.prices[g as FuelGrade])).join(' · '):fuelPrice(station.prices[grade])+' / l';
   popup.append(title,address,prices);marker.bindPopup(popup).on('click',()=>onSelect(station.id));markers.current.set(station.id,marker);
  }
  if(stations.length)view.fitBounds(L.latLngBounds([[center.lat,center.lng],...stations.map(x=>[x.lat,x.lng] as [number,number])]),{padding:[35,35],maxZoom:14});
  else view.setView([center.lat,center.lng],center.label==='Deutschland'?6:13);
 },[ready,center,stations,grade,onSelect]);
 useEffect(()=>{if(selected){const marker=markers.current.get(selected);if(marker){map.current?.panTo(marker.getLatLng());marker.openPopup();}}},[selected,ready,stations,grade]);
 return <div className="fuel-map-wrap"><div ref={host} className="fuel-map" role="region" aria-label="Karte der Tankstellen"/>{!ready&&!error&&<p className="fuel-map-loading" role="status">Karte wird geladen …</p>}{error&&<p className="fuel-map-notice" role="status">{error}</p>}</div>;
}
