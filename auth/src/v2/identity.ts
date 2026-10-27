import {createClerkClient} from '@clerk/backend';
import {account,createAccount} from './store';
import {problem,type V2Env} from './types';
export function clerkClient(env:V2Env){if(!env.CLERK_SECRET_KEY||!env.CLERK_PUBLISHABLE_KEY)problem(503,'Clerk-Anmeldung ist noch nicht eingerichtet.','SETUP');return createClerkClient({secretKey:env.CLERK_SECRET_KEY,publishableKey:env.CLERK_PUBLISHABLE_KEY,telemetry:{disabled:true}});}
export async function verifiedUser(env:V2Env,owner:string){const user=await clerkClient(env).users.getUser(owner),email=user.emailAddresses.find(e=>e.id===user.primaryEmailAddressId);if(user.banned||user.locked||user.deprovisioned||email?.verification?.status!=='verified')problem(403,'Konto oder E-Mail-Adresse ist nicht bestätigt.');return email.emailAddress;}
export async function identity(request:Request,env:V2Env){
 if(!env.CLERK_ISSUER||!env.CLERK_JWT_KEY)problem(503,'Clerk-Prüfschlüssel und Aussteller fehlen.','SETUP');
 if(!request.headers.get('Authorization')?.startsWith('Bearer '))problem(401,'Bitte anmelden.','SIGN_IN_REQUIRED');
 let owner:string;try{const auth=await clerkClient(env).authenticateRequest(request,{acceptsToken:'session_token',jwtKey:env.CLERK_JWT_KEY.replaceAll('\\n','\n'),issuer:env.CLERK_ISSUER,authorizedParties:[env.APP_ORIGIN]});if(!auth.isAuthenticated)problem(401,'Anmeldung abgelaufen. Bitte erneut anmelden.','SIGN_IN_REQUIRED');const info=auth.toAuth();if(!info.userId||!info.sessionId)problem(401,'Bitte anmelden.','SIGN_IN_REQUIRED');owner=info.userId;}catch(error){if((error as any)?.code==='SETUP')throw error;problem(401,'Anmeldung abgelaufen oder ungültig. Bitte erneut anmelden.','SIGN_IN_REQUIRED');}
 if(!/^user_[A-Za-z0-9_-]{1,100}$/.test(owner!))problem(401,'Kontokennung ungültig.');
 let a=await account(env,owner!);if(!a)a=await createAccount(env,owner!,await verifiedUser(env,owner!));if(a.disabled)problem(403,'Dieses Konto ist gesperrt.');return a;
}
