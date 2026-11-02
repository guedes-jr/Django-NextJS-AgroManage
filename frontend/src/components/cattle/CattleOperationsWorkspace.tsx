"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cattleHome, cattleHref, type CattleProduction } from "@/services/cattleNavigation";
import { ArrowLeft, Plus, RefreshCw, ClipboardList, ArrowRightLeft, Bell, FileUp, ListChecks, Milk, ChartNoAxesCombined, Download, Check } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import { cattleService, cattleError, type CattleAnimal, type CattleBatch } from "@/services/cattleService";
import { cattleOperations as service, purposeLabels, parseAnimalCSV, type OperationRow, type MilkTrend, type CostReport } from "@/services/cattleOperationsService";
import { milkToday, milkNumber } from "@/services/milkProductionService";
import styles from "./cattle-operations.module.css";

const tabs = [{id:"classification",label:"Finalidade",icon:ClipboardList},{id:"transfers",label:"Transferências",icon:ArrowRightLeft},{id:"occurrences",label:"Ocorrências",icon:Bell},{id:"import",label:"Importar animais",icon:FileUp},{id:"protocols",label:"Protocolos",icon:ListChecks},{id:"milk-trends",label:"Evolução do leite",icon:Milk},{id:"costs",label:"Custos por origem",icon:ChartNoAxesCombined}];
const date = (value: unknown) => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const purposeOptions = Object.entries(purposeLabels).map(([value,label]) => ({value,label}));
const occurrenceKinds = {animal:"Animal",water:"Água",fence:"Cerca",pasture:"Pasto",other:"Outro"};
const ids = (rows: OperationRow[]) => rows.map(row => row.id);

export function CattleOperationsWorkspace({ initialTab = "classification", production = "beef" }: { initialTab?: string; production?: CattleProduction }) {
  const access = useOrganizationAccess();
  const manager = !!access && ["admin","manager"].includes(access.role);
  const canWrite = !!access && !access.read_only && ["admin","manager","operator"].includes(access.role);
  const [tab,setTab] = useState(tabs.some(item=>item.id===initialTab)?initialTab:"classification");
  const [farm,setFarm] = useState("");
  const [farms,setFarms] = useState<{id:string;name:string}[]>([]);
  const [rows,setRows] = useState<OperationRow[]>([]);
  const [page,setPage] = useState(0);
  const [count,setCount] = useState(0);
  const [search,setSearch] = useState("");
  const [purpose,setPurpose] = useState("unknown");
  const [targetType,setTargetType] = useState("animals");
  const [occurrenceStatus,setOccurrenceStatus] = useState("open");
  const [protocolView,setProtocolView] = useState("protocol-runs");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [revision,setRevision] = useState(0);
  const [form,setForm] = useState<CattleFormSpec | null>(null);
  const [review,setReview] = useState<{data:Record<string,unknown>;snapshot:Record<string,unknown>} | null>(null);
  const [importRows,setImportRows] = useState<Record<string,string>[]>([]);
  const [preview,setPreview] = useState<{line:number;valid:boolean;data:Record<string,string>;errors:Record<string,unknown>}[]>([]);
  const [start,setStart] = useState(() => { const date=new Date(); date.setDate(date.getDate()-29); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; });
  const [end,setEnd] = useState(milkToday);
  const [drop,setDrop] = useState("20");
  const [animalSearch,setAnimalSearch] = useState("");
  const [animal,setAnimal] = useState("");
  const [animalOptions,setAnimalOptions] = useState<CattleAnimal[]>([]);
  const [trend,setTrend] = useState<MilkTrend | null>(null);
  const [costs,setCosts] = useState<CostReport | null>(null);
  const [costBatch,setCostBatch] = useState("");
  const [batchOptions,setBatchOptions] = useState<CattleBatch[]>([]);
  const [costPurpose,setCostPurpose] = useState("all");
  useEffect(() => { const controller=new AbortController(); cattleService.farms(controller.signal).then(setFarms).catch(error => {if(!controller.signal.aborted)setError(cattleError(error));}); return () => controller.abort(); },[]);
  useEffect(() => {
    const controller=new AbortController();
    const timer=window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params={...(farm?{farm}:{}),page:page+1,page_size:10};
        if(tab==="classification" && targetType!=="purpose-history") {
          const data=await cattleService.list<OperationRow>(targetType as "animals"|"batches",{...params,search,production:purpose},controller.signal); if(!controller.signal.aborted){setRows(data.results);setCount(data.count);}
        } else if(tab==="milk-trends") {
          const result=await service.read<MilkTrend>(tab,{start,end,...(farm?{farm}:{}),...(animal?{animal}:{}),drop_percent:drop},controller.signal); if(!controller.signal.aborted)setTrend(result);
        } else if(tab==="costs" && manager) {
          const result=await service.read<CostReport>(tab,{start,end,...(farm?{farm}:{}),...(costBatch?{batch:costBatch}:{}),production:costPurpose},controller.signal); if(!controller.signal.aborted)setCosts(result);
        } else if(tab!=="import") {
          const kind=tab==="classification"?"purpose-history":tab==="protocols"?protocolView:tab;
          const data=await service.page(kind,{...params,...(tab==="occurrences"?{status:occurrenceStatus}:{})},controller.signal); if(!controller.signal.aborted){setRows(data.results);setCount(data.count);}
        }
      } catch(error){if(!controller.signal.aborted){setError(cattleError(error));setRows([]);setTrend(null);setCosts(null);}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },200);
    return () => {controller.abort();window.clearTimeout(timer);};
  },[tab,targetType,protocolView,farm,page,search,purpose,revision,occurrenceStatus,start,end,drop,animal,manager,costBatch,costPurpose]);
  useEffect(() => {
    if(tab!=="milk-trends" && tab!=="costs")return;
    const controller=new AbortController();
    const timer=window.setTimeout(() => {
      if(tab==="milk-trends") cattleService.list<CattleAnimal>("animals",{...(farm?{farm}:{}),search:animalSearch,page_size:20},controller.signal).then(data=>setAnimalOptions(current=>[...data.results,...current.filter(row=>row.id===animal&&!data.results.some(item=>item.id===row.id))])).catch(error=>{if(!controller.signal.aborted)setError(cattleError(error));});
      else cattleService.all<CattleBatch>("batches",farm?{farm}:{},controller.signal).then(setBatchOptions).catch(error=>{if(!controller.signal.aborted)setError(cattleError(error));});
    },200); return()=>{controller.abort();window.clearTimeout(timer);};
  },[tab,farm,animalSearch,animal]);
  useEffect(() => {
    if (!access || manager || !["costs","import","transfers","classification"].includes(tab)) return;
    const timer=window.setTimeout(()=>setTab("occurrences"),0); return()=>window.clearTimeout(timer);
  },[access,manager,tab]);
  const refresh=()=>setRevision(value=>value+1);
  const saved=()=>{setForm(null);if(form?.submitLabel === "Conferir prévia")setNotice("Prévia pronta para conferência. Nenhuma movimentação foi aplicada.");else{setNotice("Operação registrada com sucesso.");refresh();}};
  const farmRequired=()=>{if(!farm){setError("Selecione uma fazenda para esta operação.");return false;}return true;};
  function classify(selected:OperationRow[]) {
    setForm({title:"Classificar finalidade produtiva",description:`${selected.length} ${selected.length === 1 ? "registro selecionado" : "registros selecionados"}. A mudança preserva o histórico e não altera a aptidão ou a lactação.${targetType === "batches" ? " Ao classificar um lote, seus animais ativos vinculados também serão classificados, com histórico individual." : ""}`,fields:[{name:"purpose",label:"Finalidade",type:"select",required:true,options:purposeOptions}],save:values=>service.command("classify",{purpose:values.purpose,animals:targetType==="animals"?ids(selected):[],batches:targetType==="batches"?ids(selected):[]})});
  }
  async function newTransfer() {
    if(!farmRequired())return; setSaving(true);setError("");
    try {
      const batches=await cattleService.all<CattleBatch>("batches",{farm,status:"active"});
      const options=batches.map(batch=>({value:batch.id,label:`${batch.batch_code} · ${batch.quantity} animais`}));
      const key=crypto.randomUUID();
      setForm({title:"Transferir animais entre lotes",description:"Confira a prévia antes de confirmar. O movimento ocorre na data atual entre lotes da mesma fazenda, finalidade, categoria e sexo.",initial:{date:milkToday()},fields:[{name:"source",label:"Lote de origem",type:"select",required:true,options},{name:"destination",label:"Lote de destino",type:"select",required:true,options},{name:"quantity",label:"Quantidade",type:"number",min:"1",step:"1",required:true},{name:"identifiers",label:"Brincos participantes (um por linha, quando identificados)",type:"textarea"},{name:"reason",label:"Motivo",required:true,maxLength:300}],submitLabel:"Conferir prévia",save:async values=>{
        const identifiers=values.identifiers.split(/[\n;,]+/).map(value=>value.trim()).filter(Boolean);
        const animals=identifiers.length?await cattleService.all<CattleAnimal>("animals",{farm,batch:values.source,status:"active"}):[];
        const selected=identifiers.map(identifier=>{const animal=animals.find(row=>row.identifier===identifier);if(!animal)throw { response: { data: { identifiers: `Brinco ${identifier} não encontrado na origem.` } } };return animal.id;});
        const data={source:values.source,destination:values.destination,quantity:Number(values.quantity),animals:selected,date:milkToday(),reason:values.reason,request_key:key};
        const snapshot=await service.command<Record<string,unknown>>("transfers",{...data,preview:true});setReview({data:{...data,expected_source:snapshot.source_before,expected_destination:snapshot.destination_before},snapshot});
      }});
    }catch(error){setError(cattleError(error));}finally{setSaving(false);}
  }
  async function movePasture() {
    if(!farmRequired())return;setSaving(true);setError("");
    try {
      const [batches,pastures]=await Promise.all([cattleService.all<CattleBatch>("batches",{farm,status:"active"}),cattleService.all<{id:string;name:string}>("pastures",{farm})]);
      const key=crypto.randomUUID();
      setForm({title:"Mudar lote de pasto",description:"A ocupação atual será encerrada e a nova será aberta juntas, na data atual.",fields:[{name:"batch",label:"Lote",type:"select",required:true,options:batches.map(row=>({value:row.id,label:row.batch_code}))},{name:"pasture",label:"Pasto de destino",type:"select",required:true,options:pastures.map(row=>({value:row.id,label:row.name}))},{name:"reason",label:"Motivo",required:true,maxLength:300}],submitLabel:"Conferir prévia",save:async values=>{const data={...values,request_key:key};const snapshot=await service.command<Record<string,unknown>>("move-pasture",{...data,preview:true});setReview({data:{...data,operation:"move-pasture",expected_source:snapshot.source},snapshot});}});
    }catch(error){setError(cattleError(error));}finally{setSaving(false);}
  }
  async function newOccurrence() {
    if(!farmRequired())return;setSaving(true);setError("");
    try{
      const members=await service.read<{id:string;full_name:string}[]>("members");
      const animals=await cattleService.all<CattleAnimal>("animals",{farm,status:"active"});
      setForm({title:"Registrar ocorrência",description:"A ocorrência gera uma tarefa na agenda da organização, com responsável e prazo.",initial:{date:milkToday(),due_date:milkToday(),kind:"other"},fields:[{name:"kind",label:"Tipo",type:"select",required:true,options:Object.entries(occurrenceKinds).map(([value,label])=>({value,label}))},{name:"animal",label:"Animal (opcional)",type:"select",options:animals.map(row=>({value:row.id,label:`${row.identifier} · ${row.name||""}`}))},{name:"date",label:"Data",type:"date",required:true,max:milkToday()},{name:"due_date",label:"Prazo",type:"date",required:true},{name:"assigned_to",label:"Responsável",type:"select",required:true,options:members.map(row=>({value:row.id,label:row.full_name}))},{name:"description",label:"Descrição",type:"textarea",required:true,maxLength:1000}],save:values=>service.command("occurrences",{...values,farm,animal:values.animal||null})});
    }catch(error){setError(cattleError(error));}finally{setSaving(false);}
  }
  function resolve(row:OperationRow) {setForm({title:"Resolver ocorrência",description:String(row.description),fields:[{name:"resolution",label:"Solução aplicada",type:"textarea",required:true,maxLength:1000}],save:values=>service.command("resolve-occurrence",{id:row.id,resolution:values.resolution})});}
  function newProtocol(){setForm({title:"Cadastrar protocolo / nova versão",description:"Use o mesmo nome para criar uma nova versão. Execuções anteriores mantêm suas etapas. Uma linha por etapa: dia relativo; nome da etapa.",fields:[{name:"name",label:"Nome",required:true,maxLength:100},{name:"steps",label:"Etapas (dia; descrição)",type:"textarea",required:true,maxLength:6000}],save:values=>{
    const steps=values.steps.split(/\n/).filter(line=>line.trim()).map(line=>{const separator=line.indexOf(";");return {day:Number(line.slice(0,separator)),name:line.slice(separator+1).trim()};});return service.command("protocols",{name:values.name,steps});
  }});}
  async function startProtocol(){
    if(!farmRequired())return;setSaving(true);setError("");
    try{
      const [protocols,members,animals]=await Promise.all([service.page("protocols",{page_size:100}),service.read<{id:string;full_name:string}[]>("members"),cattleService.all<CattleAnimal>("animals",{farm,status:"active",gender:"F"})]);
      const key=crypto.randomUUID();
      setForm({title:"Iniciar protocolo reprodutivo",description:"As etapas previstas serão incluídas na agenda. A execução não cria automaticamente coberturas, diagnósticos ou partos.",initial:{start_date:milkToday()},fields:[{name:"animal",label:"Matriz",type:"select",required:true,options:animals.map(row=>({value:row.id,label:`${row.identifier} · ${row.name||""}`}))},{name:"protocol",label:"Protocolo / versão",type:"select",required:true,options:protocols.results.map(row=>({value:row.id,label:`${row.name} · v${row.version}`}))},{name:"start_date",label:"Início",type:"date",required:true},{name:"assigned_to",label:"Responsável",type:"select",required:true,options:members.map(row=>({value:row.id,label:row.full_name}))}],save:values=>service.command("start-protocol",{...values,request_key:key})});
    }catch(error){setError(cattleError(error));}finally{setSaving(false);}
  }
  async function executeStep(step:OperationRow){
    setSaving(true);setError("");try{
      const [lots,matings]=await Promise.all([service.page<{id:string;label:string}>("stock-lots",{category:"semen",page_size:100}),service.page<{id:string;label:string}>("matings",{page_size:100})]);
      setForm({title:`Executar etapa · ${step.name}`,description:"Registre a data real. Se houver consumo de sêmen, vincule o lote físico e a cobertura da mesma matriz e data.",initial:{date:milkToday()},fields:[{name:"date",label:"Data executada",type:"date",required:true,max:milkToday()},{name:"inventory_lot",label:"Lote de sêmen (opcional)",type:"select",options:lots.results.map(row=>({value:row.id,label:row.label}))},{name:"inventory_quantity",label:"Quantidade na unidade do estoque",type:"number",min:"0.01",step:"0.01"},{name:"mating",label:"Cobertura vinculada (opcional)",type:"select",options:matings.results.map(row=>({value:row.id,label:row.label}))},{name:"notes",label:"Observações",type:"textarea",maxLength:1000}],save:values=>service.command("execute-step",{...values,id:step.id})});
    }catch(error){setError(cattleError(error));}finally{setSaving(false);}
  }
  async function fileSelected(file?:File){setPreview([]);setImportRows([]);setError("");if(!file)return;try{if(file.size>2*1024*1024)throw new Error("Use um CSV com até 2 MB.");setImportRows(parseAnimalCSV(await file.text()));}catch(error){setError(error instanceof Error?error.message:"Planilha inválida.");}}
  async function previewImport(){if(!farmRequired())return;setSaving(true);setError("");try{const result=await service.command<{rows:typeof preview}>("import-preview",{farm,rows:importRows});setPreview(result.rows);}catch(error){setError(cattleError(error));}finally{setSaving(false);}}
  async function confirmImport(){setSaving(true);setError("");try{await service.command("import-confirm",{farm,rows:importRows});setPreview([]);setImportRows([]);setNotice("Animais importados. Uma nova tentativa com os mesmos brincos será rejeitada para evitar duplicidade.");refresh();}catch(error){setError(cattleError(error));}finally{setSaving(false);}}
  function downloadTemplate(){const blob=new Blob(["\uFEFFidentifier;name;gender;category;birth_date;entry_date;breed_name_input;initial_weight_kg;cattle_purpose;notes\nEXEMPLO-001;Estrela;F;Vaca;2023-01-01;"+milkToday()+";Girolando;450;dairy;Remova esta linha de exemplo\n"],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download="modelo-animais-bovinos.csv";anchor.click();URL.revokeObjectURL(url);}
  let columns:Column<OperationRow>[]=[];
  if(tab==="classification")columns=targetType==="purpose-history"?[{key:"date",label:"Data",render:date},{key:"target",label:"Animal / lote"},{key:"previous",label:"Anterior",render:value=>purposeLabels[String(value)]},{key:"purpose",label:"Finalidade",render:value=>purposeLabels[String(value)]},{key:"author",label:"Autor"}]:[{key:targetType==="animals"?"identifier":"batch_code",label:"Brinco / lote"},{key:"name",label:"Nome"},{key:"farm_name",label:"Fazenda"},{key:"cattle_purpose",label:"Finalidade",render:value=>purposeLabels[String(value)]||"Não informado"}];
  if(tab==="transfers")columns=[{key:"date",label:"Data",render:date},{key:"source",label:"Origem"},{key:"destination",label:"Destino"},{key:"quantity",label:"Animais"},{key:"reason",label:"Motivo"},{key:"author",label:"Responsável"}];
  if(tab==="occurrences")columns=[{key:"date",label:"Data",render:date},{key:"kind",label:"Tipo",render:value=>occurrenceKinds[value as keyof typeof occurrenceKinds]},{key:"target",label:"Local / animal"},{key:"description",label:"Descrição"},{key:"assigned_to",label:"Responsável"},{key:"due_date",label:"Prazo",render:date},{key:"status",label:"Situação",render:value=>({open:"Aberta",in_progress:"Em andamento",done:"Resolvida",cancelled:"Cancelada"})[String(value)]||String(value)}];
  if(tab==="protocols")columns=protocolView==="protocols"?[{key:"name",label:"Protocolo"},{key:"version",label:"Versão"},{key:"steps",label:"Etapas",render:value=><ol className="mb-0">{(value as {name:string;day:number}[]).map((step,i)=><li key={i}>D{step.day} · {step.name}</li>)}</ol>}]:[{key:"animal",label:"Matriz"},{key:"protocol",label:"Protocolo"},{key:"start_date",label:"Início",render:date},{key:"steps",label:"Etapas previstas e executadas",render:value=><div className={styles.steps}>{(value as OperationRow[]).map(step=><div key={step.id}><span>{String(step.name)} · {date(step.due_date)} · {step.executed_date?`Executada ${date(step.executed_date)}`:step.status==="overdue"?"Atrasada":"Pendente"}</span>{canWrite&&!step.executed_date&&<button className="btn btn-outline-success btn-sm" disabled={saving} onClick={()=>void executeStep(step)}>Executar</button>}</div>)}</div>}];
  return <div className={styles.workspace}>
    <header className={styles.header}><div><h1>Central de manejo bovino</h1><p>Organize o rebanho, acompanhe as rotinas e confira a origem dos indicadores.</p></div><div className={styles.controls}><label>Fazenda<select className="form-select form-select-sm" value={farm} disabled={saving} onChange={event=>{setFarm(event.target.value);setPage(0);setPreview([]);setAnimal("");setCostBatch("");}}><option value="">Todas as fazendas</option>{farms.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="btn btn-outline-secondary btn-sm" disabled={loading||saving} onClick={refresh}><RefreshCw size={16}/> Atualizar</button></div></header>
    <nav className={styles.tabs} aria-label="Operações bovinas">{tabs.filter(item=>manager||!["costs","import","transfers","classification"].includes(item.id)).map(({id,label,icon:Icon})=><button className="btn btn-sm" aria-current={tab===id?"page":undefined} disabled={saving} key={id} onClick={()=>{setTab(id);setPage(0);setRows([]);setCount(0);setError("");setNotice("");}}><Icon size={17}/>{label}</button>)}</nav>
    {saving&&!form&&!review&&<p role="status" className="small text-muted-foreground">Preparando operação…</p>}
    {error&&<div role="alert" className="alert alert-danger">{error}</div>}{notice&&<div role="status" className="alert alert-success">{notice}</div>}
    <section className={styles.panel}>
      {tab==="classification"&&<><p>Finalidade define o segmento. Lactação e aptidão são independentes. Dupla finalidade aparece em ambos os segmentos; no total geral cada participante é contado uma vez.</p><div className={styles.controls}><label>Registros<select className="form-select form-select-sm" value={targetType} onChange={event=>{setTargetType(event.target.value);setPage(0);}}><option value="animals">Animais</option><option value="batches">Lotes</option><option value="purpose-history">Histórico de classificação</option></select></label>{targetType!=="purpose-history"&&<label>Finalidade<select className="form-select form-select-sm" value={purpose} onChange={event=>{setPurpose(event.target.value);setPage(0);}}><option value="all">Todas</option>{purposeOptions.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label>}</div></>}
      {tab==="transfers"&&<div className={styles.sectionHeading}><p>Transferências com prévia, origem e destino confirmados na mesma operação.</p>{manager&&<div className={styles.controls}><button className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={()=>void movePasture()}>Mudar lote de pasto</button><button className="btn btn-success btn-sm" disabled={saving} onClick={()=>void newTransfer()}><Plus size={16}/> Nova transferência</button></div>}</div>}
      {tab==="occurrences"&&<div className={styles.sectionHeading}><div className={styles.controls}><label>Situação<select className="form-select form-select-sm" value={occurrenceStatus} onChange={event=>{setOccurrenceStatus(event.target.value);setPage(0);}}><option value="open">Pendentes</option><option value="done">Resolvidas</option><option value="all">Todas</option></select></label><Link href="/home/agenda">Abrir agenda</Link></div>{canWrite&&<button className="btn btn-success btn-sm" disabled={saving} onClick={()=>void newOccurrence()}><Plus size={16}/> Registrar ocorrência</button>}</div>}
      {tab==="protocols"&&<div className={styles.sectionHeading}><label>Visualização<select className="form-select form-select-sm" value={protocolView} onChange={event=>{setProtocolView(event.target.value);setPage(0);}}><option value="protocol-runs">Execuções e pendências</option><option value="protocols">Modelos e versões</option></select></label><div className={styles.controls}>{manager&&<button className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={newProtocol}>Novo modelo / versão</button>}{canWrite&&<button className="btn btn-success btn-sm" disabled={saving} onClick={()=>void startProtocol()}>Iniciar protocolo</button>}</div></div>}
      {tab==="import"&&<><h2>Importação assistida de animais</h2><p>CSV com até 500 animais. Datas em AAAA-MM-DD e valores decimais com ponto. A prévia não grava dados; a confirmação valida novamente todas as linhas.</p><button className="btn btn-outline-secondary btn-sm" onClick={downloadTemplate}><Download size={16}/> Baixar modelo</button><label className="d-block mt-3">Planilha CSV<input className="form-control mt-1" type="file" accept=".csv,text/csv" disabled={saving} onChange={event=>void fileSelected(event.target.files?.[0])}/></label><div className={styles.controls}><span>{importRows.length} animais no arquivo</span><button className="btn btn-outline-success btn-sm" disabled={saving||!importRows.length||!farm} onClick={()=>void previewImport()}>Conferir prévia</button><button className="btn btn-success btn-sm" disabled={saving||!preview.length||preview.some(row=>!row.valid)} onClick={()=>void confirmImport()}><Check size={16}/> Confirmar importação</button></div>{preview.length>0&&<DataTable rows={preview.map(row=>({...row,id:String(row.line),identifier:row.data.identifier,result:row.valid?"Pronta":JSON.stringify(row.errors)}))} columns={[{key:"line",label:"Linha"},{key:"identifier",label:"Brinco"},{key:"result",label:"Validação"}]} rowKey="id"/>}</>}
      {["milk-trends","costs"].includes(tab)&&<><div className={styles.controls}><label>Início<input className="form-control form-control-sm" type="date" value={start} max={end} onChange={event=>setStart(event.target.value)}/></label><label>Fim<input className="form-control form-control-sm" type="date" value={end} min={start} max={milkToday()} onChange={event=>setEnd(event.target.value)}/></label>{tab==="milk-trends"?<><label>Buscar vaca<input className="form-control form-control-sm" value={animalSearch} placeholder="Brinco ou nome" onChange={event=>setAnimalSearch(event.target.value)}/></label><label>Animal<select className="form-select form-select-sm" value={animal} onChange={event=>setAnimal(event.target.value)}><option value="">Toda a produção</option>{animalOptions.map(row=><option key={row.id} value={row.id}>{row.identifier} · {row.name}</option>)}</select></label><label>Alerta de queda (%)<input className="form-control form-control-sm" type="number" min="1" max="100" value={drop} onChange={event=>setDrop(event.target.value)}/></label></>:<><label>Lote<select className="form-select form-select-sm" value={costBatch} onChange={event=>setCostBatch(event.target.value)}><option value="">Todos</option>{batchOptions.map(row=><option key={row.id} value={row.id}>{row.batch_code}</option>)}</select></label><label>Finalidade<select className="form-select form-select-sm" value={costPurpose} onChange={event=>setCostPurpose(event.target.value)}><option value="all">Todas</option>{purposeOptions.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label></>}</div>
      {tab==="milk-trends"&&trend&&<><p className="small text-muted-foreground mt-3">{trend.note}</p>{trend.drop_alert&&<div role="status" className="alert alert-warning">{trend.drop_alert.text} Queda: {milkNumber(trend.drop_alert.drop_percent)}% em {date(trend.drop_alert.date)}.</div>}<div className={styles.metrics}><article><span>Volume no período</span><strong>{milkNumber(trend.produced)} L</strong></article><article><span>Dias com registros</span><strong>{trend.days_with_records}</strong></article>{trend.sessions.map(row=><article key={row.session}><span>{{morning:"Manhã",afternoon:"Tarde",evening:"Noite"}[row.session]||row.session}</span><strong>{milkNumber(row.liters)} L</strong></article>)}</div><MilkTrendChart series={trend.series}/><DataTable rows={trend.series.map(row=>({...row,id:row.date}))} rowKey="id" columns={[{key:"date",label:"Data",render:date},{key:"produced",label:"Produção (L)",render:value=>milkNumber(String(value))},{key:"discarded",label:"Descarte (L)",render:value=>milkNumber(String(value))},{key:"usable",label:"Aproveitável (L)",render:value=>milkNumber(String(value))},{key:"milked_cows",label:"Vacas ordenhadas",render:value=>value==null?"Não informado no total":String(value)}]}/></>}
      {tab==="costs"&&manager&&costs&&<><p className="small text-muted-foreground mt-3">{costs.note}</p><div className={styles.metrics}><article><span>Custos operacionais conhecidos</span><strong>R$ {milkNumber(costs.operational_total)}</strong></article><article><span>Despesas por vencimento · separadas</span><strong>R$ {milkNumber(costs.expenses_by_due_date)}</strong></article><article><span>Origens sem custo conhecido</span><strong>{costs.missing_cost_count}</strong></article></div><DataTable rows={costs.entries} rowKey="id" title="Custos operacionais por origem" columns={[{key:"date",label:"Data",render:date},{key:"source",label:"Origem",render:value=>({feed:"Alimentação",sanitary:"Manejo sanitário",health:"Tratamento individual",vaccine:"Vacinação",semen:"Sêmen / reprodução"})[String(value)]||String(value)},{key:"description",label:"Descrição"},{key:"amount",label:"Custo (R$)",render:value=>value==null?"Pendente de apuração":milkNumber(String(value))},{key:"reference",label:"Referência de origem",render:value=><span className="small">{String(value||"—")}</span>}]}/><h3 className="h6 mt-4">Despesas financeiras · não somadas novamente</h3><DataTable rows={costs.expenses} rowKey="id" title="Despesas financeiras por vencimento" columns={[{key:"date",label:"Vencimento",render:date},{key:"description",label:"Descrição"},{key:"amount",label:"Valor (R$)",render:value=>milkNumber(String(value))},{key:"status",label:"Situação",render:value=>({pending:"Pendente",paid:"Paga",overdue:"Vencida",partial:"Parcial"})[String(value)]||String(value)},{key:"reference",label:"Lote / apropriação"}]}/></>}
      </>}
      {loading&&<p role="status" className="small text-muted-foreground">Carregando…</p>}
      {!["import","milk-trends","costs"].includes(tab)&&<DataTable key={`${tab}-${targetType}-${protocolView}`} rows={rows} rowKey="id" title={tab==="classification" ? targetType==="purpose-history" ? "Histórico de classificação" : targetType==="animals" ? "Animais por finalidade" : "Lotes por finalidade" : tab==="transfers" ? "Transferências registradas" : tab==="occurrences" ? "Ocorrências" : "Protocolos reprodutivos"} columns={columns} searchValue={tab==="classification"&&targetType!=="purpose-history"?search:undefined} onSearchChange={tab==="classification"&&targetType!=="purpose-history" ? value=>{setSearch(value);setPage(0);} : undefined} searchPlaceholder="Buscar brinco, nome ou lote…" pagination={{page,pageSize:10,total:count,onPageChange:setPage,onPageSizeChange:()=>{}}} pageSizeOptions={[10]} selectable={tab==="classification"&&targetType!=="purpose-history"&&manager} batchActions={tab==="classification"&&manager&&targetType!=="purpose-history"?[{label:"Classificar selecionados",onClick:classify}]:undefined} actions={tab==="classification"&&manager&&targetType!=="purpose-history"?[{label:"Alterar finalidade",onClick:row=>classify([row])}]:tab==="occurrences"&&canWrite?[{label:"Resolver ocorrência",onClick:resolve,shouldShow:row=>!row.resolved_at}]:[]} emptyText={loading?"Carregando…":"Nenhum registro encontrado."}/>}
    </section>
    <div className={styles.controls}><Link className="btn btn-outline-secondary btn-sm" href={cattleHref("/home/seguimento/gado-de-corte/manejos", production)}>Manejo sanitário coletivo</Link><Link className="btn btn-outline-secondary btn-sm" href="/home/seguimento/pecuaria-leiteira/leite">Lançar produção de leite</Link><Link className="contextual-back-button" href={cattleHome(production)}><ArrowLeft size={18}/> Voltar para {production === "dairy" ? "Pecuária leiteira" : "Gado de corte"}</Link></div>
    {form&&<CattleForm spec={form} onClose={()=>setForm(null)} onSaved={saved}/>}
    {review&&<Modal isOpen title="Conferir transferência" description="Origem e destino serão atualizados juntos." onClose={()=>{if(!saving)setReview(null);}}><div className="p-3"><p><strong>{String(review.snapshot.source_code)}</strong> → <strong>{String(review.snapshot.destination_code)}</strong></p><p>Quantidade: {String(review.snapshot.quantity)} animais</p><p>Origem: {String(review.snapshot.source_before ?? "—")} → {String(review.snapshot.source_after ?? "—")}</p><p>Destino: {String(review.snapshot.destination_before ?? "—")} → {String(review.snapshot.destination_after ?? "—")}</p><p>{String(review.snapshot.reason)}</p>{error&&<p role="alert" className="text-danger">{error}</p>}<button className="btn btn-success" disabled={saving} onClick={async()=>{setSaving(true);setError("");try{await service.command(review.data.operation === "move-pasture" ? "move-pasture" : "transfers",{...review.data,preview:false});setReview(null);setNotice("Transferência concluída sem duplicar o efetivo.");refresh();}catch(error){setError(cattleError(error));}finally{setSaving(false);}}}>Confirmar transferência</button></div></Modal>}
  </div>;
}

export function MilkTrendChart({series}:{series:MilkTrend["series"]}) {
  if(!series.length)return <p className="text-muted-foreground">Sem produção registrada neste período.</p>;
  const max=Math.max(...series.map(row=>Number(row.produced)),1);
  const points=series.map((row,index)=>`${40+index/Math.max(series.length-1,1)*620},${190-Number(row.produced)/max*160}`).join(" ");
  return <figure className={styles.chart}><svg viewBox="0 0 700 230" role="img" aria-label="Evolução do volume de leite nos dias com produção registrada"><line x1="40" y1="190" x2="660" y2="190" stroke="var(--border)"/><polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3"/>{series.map((row,index)=><circle key={row.date} cx={40+index/Math.max(series.length-1,1)*620} cy={190-Number(row.produced)/max*160} r="3" fill="var(--primary)"><title>{date(row.date)} · {milkNumber(row.produced)} L</title></circle>)}<text x="40" y="215" fill="var(--muted-foreground)" fontSize="12">{date(series[0].date)}</text><text x="660" y="215" textAnchor="end" fill="var(--muted-foreground)" fontSize="12">{date(series[series.length-1].date)}</text><text x="40" y="18" fill="var(--muted-foreground)" fontSize="12">Máximo: {milkNumber(max)} L</text></svg><figcaption>Volume registrado por dia · consulte os valores detalhados na tabela.</figcaption></figure>;
}
