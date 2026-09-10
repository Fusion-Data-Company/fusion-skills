import {Pool} from '@neondatabase/serverless';
import {createClerkClient,verifyToken} from '@clerk/backend';
import type {VercelRequest} from '@vercel/node';
import crypto from 'node:crypto';
export const pool=new Pool({connectionString:process.env.DATABASE_URL});
export function requireConfig(name:string){const v=process.env[name];if(!v)throw new Error('service_not_configured');return v;}
export function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function admin(req:VercelRequest){return !!process.env.ADMIN_API_KEY&&safeEqual(String(req.headers.authorization||''),`Bearer ${process.env.ADMIN_API_KEY}`);}
export async function buyer(req:VercelRequest){
 const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
 const claims=await verifyToken(token,{secretKey:requireConfig('CLERK_SECRET_KEY'),authorizedParties:[requireConfig('APP_ORIGIN')]});
 const user=await createClerkClient({secretKey:requireConfig('CLERK_SECRET_KEY')}).users.getUser(claims.sub);
 const email=user.emailAddresses.find(e=>e.id===user.primaryEmailAddressId&&e.verification?.status==='verified')?.emailAddress;
 if(!email)throw new Error('verified_email_required');return {id:user.id,email};
}
export function callbackUrl(value:string){const u=new URL(value);const allowed=requireConfig('CRM_CALLBACK_HOSTS').split(',').map(x=>x.trim().toLowerCase());if(u.protocol!=='https:'||u.username||u.password||u.port||!allowed.includes(u.hostname))throw new Error('callback_host_not_approved');return u.toString();}
export async function rawBody(req:VercelRequest){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>100000)throw new Error('payload_too_large');chunks.push(b);}return Buffer.concat(chunks).toString('utf8');}
