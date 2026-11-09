import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,AxiosError,type AxiosAdapter} from 'axios';
import {createAuthApi,InventorySaveUnconfirmed} from '../src/services/authApi';
import {SessionController} from '../src/features/auth/sessionController';
import {userSchema} from '../src/features/auth/contracts';
import {canWriteInventory,itemSchema,supplierSchema} from '../src/features/inventory/contracts';
import {productInputSchema,productDefaults,productPayload,supplierInputSchema,supplierDefaults,supplierPayload,type InventoryCommand} from '../src/features/inventory/formContracts';
import {inventoryFormMessages} from '../src/features/inventory/formMessages';
const id='00000000-0000-4000-8000-000000000001',child='00000000-0000-4000-8000-000000000002';
const user=userSchema.parse({id,full_name:'Gestor',email:'test@example.com',force_password_change:false,is_platform_staff:false,affiliate_portal_only:false,access:{role:'manager',can_manage_users:true,can_view_financial:false,can_operate_crops:false,livestock_species:[],read_only:false}});
const item=itemSchema.parse({id,nome:'Produto',categoria:'semente',categorias:['semente'],categoria_display:'Semente',unidade_medida:'kg',unidade_display:'kg',descricao:'',fabricante:'',especie_animal:'',estoque_minimo:'10.25',estoque_atual:'7.25',estoque_baixo:true,prioridade:'alta',ativo:true,updated_at:'2026-11-07T12:00:00.123456Z'});
const supplier=supplierSchema.parse({id,nome:'Cooperativa',cnpj:'',tipo_contrato:'mensal',ativo:true,contatos:[{id:child,tipo:'telefone',label:'Vendas',valor:'000123'}],enderecos:[{id:child,label:'Matriz',cep:'',logradouro:'Estrada',numero:'9',bairro:'',complemento:'',cidade:'',estado:'CE',latitude:'-3.1234567890',longitude:'-38.1234567890'}],updated_at:'2026-11-07T12:00:00.123456Z'});
const choices={categorias:[{value:'semente',label:'Semente'}],unidades:[{value:'kg',label:'kg'}],especies:[{value:'bovino',label:'Bovino'}],tipos_contrato:[{value:'mensal',label:'Mensal'}]};
const command:InventoryCommand={kind:'items',values:productDefaults(item)};
async function fixture(actor=user){let fresh=actor,organization='org',mode:'ok'|'500'|'400'|'malformed'='ok';let hold:(()=>Promise<void>)|undefined;const writes:{method:string;path:string;body:Record<string,unknown>;params:unknown}[]=[];
 const adapter:AxiosAdapter=async config=>{const path=config.url!;let data:unknown=path==='auth/login/'?{access:'synthetic',refresh:'synthetic'}:path==='auth/me/'?fresh:path==='organizations/me/'?{id:organization,name:'Org',language:'pt-BR'}:path==='inventory/items/choices/'?choices:{};
 if(path==='inventory/items/choices/')await hold?.();
 if(path.startsWith('inventory/')&&['post','patch'].includes(config.method??'')){writes.push({method:config.method!,path,body:JSON.parse(config.data),params:config.params});if(mode==='400'||mode==='500')throw new AxiosError('synthetic',undefined,config,undefined,{config,data:{nome:['Confira']},headers:{},status:Number(mode),statusText:'error'});data=mode==='malformed'?{}:{id,custo_medio:'999.00'};}
 return {data,status:200,statusText:'OK',headers:{},config};};
 const controller=new SessionController(createAuthApi('https://example.com/api/v1/',create({adapter})),{read:async()=>null,save:async()=>{},clear:async()=>{}},'pt-BR');await controller.signIn('test@example.com','synthetic');return {controller,writes,mode:(v:typeof mode)=>{mode=v;},actor:(v:typeof user)=>{fresh=v;},org:()=>{organization='other';},hold:(v:()=>Promise<void>)=>{hold=v;}};
}
test('product payload validates real limits/precision and never writes balance, cost, lot or immutable edit classification',()=>{
 const values=productInputSchema.parse({...productDefaults(item),nome:' Produto ',estoque_minimo:'10,25'});const create=productPayload(values);assert.equal(create.estoque_minimo,'10.25');assert.equal(create.nome,'Produto');assert.equal('categoria' in create&&create.categoria,'semente');
 const edited=productPayload(values,item);assert.equal('expected_updated_at' in edited?edited.expected_updated_at:null,item.updated_at);
 for(const key of ['estoque_atual','custo_medio','custo_unitario','quantidade_inicial','ativo','organization','categoria','categorias','unidade_medida'])assert.equal(key in edited,false);
 for(const change of [{nome:''},{categorias:[]},{unidade_medida:''},{estoque_minimo:'-1'},{estoque_minimo:'1.234,56'},{estoque_minimo:'1.001'},{estoque_minimo:'123456789'}])assert.equal(productInputSchema.safeParse({...values,...change}).success,false);
});
test('supplier scalar edits omit nested replacement; changed rows preserve labels and exact coordinates; deletion is explicit',()=>{
 const original=supplierDefaults(supplier);const scalar=supplierPayload({...original,nome:'Outra'},supplier);assert.equal('contatos' in scalar,false);assert.equal('enderecos' in scalar,false);assert.equal(scalar.expected_updated_at,supplier.updated_at);
 const nested=supplierPayload({...original,contatos:[...original.contatos,{tipo:'email',label:'Vendas',valor:'test@example.com'}],enderecos:original.enderecos.map(a=>({...a,numero:'10'}))},supplier);
 assert.equal(nested.contatos?.length,2);assert.equal(nested.enderecos?.[0]?.latitude,'-3.1234567890');assert.equal(nested.enderecos?.[0]?.label,'Matriz');assert.equal('id' in nested.enderecos![0]!,false);
 assert.deepEqual(supplierPayload({...original,contatos:[],enderecos:[]},supplier).contatos,[]);
 assert.equal(supplierInputSchema.safeParse({...original,contatos:[{tipo:'email',label:'',valor:'invalid'}]}).success,false);assert.equal(supplierInputSchema.safeParse({...original,enderecos:[{...original.enderecos[0],latitude:'-91'}]}).success,false);
});
test('inventory writes use fresh permission, server choices, tenant preflight and narrow response',async()=>{
 const f=await fixture();assert.deepEqual(await f.controller.saveInventory(command),{id});assert.equal(f.writes[0]?.path,'inventory/items/');assert.deepEqual(f.writes[0]?.params,{view:'receipt'});await f.controller.saveInventory({...command,record:item});assert.equal(f.writes[1]?.method,'patch');assert.equal(f.writes[1]?.body.expected_updated_at,item.updated_at);
 await f.controller.saveInventory({kind:'suppliers',values:{...supplierDefaults(supplier),nome:'Novo'},record:supplier});assert.equal(f.writes[2]?.path,`inventory/fornecedores/${id}/`);assert.equal('contatos' in f.writes[2]!.body,false);
 f.actor({...user,access:{...user.access,read_only:true}});await assert.rejects(f.controller.saveInventory(command));assert.equal(f.writes.length,3);
 const changed=await fixture();changed.org();await assert.rejects(changed.controller.saveInventory(command));assert.equal(changed.writes.length,0);assert.equal(changed.controller.getSnapshot().status,'signedOut');
});
test('unauthorized profiles, inactive edits, absent version and unsupported choices stop before mutation',async()=>{
 for(const role of ['operator','feeder'] as const){const actor={...user,access:{...user.access,role}};assert.equal(canWriteInventory(actor),false);const f=await fixture(actor);await assert.rejects(f.controller.saveInventory(command));assert.equal(f.writes.length,0);}
 const f=await fixture();for(const cmd of [{...command,record:{...item,ativo:false}},{...command,record:{...item,updated_at:undefined}},{...command,values:{...command.values,unidade_medida:'fake'}},{...command,values:{...command.values,categorias:['fake']}}] as InventoryCommand[])await assert.rejects(f.controller.saveInventory(cmd));assert.equal(f.writes.length,0);
});
test('simultaneous saves and logout during metadata preflight cannot create another write',async()=>{
 const f=await fixture();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.hold(()=>gate);const first=f.controller.saveInventory(command);await assert.rejects(f.controller.saveInventory(command));await f.controller.signOut();release();await assert.rejects(first);assert.equal(f.writes.length,0);
});
test('only uncertain HTTP save outcomes are flagged for reconciliation, validation stays a known failure',async()=>{
 const f=await fixture();f.mode('500');await assert.rejects(f.controller.saveInventory(command),InventorySaveUnconfirmed);assert.equal(f.writes.length,1);
 f.mode('400');await assert.rejects(f.controller.saveInventory(command),e=>e instanceof AxiosError&&!(e instanceof InventorySaveUnconfirmed));f.mode('malformed');await assert.rejects(f.controller.saveInventory(command),InventorySaveUnconfirmed);
});
test('inventory form translations cover all supported languages',()=>{for(const copy of Object.values(inventoryFormMessages))assert.deepEqual(Object.keys(copy).sort(),Object.keys(inventoryFormMessages['pt-BR']).sort());});
