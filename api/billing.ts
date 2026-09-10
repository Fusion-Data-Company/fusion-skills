import type {VercelRequest,VercelResponse} from '@vercel/node';
import Stripe from 'stripe';
import {pool,requireConfig,rawBody} from '../lib/core.js';
export const config={api:{bodyParser:false}};
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return res.status(405).end();
 try{
 const stripe=new Stripe(requireConfig('STRIPE_SECRET_KEY'));const event=stripe.webhooks.constructEvent(await rawBody(req),String(req.headers['stripe-signature']||''),requireConfig('STRIPE_WEBHOOK_SECRET'));
 const object=event.data.object as any;
 let id:string|undefined;
 if(event.type.startsWith('customer.subscription.'))id=object.id;
 if(event.type==='checkout.session.completed')id=typeof object.subscription==='string'?object.subscription:object.subscription?.id;
 let affectedCharge:string|undefined;
 if(event.type==='charge.refunded')affectedCharge=object.id;
 if(event.type.startsWith('charge.dispute.'))affectedCharge=typeof object.charge==='string'?object.charge:object.charge?.id;
 if(event.type.startsWith('invoice.')){const invoice=await stripe.invoices.retrieve(object.id);id=typeof invoice.parent?.subscription_details?.subscription==='string'?invoice.parent.subscription_details.subscription:invoice.parent?.subscription_details?.subscription?.id;}
 let affectedInvoice:string|undefined;
 if(affectedCharge){const charge=await stripe.charges.retrieve(affectedCharge);const pi=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 if(pi){const payments=await stripe.invoicePayments.list({payment:{type:'payment_intent',payment_intent:pi},limit:100});const payment=payments.data[0];if(payment){affectedInvoice=typeof payment.invoice==='string'?payment.invoice:payment.invoice.id;const invoice=await stripe.invoices.retrieve(affectedInvoice);const sub=invoice.parent?.subscription_details?.subscription;id=typeof sub==='string'?sub:sub?.id;}}}
 if(!id)return res.json({received:true});
 // Serialize reconciliation and fetch current state: older events cannot overwrite newer access.
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
 const sub=await stripe.subscriptions.retrieve(id);const buyerId=sub.metadata.buyer_id;const item=sub.items.data[0];
 if(!buyerId||sub.items.data.length!==1||item.price.id!==requireConfig('STRIPE_PRICE_ID')||item.price.unit_amount!==14900||item.price.currency!=='usd'||item.price.recurring?.interval!=='month')throw new Error('unrecognized_subscription');
 const invoiceId=typeof sub.latest_invoice==='string'?sub.latest_invoice:sub.latest_invoice?.id;
 const reconcileCharge=async(chargeId:string,invoice:string)=>{const charge=await stripe.charges.retrieve(chargeId);const disputes=await stripe.disputes.list({charge:chargeId,limit:100});const disputed=disputes.data.some(d=>!['won','warning_closed'].includes(d.status));const held=charge.amount_refunded>0||disputed;await c.query('INSERT INTO fs_payment_holds(charge_id,invoice_id,subscription_id,held,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(charge_id) DO UPDATE SET held=EXCLUDED.held,reason=EXCLUDED.reason,updated_at=now()',[chargeId,invoice,id,held,charge.amount_refunded>0?'refund':disputed?'dispute':'clear']);};
 if(affectedCharge&&affectedInvoice)await reconcileCharge(affectedCharge,affectedInvoice);
 let paid=false;
 if(invoiceId){const invoice=await stripe.invoices.retrieve(invoiceId);paid=invoice.status==='paid';for await(const payment of stripe.invoicePayments.list({invoice:invoiceId,limit:100})){const pi=payment.payment.payment_intent;const intent=pi?await stripe.paymentIntents.retrieve(typeof pi==='string'?pi:pi.id):null;const charge=intent?.latest_charge||payment.payment.charge;if(charge)await reconcileCharge(typeof charge==='string'?charge:charge.id,invoiceId);}}
 const until=sub.status==='active'&&paid?item.current_period_end:0;
 await c.query('UPDATE fs_accounts SET subscription_id=$2,billing_status=$3,access_until=to_timestamp($4),cancel_at_period_end=$5,billing_invoice_id=$6,updated_at=now() WHERE buyer_id=$1 AND (subscription_id IS NULL OR subscription_id=$2 OR access_until<=now())',[buyerId,id,sub.status,until,sub.cancel_at_period_end,invoiceId||null]);await c.query('COMMIT');return res.json({received:true});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }catch{return res.status(400).json({error:'billing_not_reconciled'});}
}
