import type {VercelRequest,VercelResponse} from '@vercel/node';
import Stripe from 'stripe';
import {pool,requireConfig,rawBody} from '../lib/core';
export const config={api:{bodyParser:false}};
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return res.status(405).end();
 try{
 const stripe=new Stripe(requireConfig('STRIPE_SECRET_KEY'));const event=stripe.webhooks.constructEvent(await rawBody(req),String(req.headers['stripe-signature']||''),requireConfig('STRIPE_WEBHOOK_SECRET'));
 const object=event.data.object as any;
 let id:string|undefined;
 if(event.type.startsWith('customer.subscription.'))id=object.id;
 if(event.type==='checkout.session.completed')id=typeof object.subscription==='string'?object.subscription:object.subscription?.id;
 if(!id)return res.json({received:true});
 // Serialize reconciliation and fetch current state: older events cannot overwrite newer access.
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
 const sub=await stripe.subscriptions.retrieve(id);const buyerId=sub.metadata.buyer_id;const item=sub.items.data[0];
 if(!buyerId||sub.items.data.length!==1||item.price.id!==requireConfig('STRIPE_PRICE_ID')||item.price.unit_amount!==14900||item.price.currency!=='usd'||item.price.recurring?.interval!=='month')throw new Error('unrecognized_subscription');
 const until=['active','trialing'].includes(sub.status)?item.current_period_end:0;
 await c.query('UPDATE fs_accounts SET subscription_id=$2,billing_status=$3,access_until=to_timestamp($4),cancel_at_period_end=$5,updated_at=now() WHERE buyer_id=$1 AND (subscription_id IS NULL OR subscription_id=$2 OR access_until<=now())',[buyerId,id,sub.status,until,sub.cancel_at_period_end]);await c.query('COMMIT');return res.json({received:true});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }catch{return res.status(400).json({error:'billing_not_reconciled'});}
}
