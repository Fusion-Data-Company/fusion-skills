import type {VercelRequest,VercelResponse} from '@vercel/node';
import crypto from 'node:crypto';
import {buyer,pool} from '../lib/core.js';
import {qualifyLead,routeLead,generateResponse} from '../lib/qualification.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 let user;
 try { user=await buyer(req); } catch { return res.status(401).json({error:'Sign in to use your private demo.'}); }
 try {
  if(req.method==='GET'){
   const {rows}=await pool.query('SELECT id,result,created_at FROM fs_demo_jobs WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT 30',[user.id]);return res.json({jobs:rows,mode:'private_demo'});
  }
  if(req.method!=='POST')return res.status(405).end();
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const notes=typeof body.notes==='string'?body.notes.trim():'';
  const requestId=String(body.requestId||'');
  if(!notes||notes.length>20000||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId))return res.status(400).json({error:'notes_and_request_id_required'});
  const hash=crypto.createHash('sha256').update(notes).digest('hex');
  const c=await pool.connect();
  try {
   await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`demo:${user.id}`]);
   const {rows:[previous]}=await c.query('SELECT id,input_hash,result,created_at FROM fs_demo_jobs WHERE buyer_id=$1 AND request_id=$2',[user.id,requestId]);
   if(previous){await c.query('COMMIT');return previous.input_hash===hash?res.json({job:previous}):res.status(409).json({error:'request_id_conflict'});}
   const {rows:[count]}=await c.query("SELECT count(*)::int AS n FROM fs_demo_jobs WHERE buyer_id=$1 AND created_at>now()-interval '24 hours'",[user.id]);
   if(count.n>=30){await c.query('ROLLBACK');return res.status(429).json({error:'demo_daily_limit'});}
   const input={notes};const qualification=qualifyLead(input);const routing=routeLead(qualification.score,input,{});
   const result={qualification,routing,response_draft:generateResponse(routing.action,{business_name:'Your business'} as any,input,qualification),notice:'Private demo result. No CRM delivery, customer message, or billing action.'};
   const {rows:[job]}=await c.query('INSERT INTO fs_demo_jobs(buyer_id,request_id,input_hash,result) VALUES($1,$2,$3,$4) RETURNING id,result,created_at',[user.id,requestId,hash,JSON.stringify(result)]);
   await c.query('COMMIT');return res.status(201).json({job});
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }catch{return res.status(503).json({error:'Demo is temporarily unavailable. Your request can be retried safely.'});}
}
