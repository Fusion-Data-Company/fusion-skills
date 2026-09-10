import type {VercelRequest,VercelResponse} from '@vercel/node';
import crypto from 'node:crypto';
import {pool,rawBody,safeEqual} from '../lib/core.js';
import {qualifyLead,routeLead,generateResponse} from '../lib/qualification.js';
export const config={api:{bodyParser:false}};
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return res.status(405).end();
 try{
 const slug=String(req.query.slug||'');const {rows:[tenant]}=await pool.query('SELECT * FROM fs_tenants WHERE slug=$1',[slug]);
 if(!tenant)return res.status(404).json({error:'tenant_not_found'});
 const raw=await rawBody(req),ts=String(req.headers['x-fusion-timestamp']||''),sig=String(req.headers['x-fusion-signature']||'');
 if(!tenant.incoming_hmac_secret||!/^\d+$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300||!safeEqual(sig,crypto.createHmac('sha256',tenant.incoming_hmac_secret).update(`${ts}.${raw}`).digest('hex')))return res.status(401).json({error:'invalid_signature'});
 const payload=JSON.parse(raw);const requestId=payload.request_id;
 if(typeof requestId!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)||typeof payload.notes!=='string'||payload.notes.length>20000)return res.status(400).json({error:'request_id_and_notes_required'});
 const hash=crypto.createHash('sha256').update(raw).digest('hex');
 const existing=await pool.query('SELECT id,input_hash,delivery_status,result FROM fs_jobs WHERE tenant_id=$1 AND request_id=$2',[tenant.id,requestId]);
 if(existing.rows[0])return res.status(existing.rows[0].input_hash===hash?200:409).json(existing.rows[0].input_hash===hash?{job:existing.rows[0]}:{error:'request_id_conflict'});
 const {rows:[account]}=await pool.query('SELECT buyer_id FROM fs_accounts WHERE tenant_id=$1 AND access_until>now() AND billing_status IN (\'active\',\'trialing\') AND billing_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fs_payment_holds h WHERE h.invoice_id=fs_accounts.billing_invoice_id AND h.held)',[tenant.id]);
 if(!account)return res.status(402).json({error:'active_subscription_required'});
 const qualification=qualifyLead(payload);const routing=routeLead(qualification.score,payload,tenant.business_hours);
 const result={qualification,routing,response_draft:generateResponse(routing.action,tenant,payload,qualification),contact:payload.contact||{},permission:payload.permitted_response===true?'crm_review':'review_only',notice:'Rule-based assessment and draft, not a sent customer message.'};
 const {rows:[job]}=await pool.query('INSERT INTO fs_jobs(tenant_id,request_id,input_hash,result) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,request_id) DO UPDATE SET request_id=EXCLUDED.request_id RETURNING id,input_hash,delivery_status,result',[tenant.id,requestId,hash,JSON.stringify(result)]);
 if(job.input_hash!==hash)return res.status(409).json({error:'request_id_conflict'});
 return res.status(202).json({job});
 }catch{return res.status(400).json({error:'request_not_accepted'});}
}
