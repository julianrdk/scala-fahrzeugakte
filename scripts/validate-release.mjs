import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('public/config.json','utf8'));
if(Object.values(c).some(v=>!v||v.includes('EINTRAGEN'))||!c.clientId.endsWith('.apps.googleusercontent.com')||!/^https:\/\/[a-z0-9.-]+$/.test(c.origin))throw Error('Produktive Domain, Client-ID und Deployment-ID fehlen.');
if(fs.readFileSync('public/CNAME','utf8').trim()!==new URL(c.origin).hostname)throw Error('CNAME und Origin stimmen nicht überein.');
console.log('Release-Konfiguration konsistent. Echter OAuth-Test bleibt unter der eigenen Domain erforderlich.');
