import type {VercelRequest,VercelResponse} from '@vercel/node';
import crypto from 'node:crypto';
import {pool,admin,callbackUrl} from '../lib/core.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 const scheduled=req.method==='GET';
 const expected=process.env.CRON_SECRET;
 const supplied=req.headers.authorization;
 const cronAuthorized=!!expected&&typeof supplied==='string'&&Buffer.byteLength(supplied)===Buffer.byteLength(`Bearer ${expected}`)&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(`Bearer ${expected}`));
 if(scheduled?!cronAuthorized:(req.method!=='POST'||!admin(req)))return res.status(401).end();
 res.setHeader('Cache-Control','no-store');
 // Scheduled requests may only process queued work, never approve a review.
 let input:any={};
 if(!scheduled){try{input=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'invalid_json'});}}
 if(input.action==='review'){
 if(!['confirmed_delivered','confirmed_not_delivered'].includes(input.decision)||typeof input.evidence!=='string'||input.evidence.trim().length<20)return res.status(400).json({error:'delivery_evidence_required'});
 const c=await pool.connect();try{await c.query('BEGIN');const {rows:[j]}=await c.query("SELECT id FROM fs_jobs WHERE id=$1 AND delivery_status IN ('uncertain','needs_review') FOR UPDATE",[input.jobId]);if(!j){await c.query('ROLLBACK');return res.status(409).json({error:'job_not_reviewable'});}
 await c.query('INSERT INTO fs_delivery_reviews(job_id,decision,evidence) VALUES($1,$2,$3)',[j.id,input.decision,input.evidence]);await c.query('UPDATE fs_jobs SET delivery_status=$2,available_at=now(),updated_at=now() WHERE id=$1',[j.id,input.decision==='confirmed_delivered'?'delivered':'pending']);await c.query('COMMIT');return res.json({reviewed:true});}catch{await c.query('ROLLBACK');return res.status(400).json({error:'review_failed'});}finally{c.release();}
 }
 // Expired in-flight sends are uncertain; never blindly replay an external side effect.
 await pool.query("UPDATE fs_jobs SET delivery_status='uncertain',updated_at=now() WHERE delivery_status='sending' AND lease_until<now()");
 const token=crypto.randomUUID();const {rows:[job]}=await pool.query(`UPDATE fs_jobs SET delivery_status='sending',lease_token=$1,lease_until=now()+interval '45 seconds',attempts=attempts+1 WHERE id=(SELECT j.id FROM fs_jobs j JOIN fs_accounts a ON a.tenant_id=j.tenant_id WHERE j.delivery_status='pending' AND j.available_at<=now() AND a.access_until>now() AND a.billing_status IN ('active','trialing') ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`,[token]);
 if(!job)return res.json({claimed:false});
 let status='uncertain',http:number|null=null;
 try{const {rows:[tenant]}=await pool.query('SELECT * FROM fs_tenants WHERE id=$1',[job.tenant_id]);if(tenant.crm_webhook_url==='workspace://local'){await pool.query("UPDATE fs_jobs SET delivery_status='ready_for_review',lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",[job.id,token]);return res.json({claimed:true,id:job.id,status:'ready_for_review'});}const url=callbackUrl(tenant.crm_webhook_url);const ts=Math.floor(Date.now()/1000).toString();const body=JSON.stringify({event:'lead.review_ready',event_id:job.id,tenant_slug:tenant.slug,result:job.result,notice:'Draft and recommendation only. CRM recipient must enforce consent before any customer contact.'});
 const signature=crypto.createHmac('sha256',tenant.crm_webhook_hmac_secret).update(`${ts}.${body}`).digest('hex');
 const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','Idempotency-Key':job.id,'X-FusionSkills-Timestamp':ts,'X-FusionSkills-Signature':signature},body});http=response.status;status=response.ok?'delivered':'needs_review';
 }catch{/* Timeouts and network errors do not prove absence of delivery. */}
 await pool.query('UPDATE fs_jobs SET delivery_status=$3,last_http_status=$4,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2',[job.id,token,status,http]);return res.json({claimed:true,id:job.id,status});
}
