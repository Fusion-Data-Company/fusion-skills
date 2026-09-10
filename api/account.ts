import type {VercelRequest,VercelResponse} from '@vercel/node';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import {qualifyLead,routeLead,generateResponse} from '../lib/qualification.js';
import {buyer,pool,requireConfig,callbackUrl} from '../lib/core.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET'&&req.query.config==='1')return res.json({publishableKey:process.env.CLERK_PUBLISHABLE_KEY||null,checkoutConfigured:!!process.env.STRIPE_PRICE_ID});
 try{
 const user=await buyer(req);await pool.query('INSERT INTO fs_accounts(buyer_id,email) VALUES($1,$2) ON CONFLICT(buyer_id) DO UPDATE SET email=EXCLUDED.email',[user.id,user.email]);
 if(req.method==='GET'){
 const {rows:[account]}=await pool.query('SELECT a.billing_status,a.access_until,a.cancel_at_period_end,t.slug,t.business_name,t.crm_webhook_url FROM fs_accounts a LEFT JOIN fs_tenants t ON t.id=a.tenant_id WHERE buyer_id=$1',[user.id]);
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
 const session=await stripe.checkout.sessions.create({mode:'subscription',customer_email:user.email,line_items:[{price:price.id,quantity:1}],client_reference_id:user.id,metadata:{buyer_id:user.id,fusion_license_product:'speed-to-lead'},subscription_data:{metadata:{buyer_id:user.id,fusion_license_product:'speed-to-lead'}},success_url:requireConfig('APP_ORIGIN')+'/account.html',cancel_url:requireConfig('APP_ORIGIN')+'/account.html'},{idempotencyKey:`stl-${user.id}-${attempt}`});
 await pool.query('UPDATE fs_accounts SET checkout_id=$2,checkout_url=$3,checkout_expires=to_timestamp($4) WHERE buyer_id=$1 AND checkout_attempt=$5',[user.id,session.id,session.url,session.expires_at,attempt]);return res.json({url:session.url});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 if(body.action==='cancel_subscription'){
 const {rows:[a]}=await pool.query('SELECT subscription_id FROM fs_accounts WHERE buyer_id=$1',[user.id]);
 if(!a?.subscription_id)throw new Error('subscription_not_found');
 const stripe=new Stripe(requireConfig('STRIPE_SECRET_KEY'));
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[a.subscription_id]);
 const current=await stripe.subscriptions.retrieve(a.subscription_id);
 if(current.metadata.buyer_id!==user.id)throw new Error('subscription_owner_mismatch');
 const sub=current.status==='canceled'?current:await stripe.subscriptions.update(current.id,{cancel_at_period_end:true},{idempotencyKey:`cancel-at-end-${current.id}`});
 const until=['active','trialing'].includes(sub.status)?sub.items.data[0].current_period_end:0;
 await c.query('UPDATE fs_accounts SET cancel_at_period_end=$3,billing_status=$4,access_until=to_timestamp($5),updated_at=now() WHERE buyer_id=$1 AND subscription_id=$2',[user.id,sub.id,sub.cancel_at_period_end,sub.status,until]);
 await c.query('COMMIT');return res.json({cancelAtPeriodEnd:sub.cancel_at_period_end,status:sub.status,accessUntil:until,notice:'Renewal stopped at the end of the current period. This does not issue a refund.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 if(body.action==='recover_keys'||body.action==='rotate_incoming_key'){
 const c=await pool.connect();try{await c.query('BEGIN');
 const {rows:[tenant]}=await c.query('SELECT t.* FROM fs_tenants t JOIN fs_accounts a ON a.tenant_id=t.id WHERE a.buyer_id=$1 FOR UPDATE OF t',[user.id]);
 if(!tenant)throw new Error('tenant_not_configured');
 if(body.action==='rotate_incoming_key'){
 if(body.confirm!==true)throw new Error('rotation_confirmation_required');
 tenant.incoming_hmac_secret='fs_in_'+crypto.randomBytes(32).toString('hex');
 await c.query('UPDATE fs_tenants SET incoming_hmac_secret=$2,updated_at=now() WHERE id=$1',[tenant.id,tenant.incoming_hmac_secret]);
 }
 await c.query('INSERT INTO fs_account_security_events(buyer_id,tenant_id,action) VALUES($1,$2,$3)',[user.id,tenant.id,body.action]);
 await c.query('COMMIT');return res.json({slug:tenant.slug,incomingSecret:tenant.incoming_hmac_secret,callbackSecret:tenant.crm_webhook_hmac_secret,notice:body.action==='rotate_incoming_key'?'Previous incoming key is invalid. Update your lead source before submitting again. CRM callback key is unchanged.':'Current keys recovered for this account. Keep them in your integration configuration.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 if(body.action==='submit_lead'){
 const notes=typeof body.notes==='string'?body.notes.trim():'';
 const requestId=String(body.requestId||'');
 if(!notes||notes.length>20000||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId))throw new Error('notes_and_request_id_required');
 const {rows:[tenant]}=await pool.query("SELECT t.* FROM fs_tenants t JOIN fs_accounts a ON a.tenant_id=t.id WHERE a.buyer_id=$1 AND a.access_until>now() AND a.billing_status IN ('active','trialing')",[user.id]);
 if(!tenant)throw new Error('configured_active_subscription_required');
 const contact={name:String(body.name||'').trim().slice(0,200),email:String(body.email||'').trim().slice(0,254)};
 const payload={notes,contact,permitted_response:body.permittedResponse===true};
 const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 const qualification=qualifyLead(payload),routing=routeLead(qualification.score,payload,tenant.business_hours);
 const result={qualification,routing,response_draft:generateResponse(routing.action,tenant,payload,qualification),contact,permission:payload.permitted_response?'crm_review':'review_only',notice:'Rule-based assessment and draft, not a sent customer message.'};
 const {rows:[job]}=await pool.query('INSERT INTO fs_jobs(tenant_id,request_id,input_hash,result) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,request_id) DO UPDATE SET request_id=EXCLUDED.request_id RETURNING id,input_hash,delivery_status,result',[tenant.id,requestId,hash,JSON.stringify(result)]);
 if(job.input_hash!==hash)return res.status(409).json({error:'request_id_conflict'});
 return res.status(202).json({job});
 }
 if(body.action==='configure'){
 const business=String(body.businessName||'').trim();if(!business||business.length>200)throw new Error('business_name_required');const url=body.deliveryMode==='workspace'?'workspace://local':callbackUrl(String(body.callbackUrl||''));
 const c=await pool.connect();try{await c.query('BEGIN');const {rows:[a]}=await c.query("SELECT * FROM fs_accounts WHERE buyer_id=$1 AND access_until>now() AND billing_status IN ('active','trialing') FOR UPDATE",[user.id]);if(!a)throw new Error('active_subscription_required');
 if(a.tenant_id)throw new Error('already_configured_use_key_recovery');
 const incoming='fs_in_'+crypto.randomBytes(32).toString('hex'),outgoing='fs_out_'+crypto.randomBytes(32).toString('hex'),slug='buyer-'+crypto.randomBytes(10).toString('hex');
 const {rows:[t]}=await c.query('INSERT INTO fs_tenants(slug,business_name,crm_webhook_url,incoming_hmac_secret,crm_webhook_hmac_secret) VALUES($1,$2,$3,$4,$5) RETURNING id',[slug,business,url,incoming,outgoing]);await c.query('UPDATE fs_accounts SET tenant_id=$2 WHERE buyer_id=$1',[user.id,t.id]);await c.query('COMMIT');return res.json({slug,incomingSecret:incoming,callbackSecret:outgoing,notice:'Save these in your integration. Use Recover signing keys if this response is lost; configuration remains saved.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 return res.status(400).json({error:'unknown_action'});
 }catch(e){return res.status(400).json({error:e instanceof Error&&/^[a-z_]+$/.test(e.message)?e.message:'request_failed'});}
}
