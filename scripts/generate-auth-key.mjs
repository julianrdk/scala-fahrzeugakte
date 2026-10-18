import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const file='config/private-auth-key.txt';
writeFileSync(file,randomBytes(32).toString('base64url')+'\n',{flag:'wx',mode:0o600});
console.log('TOKEN_KEY nur lokal in '+file+' gespeichert. Im Cloudflare-Konto als Secret eintragen; nicht in Chat oder Repository kopieren.');
