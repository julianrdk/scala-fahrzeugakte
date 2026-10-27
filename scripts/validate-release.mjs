import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('public/config.json','utf8'));
if(!/^https:\/\/[a-z0-9.-]+$/.test(c.origin))throw Error('Produktive Domain fehlt.');
if(c.backend==='cloudflare'){const key=c.clerkPublishableKey??'',host=Buffer.from(key.slice(8),'base64').toString('utf8');if(!/^pk_live_[A-Za-z0-9+/=_-]+$/.test(key)||!/^([a-z0-9-]+\.)+[a-z]{2,63}\$$/.test(host)||!/^https:\/\/[a-z0-9.-]+$/.test(c.apiOrigin??''))throw Error('Produktiver Clerk-Publishable-Key und API-Adresse fehlen.');}
else if(!c.clientId?.endsWith('.apps.googleusercontent.com')||!c.deploymentId||c.deploymentId.includes('EINTRAGEN'))throw Error('Google-Client-ID und Deployment-ID fehlen.');
if(fs.readFileSync('public/CNAME','utf8').trim()!==new URL(c.origin).hostname)throw Error('CNAME und Origin stimmen nicht überein.');
if(c.authOrigin && (!/^https:\/\/[a-z0-9.-]+$/.test(c.authOrigin) || new URL(c.authOrigin).origin!==c.authOrigin || c.authOrigin===c.origin))throw Error('AUTH_ORIGIN muss eine eigene HTTPS-Origin ohne Pfad sein.');
console.log('Release-Konfiguration konsistent. Echter Kontotest bleibt unter der eigenen Domain erforderlich.');
