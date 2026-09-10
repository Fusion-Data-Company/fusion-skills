import {mock,test,expect,afterAll} from 'bun:test';
import {Pool} from 'pg';
const url=process.env.TEST_DATABASE_URL||'';if(!url.includes('127.0.0.1:55439/speed_acceptance'))throw Error('isolated database required');
const pool=new Pool({connectionString:url});
let event:any={type:'charge.refunded',data:{object:{id:'old-charge'}}};
let refund=0;let disputed=false;let invoice='current-invoice';
const subscription={id:'local-sub',metadata:{buyer_id:'billing-owner'},status:'active',cancel_at_period_end:false,items:{data:[{current_period_end:2100000000,price:{id:'local-price',unit_amount:14900,currency:'usd',recurring:{interval:'month'}}}]},get latest_invoice(){return invoice;}};
mock.module('stripe',()=>({default:class{webhooks={constructEvent:()=>event};subscriptions={retrieve:async()=>subscription};charges={retrieve:async(id:string)=>({id,payment_intent:id==='old-charge'?'old-pi':'current-pi',amount_refunded:id==='old-charge'?14900:refund})};disputes={list:async({charge}:any)=>({data:charge==='current-charge'?[{status:disputed?'needs_response':'won'}]:[]})};invoices={retrieve:async(id:string)=>({id,status:'paid',parent:{subscription_details:{subscription:'local-sub'}}})};paymentIntents={retrieve:async()=>({latest_charge:'current-charge'})};invoicePayments={list:(p:any)=>p.payment?Promise.resolve({data:[{invoice:'old-invoice'}]}):{async *[Symbol.asyncIterator](){yield{payment:{payment_intent:'current-pi'}};}}};}}));
mock.module('../lib/core.js',()=>({pool,rawBody:async()=>Buffer.from(''),requireConfig:(name:string)=>name==='STRIPE_PRICE_ID'?'local-price':'isolated'}));
const handler=(await import('../api/billing')).default;
async function reconcile(){const r:any={status(n:number){this.code=n;return this;},json(v:any){this.body=v;return this;}};await handler({method:'POST',headers:{}} as any,r);expect(r.body).toEqual({received:true});return(await pool.query("SELECT *,EXISTS(SELECT 1 FROM fs_payment_holds h WHERE h.invoice_id=a.billing_invoice_id AND h.held) AS held FROM fs_accounts a WHERE buyer_id='billing-owner'")).rows[0];}
afterAll(async()=>{await pool.query("DELETE FROM fs_payment_holds WHERE subscription_id='local-sub'");await pool.query("DELETE FROM fs_accounts WHERE buyer_id='billing-owner'");await pool.end();});
test('canonical current invoice ignores old refund, holds current partial refund and unresolved dispute, restores won dispute',async()=>{
 await pool.query("INSERT INTO fs_accounts(buyer_id,email,billing_status) VALUES('billing-owner','isolated@example.invalid','inactive')");
 let a=await reconcile();expect(a.held).toBe(false);expect(a.billing_invoice_id).toBe('current-invoice');
 event={type:'customer.subscription.updated',data:{object:{id:'local-sub'}}};refund=1;a=await reconcile();expect(a.held).toBe(true);
 refund=0;disputed=true;a=await reconcile();expect(a.held).toBe(true);
 disputed=false;a=await reconcile();expect(a.held).toBe(false);
});
