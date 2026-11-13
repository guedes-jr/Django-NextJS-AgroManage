"use client";
import { useOrganizationLocale } from "@/lib/locale";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cattleHome, cattleHref, type CattleProduction } from "@/services/cattleNavigation";
import { ArrowLeft, Plus, RefreshCw, ClipboardList, ArrowRightLeft, Bell, FileUp, ListChecks, Milk, ChartNoAxesCombined, Download, Check } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import { cattleService, cattleError, type CattleAnimal, type CattleBatch } from "@/services/cattleService";
import { cattleOperations as service, parseAnimalCSV, type OperationRow, type MilkTrend, type CostReport } from "@/services/cattleOperationsService";
import { milkToday, milkNumber } from "@/services/milkProductionService";
import styles from "./cattle-operations.module.css";


const date = (value: unknown, language = "pt-BR") => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString(language) : "—";
const ids = (rows: OperationRow[]) => rows.map(row => row.id);

export function CattleOperationsWorkspace({ initialTab = "classification", production = "beef" }: { initialTab?: string; production?: CattleProduction }) {
  const { language, t } = useOrganizationLocale();
const purposeLabels: Record<string, string> = { unknown: t("lotReport.notInformed"), beef: t("workspace.beef"), dairy: t("workspace.milk"), dual: t("workspace.dualPurpose") };
const occurrenceKinds = {animal:t("clinical.animal"),water:t("plantations.operation.water"),fence:"Cerca",pasture:"Pasto",other:t("reproduction.other")};
const purposeOptions = Object.entries(purposeLabels).map(([value,label]) => ({value,label}));

  const tabs = [{id:"classification",label:t("crops.purpose"),icon:ClipboardList},{id:"transfers",label:t("workspace.transfers"),icon:ArrowRightLeft},{id:"occurrences",label:t("workspace.occurrencesLabel"),icon:Bell},{id:"import",label:t("workspace.importAnimals"),icon:FileUp},{id:"protocols",label:t("workspace.protocols"),icon:ListChecks},{id:"milk-trends",label:t("workspace.milkTrends"),icon:Milk},{id:"costs",label:t("workspace.costsBySource"),icon:ChartNoAxesCombined}];
  const access = useOrganizationAccess();
  const manager = !!access && ["admin","manager"].includes(access.role);
  const canWrite = !!access && !access.read_only && ["admin","manager","operator"].includes(access.role);
  const [tab,setTab] = useState(tabs.some(item=>item.id===initialTab)?initialTab:"classification");
  const [farm,setFarm] = useState("");
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
  const [form,setForm] = useState<(CattleFormSpec & { previewOnly?: boolean }) | null>(null);
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
  useEffect(() => { const controller=new AbortController(); cattleService.farms(controller.signal).then(rows => { if(!controller.signal.aborted && rows.length) setFarm(rows[0].id); }).catch(error => {if(!controller.signal.aborted)setError(cattleError(error, language));}); return () => controller.abort(); },[language]);
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
      } catch(error){if(!controller.signal.aborted){setError(cattleError(error, language));setRows([]);setTrend(null);setCosts(null);}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },200);
    return () => {controller.abort();window.clearTimeout(timer);};
  },[tab,targetType,protocolView,farm,page,search,purpose,revision,occurrenceStatus,start,end,drop,animal,manager,costBatch,costPurpose, language]);
  useEffect(() => {
    if(tab!=="milk-trends" && tab!=="costs")return;
    const controller=new AbortController();
    const timer=window.setTimeout(() => {
      if(tab==="milk-trends") cattleService.list<CattleAnimal>("animals",{...(farm?{farm}:{}),search:animalSearch,page_size:20},controller.signal).then(data=>setAnimalOptions(current=>[...data.results,...current.filter(row=>row.id===animal&&!data.results.some(item=>item.id===row.id))])).catch(error=>{if(!controller.signal.aborted)setError(cattleError(error, language));});
      else cattleService.all<CattleBatch>("batches",farm?{farm}:{},controller.signal).then(setBatchOptions).catch(error=>{if(!controller.signal.aborted)setError(cattleError(error, language));});
    },200); return()=>{controller.abort();window.clearTimeout(timer);};
  },[tab,farm,animalSearch,animal, language]);
  useEffect(() => {
    if (!access || manager || !["costs","import","transfers","classification"].includes(tab)) return;
    const timer=window.setTimeout(()=>setTab("occurrences"),0); return()=>window.clearTimeout(timer);
  },[access,manager,tab]);
  const refresh=()=>setRevision(value=>value+1);
  const saved=()=>{setForm(null);if(form?.previewOnly)setNotice(t("workspace.previewReadyForReviewNoMovementHasBeenApplied"));else{setNotice(t("workspace.operationRecordedSuccessfully"));refresh();}};
  const farmRequired=()=>{if(!farm){setError(t("workspace.selectAFarmForThisOperation"));return false;}return true;};
  function classify(selected:OperationRow[]) {
    setForm({title:t("workspace.classifyProductionPurpose"),description:t("workspace.countRecordSSelectedTheChangePreservesHistoryAndDoes", { count: selected.length }) + (targetType === "batches" ? " " + t("workspace.classifyingABatchAlsoClassifiesItsLinkedActiveAnimalsWith") : ""),fields:[{name:"purpose",label:t("crops.purpose"),type:"select",required:true,options:purposeOptions}],save:values=>service.command("classify",{purpose:values.purpose,animals:targetType==="animals"?ids(selected):[],batches:targetType==="batches"?ids(selected):[]})});
  }
  async function newTransfer() {
    if(!farmRequired())return; setSaving(true);setError("");
    try {
      const batches=await cattleService.all<CattleBatch>("batches",{farm,status:"active"});
      const options=batches.map(batch=>({value:batch.id,label:`${batch.batch_code} · ${batch.quantity} animais`}));
      const key=crypto.randomUUID();
      setForm({title:t("workspace.transferAnimalsBetweenBatches"),description:t("workspace.reviewThePreviewBeforeConfirmingTheMovementTakesPlaceToday"),initial:{date:milkToday()},fields:[{name:"source",label:t("poultryReproduction.sourceBatch"),type:"select",required:true,options},{name:"destination",label:t("workspace.destinationBatch"),type:"select",required:true,options},{name:"quantity",label:t("lotReport.quantity"),type:"number",min:"1",step:"1",required:true},{name:"identifiers",label:t("workspace.participatingEarTagsOnePerLineWhenIdentified"),type:"textarea"},{name:"reason",label:t("reproduction.applicationReason"),required:true,maxLength:300}],previewOnly:true,submitLabel:t("workspace.reviewPreview"),save:async values=>{
        const identifiers=values.identifiers.split(/[\n;,]+/).map(value=>value.trim()).filter(Boolean);
        const animals=identifiers.length?await cattleService.all<CattleAnimal>("animals",{farm,batch:values.source,status:"active"}):[];
        const selected=identifiers.map(identifier=>{const animal=animals.find(row=>row.identifier===identifier);if(!animal)throw { response: { data: { identifiers: `Brinco ${identifier} não encontrado na origem.` } } };return animal.id;});
        const data={source:values.source,destination:values.destination,quantity:Number(values.quantity),animals:selected,date:milkToday(),reason:values.reason,request_key:key};
        const snapshot=await service.command<Record<string,unknown>>("transfers",{...data,preview:true});setReview({data:{...data,expected_source:snapshot.source_before,expected_destination:snapshot.destination_before},snapshot});
      }});
    }catch(error){setError(cattleError(error, language));}finally{setSaving(false);}
  }
  async function movePasture() {
    if(!farmRequired())return;setSaving(true);setError("");
    try {
      const [batches,pastures]=await Promise.all([cattleService.all<CattleBatch>("batches",{farm,status:"active"}),cattleService.all<{id:string;name:string}>("pastures",{farm})]);
      const key=crypto.randomUUID();
      setForm({title:t("workspace.moveBatchToAnotherPasture"),description:t("workspace.theCurrentOccupationWillCloseAndTheNewOneWill"),fields:[{name:"batch",label:t("lotReport.batch"),type:"select",required:true,options:batches.map(row=>({value:row.id,label:row.batch_code}))},{name:"pasture",label:t("workspace.destinationPasture"),type:"select",required:true,options:pastures.map(row=>({value:row.id,label:row.name}))},{name:"reason",label:t("reproduction.applicationReason"),required:true,maxLength:300}],previewOnly:true,submitLabel:t("workspace.reviewPreview"),save:async values=>{const data={...values,request_key:key};const snapshot=await service.command<Record<string,unknown>>("move-pasture",{...data,preview:true});setReview({data:{...data,operation:"move-pasture",expected_source:snapshot.source},snapshot});}});
    }catch(error){setError(cattleError(error, language));}finally{setSaving(false);}
  }
  async function newOccurrence() {
    if(!farmRequired())return;setSaving(true);setError("");
    try{
      const members=await service.read<{id:string;full_name:string}[]>("members");
      const animals=await cattleService.all<CattleAnimal>("animals",{farm,status:"active"});
      setForm({title:t("workspace.recordOccurrence"),description:t("workspace.theOccurrenceCreatesATaskInTheOrganizationAgendaWith"),initial:{date:milkToday(),due_date:milkToday(),kind:"other"},fields:[{name:"kind",label:t("plantations.labor.workerType"),type:"select",required:true,options:Object.entries(occurrenceKinds).map(([value,label])=>({value,label}))},{name:"animal",label:t("workspace.animalOptional"),type:"select",options:animals.map(row=>({value:row.id,label:`${row.identifier} · ${row.name||""}`}))},{name:"date",label:t("lotReport.date"),type:"date",required:true,max:milkToday()},{name:"due_date",label:t("workspace.deadline"),type:"date",required:true},{name:"assigned_to",label:t("reproduction.responsible"),type:"select",required:true,options:members.map(row=>({value:row.id,label:row.full_name}))},{name:"description",label:t("lotReport.description"),type:"textarea",required:true,maxLength:1000}],save:values=>service.command("occurrences",{...values,farm,animal:values.animal||null})});
    }catch(error){setError(cattleError(error, language));}finally{setSaving(false);}
  }
  function resolve(row:OperationRow) {setForm({title:t("workspace.resolveOccurrence"),description:String(row.description),fields:[{name:"resolution",label:t("workspace.appliedSolution"),type:"textarea",required:true,maxLength:1000}],save:values=>service.command("resolve-occurrence",{id:row.id,resolution:values.resolution})});}
  function newProtocol(){setForm({title:t("workspace.registerProtocolNewVersion"),description:t("workspace.useTheSameNameToCreateANewVersionPrevious"),fields:[{name:"name",label:t("cattleReproduction.name"),required:true,maxLength:100},{name:"steps",label:t("workspace.stagesDayDescription"),type:"textarea",required:true,maxLength:6000}],save:values=>{
    const steps=values.steps.split(/\n/).filter(line=>line.trim()).map(line=>{const separator=line.indexOf(";");return {day:Number(line.slice(0,separator)),name:line.slice(separator+1).trim()};});return service.command("protocols",{name:values.name,steps});
  }});}
  async function startProtocol(){
    if(!farmRequired())return;setSaving(true);setError("");
    try{
      const [protocols,members,animals]=await Promise.all([service.page("protocols",{page_size:100}),service.read<{id:string;full_name:string}[]>("members"),cattleService.all<CattleAnimal>("animals",{farm,status:"active",gender:"F"})]);
      const key=crypto.randomUUID();
      setForm({title:t("workspace.startReproductiveProtocol"),description:t("workspace.scheduledStagesWillBeAddedToTheAgendaExecutionDoes"),initial:{start_date:milkToday()},fields:[{name:"animal",label:t("swineReproduction.matrix"),type:"select",required:true,options:animals.map(row=>({value:row.id,label:`${row.identifier} · ${row.name||""}`}))},{name:"protocol",label:t("workspace.protocolVersion"),type:"select",required:true,options:protocols.results.map(row=>({value:row.id,label:`${row.name} · v${row.version}`}))},{name:"start_date",label:t("workspace.start"),type:"date",required:true},{name:"assigned_to",label:t("reproduction.responsible"),type:"select",required:true,options:members.map(row=>({value:row.id,label:row.full_name}))}],save:values=>service.command("start-protocol",{...values,request_key:key})});
    }catch(error){setError(cattleError(error, language));}finally{setSaving(false);}
  }
  async function executeStep(step:OperationRow){
    setSaving(true);setError("");try{
      const [lots,matings]=await Promise.all([service.page<{id:string;label:string}>("stock-lots",{category:"semen",page_size:100}),service.page<{id:string;label:string}>("matings",{page_size:100})]);
      setForm({title:t("workspace.executeStageName", { name: String(step.name) }),description:t("workspace.recordTheActualDateIfSemenIsConsumedLinkThe"),initial:{date:milkToday()},fields:[{name:"date",label:t("workspace.executionDate"),type:"date",required:true,max:milkToday()},{name:"inventory_lot",label:t("workspace.semenBatchOptional"),type:"select",options:lots.results.map(row=>({value:row.id,label:row.label}))},{name:"inventory_quantity",label:t("workspace.quantityInStockUnits"),type:"number",min:"0.01",step:"0.01"},{name:"mating",label:t("workspace.linkedMatingOptional"),type:"select",options:matings.results.map(row=>({value:row.id,label:row.label}))},{name:"notes",label:t("reproduction.observations"),type:"textarea",maxLength:1000}],save:values=>service.command("execute-step",{...values,id:step.id})});
    }catch(error){setError(cattleError(error, language));}finally{setSaving(false);}
  }
  async function fileSelected(file?:File){setPreview([]);setImportRows([]);setError("");if(!file)return;try{if(file.size>2*1024*1024)throw new Error(t("workspace.useACsvFileUpTo2Mb"));setImportRows(parseAnimalCSV(await file.text()));}catch(error){setError(error instanceof Error?error.message:t("workspace.invalidSpreadsheet"));}}
  async function previewImport(){if(!farmRequired())return;setSaving(true);setError("");try{const result=await service.command<{rows:typeof preview}>("import-preview",{farm,rows:importRows});setPreview(result.rows);}catch(error){setError(cattleError(error, language));}finally{setSaving(false);}}
  async function confirmImport(){setSaving(true);setError("");try{await service.command("import-confirm",{farm,rows:importRows});setPreview([]);setImportRows([]);setNotice(t("workspace.animalsImportedAnotherAttemptWithTheSameEarTagsWill"));refresh();}catch(error){setError(cattleError(error, language));}finally{setSaving(false);}}
  function downloadTemplate(){const blob=new Blob(["\uFEFFidentifier;name;gender;category;birth_date;entry_date;breed_name_input;initial_weight_kg;cattle_purpose;notes\nEXEMPLO-001;Estrela;F;Vaca;2023-01-01;"+milkToday()+";Girolando;450;dairy;Remova esta linha de exemplo\n"],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download="modelo-animais-bovinos.csv";anchor.click();URL.revokeObjectURL(url);}
  let columns:Column<OperationRow>[]=[];
  if(tab==="classification")columns=targetType==="purpose-history"?[{key:"date",label:t("lotReport.date"),render:value => date(value, language)},{key:"target",label:t("reproduction.animalOrBatch")},{key:"previous",label:t("notifications.previous"),render:value=>purposeLabels[String(value)]},{key:"purpose",label:t("crops.purpose"),render:value=>purposeLabels[String(value)]},{key:"author",label:t("workspace.author")}]:[{key:targetType==="animals"?"identifier":"batch_code",label:t("workspace.earTagBatch")},{key:"name",label:t("cattleReproduction.name")},{key:"farm_name",label:t("dairy.home.farm")},{key:"cattle_purpose",label:t("crops.purpose"),render:value=>purposeLabels[String(value)]||t("lotReport.notInformed")}];
  if(tab==="transfers")columns=[{key:"date",label:t("lotReport.date"),render:value => date(value, language)},{key:"source",label:t("animalDetail.origin")},{key:"destination",label:t("crops.destination")},{key:"quantity",label:t("notifications.category.animal")},{key:"reason",label:t("reproduction.applicationReason")},{key:"author",label:t("reproduction.responsible")}];
  if(tab==="occurrences")columns=[{key:"date",label:t("lotReport.date"),render:value => date(value, language)},{key:"kind",label:t("plantations.labor.workerType"),render:value=>occurrenceKinds[value as keyof typeof occurrenceKinds]},{key:"target",label:t("workspace.locationAnimal")},{key:"description",label:t("lotReport.description")},{key:"assigned_to",label:t("reproduction.responsible")},{key:"due_date",label:t("workspace.deadline"),render:value => date(value, language)},{key:"status",label:t("structure.dedicated.status"),render:value=>({open:t("workspace.openLabel"),in_progress:t("operator.inProgress"),done:t("workspace.resolvedOccurrence"),cancelled:t("plantations.status.cancelled")})[String(value)]||String(value)}];
  if(tab==="protocols")columns=protocolView==="protocols"?[{key:"name",label:t("workspace.protocol")},{key:"version",label:t("workspace.version")},{key:"steps",label:t("workspace.stages"),render:value=><ol className="mb-0">{(value as {name:string;day:number}[]).map((step,i)=><li key={i}>D{step.day} · {step.name}</li>)}</ol>}]:[{key:"animal",label:t("swineReproduction.matrix")},{key:"protocol",label:t("workspace.protocol")},{key:"start_date",label:t("workspace.start"),render:value => date(value, language)},{key:"steps",label:t("workspace.scheduledAndCompletedStages"),render:value=><div className={styles.steps}>{(value as OperationRow[]).map(step=><div key={step.id}><span>{String(step.name)} · {date(step.due_date, language)} · {step.executed_date?`Executada ${date(step.executed_date, language)}`:step.status==="overdue"?t("workspace.overdue"):t("swine.insights.pending")}</span>{canWrite&&!step.executed_date&&<button className="btn btn-outline-success btn-sm" disabled={saving} onClick={()=>void executeStep(step)}>{t("workspace.execute")}</button>}</div>)}</div>}];
  return <div className={styles.workspace}>
    <header className={styles.header}><div><h1>{t("workspace.cattleManagementCenter")}</h1><p>{t("workspace.organizeTheHerdMonitorRoutinesAndCheckIndicatorSources")}</p></div><div className={styles.controls}><button className="btn btn-outline-secondary btn-sm" disabled={loading||saving} onClick={refresh}><RefreshCw size={16}/>  {t("inventory.alerts.refresh")}</button></div></header>
    <nav className={styles.tabs} aria-label={t("workspace.cattleOperations")}>{tabs.filter(item=>manager||!["costs","import","transfers","classification"].includes(item.id)).map(({id,label,icon:Icon})=><button className="btn btn-sm" aria-current={tab===id?"page":undefined} disabled={saving} key={id} onClick={()=>{setTab(id);setPage(0);setRows([]);setCount(0);setError("");setNotice("");}}><Icon size={17}/>{label}</button>)}</nav>
    {saving&&!form&&!review&&<p role="status" className="small text-muted-foreground">{t("workspace.preparingOperation")}</p>}
    {error&&<div role="alert" className="alert alert-danger">{error}</div>}{notice&&<div role="status" className="alert alert-success">{notice}</div>}
    <section className={styles.panel}>
      {tab==="classification"&&<><p>{t("workspace.purposeDefinesTheSegmentLactationAndAptitudeAreIndependentDual")}</p><div className={styles.controls}><label>{t("workspace.records")}<select className="form-select form-select-sm" value={targetType} onChange={event=>{setTargetType(event.target.value);setPage(0);}}><option value="animals">{t("notifications.category.animal")}</option><option value="batches">{t("lotReport.batches")}</option><option value="purpose-history">{t("workspace.classificationHistory")}</option></select></label>{targetType!=="purpose-history"&&<label>{t("crops.purpose")}<select className="form-select form-select-sm" value={purpose} onChange={event=>{setPurpose(event.target.value);setPage(0);}}><option value="all">{t("notifications.all")}</option>{purposeOptions.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label>}</div></>}
      {tab==="transfers"&&<div className={styles.sectionHeading}><p>{t("workspace.transfersWithPreviewSourceAndDestinationConfirmedInTheSame")}</p>{manager&&<div className={styles.controls}><button className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={()=>void movePasture()}>{t("workspace.moveBatchToAnotherPasture")}</button><button className="btn btn-success btn-sm" disabled={saving} onClick={()=>void newTransfer()}><Plus size={16}/>  {t("workspace.newTransfer")}</button></div>}</div>}
      {tab==="occurrences"&&<div className={styles.sectionHeading}><div className={styles.controls}><label>{t("structure.dedicated.status")}<select className="form-select form-select-sm" value={occurrenceStatus} onChange={event=>{setOccurrenceStatus(event.target.value);setPage(0);}}><option value="open">{t("inventory.alerts.pending")}</option><option value="done">{t("workspace.resolvedLabel")}</option><option value="all">{t("notifications.all")}</option></select></label><Link href="/home/agenda">{t("workspace.openAgenda")}</Link></div>{canWrite&&<button className="btn btn-success btn-sm" disabled={saving} onClick={()=>void newOccurrence()}><Plus size={16}/>  {t("workspace.recordOccurrence")}</button>}</div>}
      {tab==="protocols"&&<div className={styles.sectionHeading}><label>{t("workspace.view")}<select className="form-select form-select-sm" value={protocolView} onChange={event=>{setProtocolView(event.target.value);setPage(0);}}><option value="protocol-runs">{t("workspace.runsAndPendingStages")}</option><option value="protocols">{t("workspace.templatesAndVersions")}</option></select></label><div className={styles.controls}>{manager&&<button className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={newProtocol}>{t("workspace.newTemplateVersion")}</button>}{canWrite&&<button className="btn btn-success btn-sm" disabled={saving} onClick={()=>void startProtocol()}>{t("workspace.startProtocol")}</button>}</div></div>}
      {tab==="import"&&<><h2>{t("workspace.assistedAnimalImport")}</h2><p>{t("workspace.csvWithUpTo500AnimalsUseYyyyMmDd")}</p><button className="btn btn-outline-secondary btn-sm" onClick={downloadTemplate}><Download size={16}/>  {t("workspace.downloadTemplate")}</button><label className="d-block mt-3">{t("workspace.csvSpreadsheet")}<input className="form-control mt-1" type="file" accept=".csv,text/csv" disabled={saving} onChange={event=>void fileSelected(event.target.files?.[0])}/></label><div className={styles.controls}><span>{importRows.length}  {t("workspace.animalsInTheFile")}</span><button className="btn btn-outline-success btn-sm" disabled={saving||!importRows.length||!farm} onClick={()=>void previewImport()}>{t("workspace.reviewPreview")}</button><button className="btn btn-success btn-sm" disabled={saving||!preview.length||preview.some(row=>!row.valid)} onClick={()=>void confirmImport()}><Check size={16}/>  {t("workspace.confirmImport")}</button></div>{preview.length>0&&<DataTable rows={preview.map(row=>({...row,id:String(row.line),identifier:row.data.identifier,result:row.valid?"Pronta":JSON.stringify(row.errors)}))} columns={[{key:"line",label:t("workspace.line")},{key:"identifier",label:t("cattleReproduction.tag")},{key:"result",label:t("workspace.validation")}]} rowKey="id"/>}</>}
      {["milk-trends","costs"].includes(tab)&&<><div className={styles.controls}><label>{t("workspace.start")}<input className="form-control form-control-sm" type="date" value={start} max={end} onChange={event=>setStart(event.target.value)}/></label><label>{t("workspace.end")}<input className="form-control form-control-sm" type="date" value={end} min={start} max={milkToday()} onChange={event=>setEnd(event.target.value)}/></label>{tab==="milk-trends"?<><label>{t("workspace.searchCow")}<input className="form-control form-control-sm" value={animalSearch} placeholder={t("workspace.earTagOrName")} onChange={event=>setAnimalSearch(event.target.value)}/></label><label>{t("clinical.animal")}<select className="form-select form-select-sm" value={animal} onChange={event=>setAnimal(event.target.value)}><option value="">{t("workspace.allProduction")}</option>{animalOptions.map(row=><option key={row.id} value={row.id}>{row.identifier} · {row.name}</option>)}</select></label><label>{t("workspace.dropAlert")}<input className="form-control form-control-sm" type="number" min="1" max="100" value={drop} onChange={event=>setDrop(event.target.value)}/></label></>:<><label>{t("lotReport.batch")}<select className="form-select form-select-sm" value={costBatch} onChange={event=>setCostBatch(event.target.value)}><option value="">{t("crops.allFields")}</option>{batchOptions.map(row=><option key={row.id} value={row.id}>{row.batch_code}</option>)}</select></label><label>{t("crops.purpose")}<select className="form-select form-select-sm" value={costPurpose} onChange={event=>setCostPurpose(event.target.value)}><option value="all">{t("notifications.all")}</option>{purposeOptions.map(row=><option key={row.value} value={row.value}>{row.label}</option>)}</select></label></>}</div>
      {tab==="milk-trends"&&trend&&<><p className="small text-muted-foreground mt-3">{trend.note}</p>{trend.drop_alert&&<div role="status" className="alert alert-warning">{trend.drop_alert.text}  {t("workspace.drop")} {milkNumber(trend.drop_alert.drop_percent, language)}{t("workspace.on")} {date(trend.drop_alert.date, language)}.</div>}<div className={styles.metrics}><article><span>{t("workspace.volumeInPeriod")}</span><strong>{milkNumber(trend.produced, language)} L</strong></article><article><span>{t("workspace.daysWithRecords")}</span><strong>{trend.days_with_records}</strong></article>{trend.sessions.map(row=><article key={row.session}><span>{{morning:t("workspace.morningLabel"),afternoon:"Tarde",evening:"Noite"}[row.session]||row.session}</span><strong>{milkNumber(row.liters, language)} L</strong></article>)}</div><MilkTrendChart series={trend.series}/><DataTable rows={trend.series.map(row=>({...row,id:row.date}))} rowKey="id" columns={[{key:"date",label:t("lotReport.date"),render:value => date(value, language)},{key:"produced",label:t("workspace.productionL"),render:value=>milkNumber(String(value), language)},{key:"discarded",label:t("workspace.discardedL"),render:value=>milkNumber(String(value), language)},{key:"usable",label:t("workspace.usableL"),render:value=>milkNumber(String(value), language)},{key:"milked_cows",label:t("workspace.milkedCows"),render:value=>value==null?t("workspace.notReportedInTotals"):String(value)}]}/></>}
      {tab==="costs"&&manager&&costs&&<><p className="small text-muted-foreground mt-3">{costs.note}</p><div className={styles.metrics}><article><span>{t("workspace.knownOperationalCosts")}</span><strong>R$ {milkNumber(costs.operational_total, language)}</strong></article><article><span>{t("workspace.expensesByDueDateSeparate")}</span><strong>R$ {milkNumber(costs.expenses_by_due_date, language)}</strong></article><article><span>{t("workspace.sourcesWithoutKnownCost")}</span><strong>{costs.missing_cost_count}</strong></article></div><DataTable rows={costs.entries} rowKey="id" title={t("workspace.operationalCostsBySource")} columns={[{key:"date",label:t("lotReport.date"),render:value => date(value, language)},{key:"source",label:t("animalDetail.origin"),render:value=>({feed:t("animalDetail.feed"),sanitary:t("workspace.healthManagement"),health:t("workspace.individualTreatment"),vaccine:t("swineReproduction.vaccination"),semen:t("workspace.semenReproduction")})[String(value)]||String(value)},{key:"description",label:t("lotReport.description")},{key:"amount",label:t("workspace.costR"),render:value=>value==null?t("workspace.pendingCalculation"):milkNumber(String(value), language)},{key:"reference",label:t("workspace.sourceReference"),render:value=><span className="small">{String(value||"—")}</span>}]}/><h3 className="h6 mt-4">{t("workspace.financialExpensesNotCountedAgain")}</h3><DataTable rows={costs.expenses} rowKey="id" title={t("workspace.financialExpensesByDueDate")} columns={[{key:"date",label:t("clinical.expiry"),render:value => date(value, language)},{key:"description",label:t("lotReport.description")},{key:"amount",label:t("workspace.amountR"),render:value=>milkNumber(String(value), language)},{key:"status",label:t("structure.dedicated.status"),render:value=>({pending:t("swine.insights.pending"),paid:t("workspace.paid"),overdue:t("workspace.overdueLabel"),partial:t("workspace.partial")})[String(value)]||String(value)},{key:"reference",label:t("workspace.batchAllocation")}]}/></>}
      </>}
      {loading&&<p role="status" className="small text-muted-foreground">{t("inventory.adjustment.loading")}</p>}
      {!["import","milk-trends","costs"].includes(tab)&&<DataTable key={`${tab}-${targetType}-${protocolView}`} rows={rows} rowKey="id" title={tab==="classification" ? targetType==="purpose-history" ? t("workspace.classificationHistory") : targetType==="animals" ? "Animais por finalidade" : "Lotes por finalidade" : tab==="transfers" ? "Transferências registradas" : tab==="occurrences" ? t("workspace.occurrencesLabel") : "Protocolos reprodutivos"} columns={columns} searchValue={tab==="classification"&&targetType!=="purpose-history"?search:undefined} onSearchChange={tab==="classification"&&targetType!=="purpose-history" ? value=>{setSearch(value);setPage(0);} : undefined} searchPlaceholder={t("workspace.searchEarTagNameOrBatch")} pagination={{page,pageSize:10,total:count,onPageChange:setPage,onPageSizeChange:()=>{}}} pageSizeOptions={[10]} selectable={tab==="classification"&&targetType!=="purpose-history"&&manager} batchActions={tab==="classification"&&manager&&targetType!=="purpose-history"?[{label:t("workspace.classifySelected"),onClick:classify}]:undefined} actions={tab==="classification"&&manager&&targetType!=="purpose-history"?[{label:t("workspace.changePurpose"),onClick:row=>classify([row])}]:tab==="occurrences"&&canWrite?[{label:t("workspace.resolveOccurrence"),onClick:resolve,shouldShow:row=>!row.resolved_at}]:[]} emptyText={loading?t("inventory.adjustment.loading"):t("inventory.movements.noRecords")}/>}
    </section>
    <div className={styles.controls}><Link className="btn btn-outline-secondary btn-sm" href={cattleHref("/home/seguimento/gado-de-corte/manejos", production)}>{t("workspace.groupHealthManagement")}</Link><Link className="btn btn-outline-secondary btn-sm" href="/home/seguimento/pecuaria-leiteira/leite">{t("workspace.recordMilkProduction")}</Link><Link className="contextual-back-button" href={cattleHome(production)}><ArrowLeft size={18}/>  {t("workspace.backTo")} {production === "dairy" ? t("cattleReproduction.dairy") : t("cattleReproduction.beef")}</Link></div>
    {form&&<CattleForm spec={form} onClose={()=>setForm(null)} onSaved={saved}/>}
    {review&&<Modal isOpen title={t("workspace.reviewTransfer")} description={t("workspace.sourceAndDestinationWillBeUpdatedTogether")} onClose={()=>{if(!saving)setReview(null);}}><div className="p-3"><p><strong>{String(review.snapshot.source_code)}</strong> → <strong>{String(review.snapshot.destination_code)}</strong></p><p>{t("workspace.quantityLabel")} {String(review.snapshot.quantity)}  {t("swine.animals")}</p><p>{t("workspace.sourceLabel")} {String(review.snapshot.source_before ?? "—")} → {String(review.snapshot.source_after ?? "—")}</p><p>{t("workspace.destinationLabel")} {String(review.snapshot.destination_before ?? "—")} → {String(review.snapshot.destination_after ?? "—")}</p><p>{String(review.snapshot.reason)}</p>{error&&<p role="alert" className="text-danger">{error}</p>}<button className="btn btn-success" disabled={saving} onClick={async()=>{setSaving(true);setError("");try{await service.command(review.data.operation === "move-pasture" ? "move-pasture" : "transfers",{...review.data,preview:false});setReview(null);setNotice(t("workspace.transferCompletedWithoutDuplicatingHerdCounts"));refresh();}catch(error){setError(cattleError(error, language));}finally{setSaving(false);}}}>{t("workspace.confirmTransfer")}</button></div></Modal>}
  </div>;
}

export function MilkTrendChart({series}:{series:MilkTrend["series"]}) {
  const { language, t } = useOrganizationLocale();
  if(!series.length)return <p className="text-muted-foreground">{t("workspace.noProductionRecordedInThisPeriod")}</p>;
  const max=Math.max(...series.map(row=>Number(row.produced)),1);
  const points=series.map((row,index)=>`${40+index/Math.max(series.length-1,1)*620},${190-Number(row.produced)/max*160}`).join(" ");
  return <figure className={styles.chart}><svg viewBox="0 0 700 230" role="img" aria-label={t("workspace.milkVolumeTrendsOnDaysWithRecordedProduction")}><line x1="40" y1="190" x2="660" y2="190" stroke="var(--border)"/><polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3"/>{series.map((row,index)=><circle key={row.date} cx={40+index/Math.max(series.length-1,1)*620} cy={190-Number(row.produced)/max*160} r="3" fill="var(--primary)"><title>{date(row.date, language)} · {milkNumber(row.produced, language)} L</title></circle>)}<text x="40" y="215" fill="var(--muted-foreground)" fontSize="12">{date(series[0].date, language)}</text><text x="660" y="215" textAnchor="end" fill="var(--muted-foreground)" fontSize="12">{date(series[series.length-1].date, language)}</text><text x="40" y="18" fill="var(--muted-foreground)" fontSize="12">{t("workspace.maximum")} {milkNumber(max, language)} L</text></svg><figcaption>{t("workspace.volumeRecordedPerDaySeeDetailedValuesInTheTable")}</figcaption></figure>;
}
