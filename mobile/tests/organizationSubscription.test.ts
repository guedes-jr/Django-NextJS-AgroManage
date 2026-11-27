import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,type AxiosAdapter} from 'axios';
import {createAuthApi} from '../src/services/authApi';
import {couponSchema,organizationSchema,priceDiscounts} from '../src/features/organization/contracts';
import {organizationMessages} from '../src/features/organization/messages';

const price={currency:'BRL',gross:'150.00',subtotal:'140.00',discount_total:'24.00',total:'126.00',
 lines:[{segment_code:'plantacoes',name:'Plantações',tier_label:'Até 1 hectare',base:'100.00',on_request:false,total:'90.00',discounts:[{id:'d1',description:'Seg',kind:'percentage',source:'manual',amount:'10.00'}]},
  {segment_code:'gado-de-corte',name:'Gado de corte',tier_label:'Sob consulta',base:'0.00',on_request:true,total:'0.00',discounts:[]}],
 subscription_discounts:[{id:'d2',description:'Parceria',kind:'percentage',source:'manual',amount:'14.00'}]};

test('organization payload carries the itemized price',()=>{
 const org=organizationSchema.parse({id:'6a4b3d2c-1e0f-4a9b-8c7d-6e5f4a3b2c1d',name:'Org',language:'pt-BR',subscription:{status:'active',billing_cycle:'monthly',items:[],price}});
 assert.equal(org.subscription?.price?.total,'126.00');
 assert.equal(org.subscription?.price?.lines[1]?.on_request,true);
 assert.deepEqual(priceDiscounts(org.subscription!.price!,'Assinatura').map(row=>[row.scope,row.amount]),[['Plantações','10.00'],['Assinatura','14.00']]);
});

test('coupon codes follow the platform rule',()=>{
 for(const code of ['BEMVINDO','promo-10','A_1'])assert.equal(couponSchema.safeParse(code).success,true,code);
 for(const code of ['x','com espaço','a'.repeat(41),'ação'])assert.equal(couponSchema.safeParse(code).success,false,code);
});

test('redeeming sends the upper-case code and validates the new price',async()=>{
 let body:unknown;
 const adapter:AxiosAdapter=async config=>{body=JSON.parse(config.data);assert.equal(config.url,'organizations/me/subscription/coupon/');return {config,data:price,status:201,statusText:'Created',headers:{}};};
 const api=createAuthApi('https://example.com/api/v1/',create({adapter}));
 const result=await api.redeemCoupon({access:'a',refresh:'r'},'pt-BR',' bemvindo ');
 assert.deepEqual(body,{code:'BEMVINDO'});assert.equal(result.total,'126.00');
});

test('subscription texts exist in the four languages',()=>{
 for(const copy of Object.values(organizationMessages))for(const key of ['total','discounts','coupon','couponApply','couponInvalid','yearly'] as const)assert.ok(copy[key]?.trim(),key);
});
