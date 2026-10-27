import fs from 'node:fs';
import readline from 'node:readline/promises';
const file='public/config.json';let c=JSON.parse(fs.readFileSync(file,'utf8'));
const ci=process.argv.includes('--ci'),backend=process.env.APP_BACKEND||c.backend||'google';let domain=process.env.PAGES_DOMAIN||'';
if(!['google','cloudflare'].includes(backend))throw Error('APP_BACKEND muss google oder cloudflare sein.');
let api=process.env.API_ORIGIN||c.apiOrigin||'https://auth.jurodak.com',publishable=process.env.CLERK_PUBLISHABLE_KEY||c.clerkPublishableKey||'CLERK_PUBLISHABLE_KEY_EINTRAGEN';
if(ci&&backend==='google'){if(process.env.GOOGLE_CLIENT_ID)c.clientId=process.env.GOOGLE_CLIENT_ID;if(process.env.GOOGLE_DEPLOYMENT_ID)c.deploymentId=process.env.GOOGLE_DEPLOYMENT_ID;if(process.env.AUTH_ORIGIN)c.authOrigin=process.env.AUTH_ORIGIN;}
else if(!ci){const rl=readline.createInterface({input:process.stdin,output:process.stdout});console.log('Nur öffentliche Konfiguration eingeben. Keine Secrets oder Tokens. Leer lassen erhält den bisherigen Wert.');domain=await rl.question('Eigene Domain/Subdomain (ohne https://): ');if(backend==='cloudflare'){api=(await rl.question('Cloudflare-API-Origin (https://…): ')).trim()||api;publishable=(await rl.question('Clerk Publishable-Key (pk_test_… oder pk_live_…): ')).trim()||publishable;}else{const client=await rl.question('Google Web-Client-ID: '),deployment=await rl.question('API-executable Deployment-ID: ');if(client)c.clientId=client.trim();if(deployment)c.deploymentId=deployment.trim();}rl.close();}
if(domain){domain=domain.trim().toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw Error('Nur gültigen Domainnamen ohne Pfad eintragen.');c.origin='https://'+domain;fs.writeFileSync('public/CNAME',domain+'\n');}
if(backend==='cloudflare')c={backend:'cloudflare',origin:c.origin,apiOrigin:api,clerkPublishableKey:publishable};
else{c.backend='google';delete c.apiOrigin;delete c.clerkPublishableKey;if(!c.clientId||(!c.clientId.includes('EINTRAGEN')&&!c.clientId.endsWith('.apps.googleusercontent.com')))throw Error('Client-ID muss auf .apps.googleusercontent.com enden.');}
fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');console.log('Öffentliche Konfiguration gespeichert. Eine echte Anmeldung wurde damit noch nicht geprüft.');
