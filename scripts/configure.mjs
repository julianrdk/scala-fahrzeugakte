import fs from 'node:fs';
import readline from 'node:readline/promises';
const file='public/config.json';const c=JSON.parse(fs.readFileSync(file,'utf8'));
const ci=process.argv.includes('--ci');let domain=process.env.PAGES_DOMAIN||'';
if(ci){if(process.env.GOOGLE_CLIENT_ID)c.clientId=process.env.GOOGLE_CLIENT_ID;if(process.env.GOOGLE_DEPLOYMENT_ID)c.deploymentId=process.env.GOOGLE_DEPLOYMENT_ID;if(process.env.AUTH_ORIGIN)c.authOrigin=process.env.AUTH_ORIGIN;}
else{const rl=readline.createInterface({input:process.stdin,output:process.stdout});console.log('Nur öffentliche Konfiguration eingeben. Keine Secrets oder Tokens. Leer lassen erhält den Platzhalter.');domain=await rl.question('Eigene Domain/Subdomain (ohne https://): ');const client=await rl.question('Google Web-Client-ID: ');const deployment=await rl.question('API-executable Deployment-ID: ');if(client)c.clientId=client.trim();if(deployment)c.deploymentId=deployment.trim();rl.close();}
if(domain){domain=domain.trim().toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw Error('Nur gültigen Domainnamen ohne Pfad eintragen.');c.origin='https://'+domain;fs.writeFileSync('public/CNAME',domain+'\n');}
if(!c.clientId.includes('EINTRAGEN')&&!c.clientId.endsWith('.apps.googleusercontent.com'))throw Error('Client-ID muss auf .apps.googleusercontent.com enden.');
fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');console.log('Öffentliche Konfiguration gespeichert. Google-Verbindung wurde damit noch nicht geprüft.');
