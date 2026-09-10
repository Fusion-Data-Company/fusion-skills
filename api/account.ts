import type {VercelRequest,VercelResponse} from '@vercel/node';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import {buyer,pool,requireConfig,callbackUrl} from '../lib/core';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET'&&req.query.config==='1')return res.json({publishableKey:process.env.CLERK_PUBLISHABLE_KEY||null,checkoutConfigured:!!process.env.STRIPE_PRICE_ID});
 try{
 const user=await buyer(req);await pool.query('INSERT INTO fs_accounts(buyer_id,email) VALUES($1,$2) ON CONFLICT(buyer_id) DO UPDATE SET email=EXCLUDED.email',[user.id,user.email]);
 if(req.method==='GET'){
 const {rows:[account]}=await pool.query('SELECT a.billing_status,a.access_until,t.slug,t.business_name,t.crm_webhook_url FROM fs_accounts a LEFT JOIN fs_tenants t ON t.id=a.tenant_id WHERE buyer_id=$1',[user.id]);
 const {rows:jobs}=await pool.query('SELECT j.id,j.delivery_status,j.attempts,j.last_http_status,j.result,j.created_at FROM fs_jobs j JOIN fs_accounts a ON a.tenant_id=j.tenant_id WHERE a.buyer_id=$1 ORDER BY j.created_at DESC LIMIT 50',[user.id]);return res.json({account,jobs});}
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(req.method!=='POST')return res.status(405).end();
 if(body.action==='checkout'){
 const stripe=new Stripe(requireConfig('STRIPE_SECRET_KEY'));const price=await stripe.prices.retrieve(requireConfig('STRIPE_PRICE_ID'));
 if(!price.active||price.unit_amount!==14900||price.currency!=='usd'||price.recurring?.interval!=='month'||price.recurring.interval_count!==1)throw new Error('offer_not_configured');
 const c=await pool.connect();try{await c.query('BEGIN');const {rows:[a]}=await c.query('SELECT * FROM fs_accounts WHERE buyer_id=$1 FOR UPDATE',[user.id]);
 if(a.subscription_id&&new Date(a.access_until)>new Date())throw new Error('subscription_already_active');
 if(a.checkout_url&&new Date(a.checkout_expires)>new Date()){await c.query('COMMIT');return res.json({url:a.checkout_url});}
 // Persist attempt before provider request. A failed response resumes the same Stripe idempotency key.
 const attempt=a.checkout_expires && new Date(a.checkout_expires)<=new Date() ? crypto.randomUUID() : a.checkout_attempt||crypto.randomUUID();await c.query('UPDATE fs_accounts SET checkout_attempt=$2,checkout_url=NULL,checkout_expires=NULL WHERE buyer_id=$1',[user.id,attempt]);await c.query('COMMIT');
 const session=await stripe.checkout.sessions.create({mode:'subscription',customer_email:user.email,line_items:[{price:price.id,quantity:1}],client_reference_id:user.id,metadata:{buyer_id:user.id},subscription_data:{metadata:{buyer_id:user.id}},success_url:requireConfig('APP_ORIGIN')+'/account.html',cancel_url:requireConfig('APP_ORIGIN')+'/account.html'},{idempotencyKey:`stl-${user.id}-${attempt}`});
 await pool.query('UPDATE fs_accounts SET checkout_id=$2,checkout_url=$3,checkout_expires=to_timestamp($4) WHERE buyer_id=$1 AND checkout_attempt=$5',[user.id,session.id,session.url,session.expires_at,attempt]);return res.json({url:session.url});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 if(body.action==='configure'){
 const business=String(body.businessName||'').trim();if(!business||business.length>200)throw new Error('business_name_required');const url=callbackUrl(String(body.callbackUrl||''));
 const c=await pool.connect();try{await c.query('BEGIN');const {rows:[a]}=await c.query("SELECT * FROM fs_accounts WHERE buyer_id=$1 AND access_until>now() AND billing_status IN ('active','trialing') FOR UPDATE",[user.id]);if(!a)throw new Error('active_subscription_required');
 if(a.tenant_id)throw new Error('already_configured_contact_operator');
 const incoming='fs_in_'+crypto.randomBytes(32).toString('hex'),outgoing='fs_out_'+crypto.randomBytes(32).toString('hex'),slug='buyer-'+crypto.randomBytes(10).toString('hex');
 const {rows:[t]}=await c.query('INSERT INTO fs_tenants(slug,business_name,crm_webhook_url,incoming_hmac_secret,crm_webhook_hmac_secret) VALUES($1,$2,$3,$4,$5) RETURNING id',[slug,business,url,incoming,outgoing]);await c.query('UPDATE fs_accounts SET tenant_id=$2 WHERE buyer_id=$1',[user.id,t.id]);await c.query('COMMIT');return res.json({slug,incomingSecret:incoming,callbackSecret:outgoing,notice:'Save these once. Contact operator if response is lost; configuration remains saved.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return res.status(400).json({error:'unknown_action'});
 }catch(e){return res.status(400).json({error:e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'request_failed'});}
}
