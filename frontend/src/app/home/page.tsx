"use client";

import "@/components/dashboard/dashboard.css";
import OperatorDashboard, {type OperationalDashboardData} from "@/components/dashboard/OperatorDashboard";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Beef, Building2, CalendarDays, CircleDollarSign, Package, PiggyBank, Sprout, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { apiClient } from "@/services/api";
import { useOrganizationLocale } from "@/lib/locale";

interface User { id:string; email:string; full_name:string; role:string }
interface DashboardKpis { month_revenue:number; month_expense:number; total_animals:number; planted_area_ha:number; inventory_items:number; total_inventory_value:number; low_stock_items:number; farms_count:number }
interface Breakdown { name:string; value:number }
interface Segment { cost:number; revenue:number; profit:number; margin:number; cost_breakdown:Breakdown[]; revenue_breakdown:Breakdown[] }
interface TaskItem { title:string; due_date:string|null; priority:string; status:string; farm:string|null }
interface RecentItem { title:string; date:string; type:"revenue"|"expense"; amount:number; category:string }
interface RevenueItem { mes:string; receita:number; despesa:number }
interface LivestockSegment extends Segment { code:string; name:string }
interface DashboardData { mode?: "operational"; operational?: OperationalDashboardData["operational"]; access?: OperationalDashboardData["access"]; organization:string|null; period:{type:"month"|"year";start:string;end:string}; kpis:DashboardKpis; charts:{ revenue_vs_expense:RevenueItem[]; herd_by_species?:Breakdown[] }; segments:{ crops:Segment; livestock:Segment; livestock_by_species?:LivestockSegment[] }; recent_activities:RecentItem[]; tasks:TaskItem[] }

const EMPTY_KPIS:DashboardKpis={month_revenue:0,month_expense:0,total_animals:0,planted_area_ha:0,inventory_items:0,total_inventory_value:0,low_stock_items:0,farms_count:0};
const EMPTY_SEGMENT:Segment={cost:0,revenue:0,profit:0,margin:0,cost_breakdown:[],revenue_breakdown:[]};
const COLORS=["var(--chart-1)","var(--chart-4)","var(--chart-3)","var(--chart-5)","var(--chart-2)"];
const subscribeToHydration=()=>()=>undefined;

function Skeleton(){return <div className="org-dashboard-skeleton"><span/><div>{[0,1,2,3].map(i=><i key={i}/>)}</div><b/></div>}

function FinanceChart({title,subtitle,data}:{title:string;subtitle:string;data:Breakdown[]}){
  const {language,t}=useOrganizationLocale();
  const money=useMemo(()=>new Intl.NumberFormat(language,{style:"currency",currency:"BRL"}),[language]);
  const colored=useMemo(()=>data.map((item,index)=>({...item,color:COLORS[index%COLORS.length]})),[data]);
  return <div className="org-finance-chart"><div className="org-finance-chart-title"><strong>{title}</strong><small>{subtitle}</small></div>
    {!colored.length?<div className="org-empty-finance"><CircleDollarSign size={25}/><span>{t("dashboard.noEntries")}</span></div>:<div className="org-donut-layout"><div className="org-donut"><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={145}><PieChart><Pie data={colored} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={2}>{colored.map(item=><Cell key={item.name} fill={item.color} stroke="var(--card)" strokeWidth={2}/>)}</Pie><Tooltip formatter={value=>money.format(Number(value))} contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}/></PieChart></ResponsiveContainer></div><div className="org-chart-legend">{colored.slice(0,5).map(item=><span key={item.name}><i style={{background:item.color}}/><b>{item.name}</b><small>{money.format(item.value)}</small></span>)}</div></div>}
  </div>;
}

function SegmentCard({type,title,segment}:{type:"agriculture"|"livestock";title:string;segment:Segment}){
  const {language,t}=useOrganizationLocale();
  const money=useMemo(()=>new Intl.NumberFormat(language,{style:"currency",currency:"BRL"}),[language]);
  const percentage=useMemo(()=>new Intl.NumberFormat(language,{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2}),[language]);
  const Icon=type==="agriculture"?Sprout:Beef;
  return <article className={`org-segment ${type}`}><header><span><Icon size={21}/>{title}</span></header><div className="org-segment-stats">
    <div><small>{t("dashboard.totalCost")}</small><strong>{money.format(segment.cost)}</strong></div><div><small>{t("dashboard.totalRevenue")}</small><strong>{money.format(segment.revenue)}</strong></div><div><small>{t("dashboard.result")}</small><strong className={segment.profit<0?"negative":"positive"}>{money.format(segment.profit)}</strong></div><div><small>{t("dashboard.margin")}</small><strong className={segment.margin<0?"negative":"positive"}>{percentage.format(segment.margin/100)}</strong></div>
  </div><div className="org-segment-charts"><FinanceChart title={t("dashboard.costByActivity")} subtitle={t("dashboard.costComposition")} data={segment.cost_breakdown}/><FinanceChart title={t("dashboard.revenueByActivity")} subtitle={t("dashboard.revenueOrigin")} data={segment.revenue_breakdown}/></div></article>;
}

export default function HomePage(){
  const {language,t}=useOrganizationLocale();
  const [periodType,setPeriodType]=useState<"month"|"year">("month");
  const [periodValue,setPeriodValue]=useState(()=>new Date().toISOString().slice(0,7));
  const availableYears=useMemo(()=>Array.from({length:6},(_,index)=>String(new Date().getFullYear()-index)),[]);
  const fmt=useMemo(()=>new Intl.NumberFormat(language),[language]);
  const money=useMemo(()=>new Intl.NumberFormat(language,{style:"currency",currency:"BRL"}),[language]);
  const percent=useMemo(()=>new Intl.NumberFormat(language,{style:"percent",minimumFractionDigits:1,maximumFractionDigits:1}),[language]);
  const router=useRouter(); const [user,setUser]=useState<User|null>(null); const [dashboard,setDashboard]=useState<DashboardData|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const isClient=useSyncExternalStore(subscribeToHydration,()=>true,()=>false);
  const loadDashboard=useCallback(async(silent=false)=>{try{const response=await apiClient.get<DashboardData>("/reports/dashboard/",{params:{_t:Date.now(),period:periodType,period_value:periodType==="month"?periodValue:periodValue.slice(0,4)}});setDashboard(response.data);setError(null)}catch{if(!silent)setError(t("dashboard.loadError"))}finally{if(!silent)setLoading(false)}},[periodType,periodValue,t]);
  useEffect(()=>{const stored=localStorage.getItem("user");if(stored){try{queueMicrotask(()=>setUser(JSON.parse(stored)))}catch{localStorage.removeItem("user")}}else apiClient.get("/auth/me/").then(r=>{setUser(r.data);localStorage.setItem("user",JSON.stringify(r.data))}).catch(()=>router.push("/login"))},[router]);
  useEffect(()=>{queueMicrotask(()=>void loadDashboard());const refresh=()=>{if(document.visibilityState==="visible")void loadDashboard(true)};const interval=window.setInterval(refresh,15000);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);return()=>{window.clearInterval(interval);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)}},[loadDashboard]);
  if(loading)return <Skeleton/>;
  const kpis=dashboard?.kpis??EMPTY_KPIS; const balance=kpis.month_revenue-kpis.month_expense; const margin=kpis.month_revenue?balance/kpis.month_revenue*100:0; const revenueData=dashboard?.charts?.revenue_vs_expense??[]; const previous=revenueData.length>1?revenueData.at(-2):undefined; const current=revenueData.at(-1); const revenueTrend=previous?.receita?((current?.receita??0)-previous.receita)/previous.receita*100:0; const userName=user?.full_name?.split(" ")[0]||t("dashboard.defaultUserName");
  const livestockSegments=dashboard?.segments?.livestock_by_species?.length?dashboard.segments.livestock_by_species:[{code:"suinos",name:t("sidebar.swine"),...(dashboard?.segments?.livestock??EMPTY_SEGMENT)}];
  const periodLabel=isClient?(periodType==="year"?`${t("dashboard.year")} ${periodValue.slice(0,4)}`:new Date(`${periodValue}-01T12:00:00`).toLocaleDateString(language,{month:"long",year:"numeric"})):t("dashboard.selectedPeriod");
  const segmentCost=(dashboard?.segments?.crops?.cost??0)+(dashboard?.segments?.livestock?.cost??0);
  const metrics=[{label:t("dashboard.segmentCosts"),value:money.format(segmentCost),note:t("dashboard.segmentCostsNote"),icon:Wallet,tone:"green"},{label:t("dashboard.financialExpenses"),value:money.format(kpis.month_expense),note:t("dashboard.expensesNote").replace("{period}",periodType==="year"?t("dashboard.year").toLowerCase():t("dashboard.month").toLowerCase()),icon:Wallet,tone:"green"},{label:t("dashboard.receivedRevenue"),value:money.format(kpis.month_revenue),note:`${revenueTrend>=0?"▲":"▼"} ${percent.format(Math.abs(revenueTrend)/100)} ${t("dashboard.previousPeriod")}`,icon:CircleDollarSign,tone:"blue",positive:revenueTrend>=0},{label:t("dashboard.financialBalance"),value:money.format(balance),note:balance>=0?t("dashboard.incomeLessExpenses"):t("dashboard.expensesExceedIncome"),icon:balance>=0?TrendingUp:TrendingDown,tone:"orange",positive:balance>=0},{label:t("dashboard.balanceOnRevenue"),value:new Intl.NumberFormat(language,{style:"percent",minimumFractionDigits:2,maximumFractionDigits:2}).format(margin/100),note:t("dashboard.batchResultHint"),icon:TrendingUp,tone:"purple",positive:margin>=0}];
  if (dashboard?.mode === "operational") return <OperatorDashboard data={dashboard as unknown as OperationalDashboardData}/>;
  return <div className="org-dashboard"><header className="org-dashboard-header"><div><h1>{t("dashboard.greeting").replace("{name}",userName)}</h1><p>{t("dashboard.summary")}</p></div><div className="org-dashboard-context">{dashboard?.organization&&<span><Building2 size={17}/>{dashboard.organization}</span>}<label className="org-period-control"><CalendarDays size={17}/><span className="sr-only">{t("dashboard.periodType")}</span><select value={periodType} onChange={(event)=>{const nextType=event.target.value as "month"|"year";setPeriodType(nextType);setPeriodValue(nextType==="year"?new Date().getFullYear().toString():new Date().toISOString().slice(0,7))}}><option value="month">{t("dashboard.month")}</option><option value="year">{t("dashboard.year")}</option></select>{periodType==="month"?<input aria-label={t("dashboard.referenceMonth")} type="month" value={periodValue} onChange={(event)=>setPeriodValue(event.target.value)}/>:<select aria-label={t("dashboard.referenceYear")} value={periodValue.slice(0,4)} onChange={(event)=>setPeriodValue(event.target.value)}>{availableYears.map(year=><option key={year} value={year}>{year}</option>)}</select>}<b>{periodLabel}</b></label></div></header>
    {error&&<div className="org-dashboard-error">{error}</div>}<section className="org-kpi-grid" aria-label={t("dashboard.financialSummary")}>{metrics.map(metric=><article className={`org-kpi-card tone-${metric.tone}`} key={metric.label}><span className="org-kpi-icon"><metric.icon size={27}/></span><div><small>{metric.label}</small><strong>{metric.value}</strong><p className={metric.positive===false?"negative":""}>{metric.note}</p></div></article>)}</section>
    <section className="org-segments-panel"><div className="org-section-title"><span>{t("dashboard.performance")}</span><h2>{t("dashboard.resultBySegment")}</h2></div><div className="org-segments-grid"><SegmentCard type="agriculture" title={t("sidebar.plantations")} segment={dashboard?.segments?.crops??EMPTY_SEGMENT}/>{livestockSegments.map(item=><SegmentCard key={item.code} type="livestock" title={item.name} segment={item}/>)}</div></section>
    <section className="org-lower-grid"><article className="org-info-panel"><div className="org-section-title"><span>{t("dashboard.monitoring")}</span><h2>{t("dashboard.alertsAndTasks")}</h2></div><div className="org-task-list">{kpis.low_stock_items>0&&<div className="urgent"><span><AlertTriangle size={19}/></span><p><strong>{t("dashboard.stockBelowMinimum")}</strong><small>{kpis.low_stock_items===1?t("dashboard.itemNeedsRestock"):t("dashboard.itemsNeedRestock").replace("{count}",fmt.format(kpis.low_stock_items))}</small></p><b>{t("dashboard.urgent")}</b></div>}{(dashboard?.tasks??[]).slice(0,3).map((task,index)=><div key={`${task.title}-${index}`} className={task.priority==="critical"||task.priority==="high"?"attention":"info"}><span>{task.priority==="critical"||task.priority==="high"?<AlertTriangle size={19}/>:<Activity size={19}/>}</span><p><strong>{task.title}</strong><small>{task.due_date?t("dashboard.dueDate").replace("{date}",new Date(`${task.due_date}T00:00:00`).toLocaleDateString(language)):t("dashboard.noDueDate")}{task.farm?` · ${task.farm}`:""}</small></p><b>{task.priority==="high"?t("dashboard.attention"):t("dashboard.pending")}</b></div>)}{!(dashboard?.tasks??[]).length&&!kpis.low_stock_items&&<div className="org-all-clear"><Activity size={21}/>{t("dashboard.noPendingItems")}</div>}</div></article>
      <article className="org-info-panel"><div className="org-section-title"><span>{t("dashboard.movements")}</span><h2>{t("dashboard.recentFinancialActivity")}</h2></div><div className="org-recent-list">{(dashboard?.recent_activities??[]).map((item,index)=><div key={`${item.title}-${index}`}><span className={item.type}><PiggyBank size={19}/></span><p><strong>{item.title}</strong><small>{item.category} · {new Date(`${item.date}T00:00:00`).toLocaleDateString(language)}</small></p><b className={item.type}>{item.type==="revenue"?"+":"−"} {money.format(item.amount)}</b></div>)}{!(dashboard?.recent_activities??[]).length&&<div className="org-all-clear"><Activity size={21}/>{t("dashboard.noRecentMovements")}</div>}</div></article></section>
    <section className="org-inventory-strip"><span><Package size={27}/></span><div><small>{t("dashboard.totalInventoryValue")}</small><strong>{money.format(kpis.total_inventory_value)}</strong></div><dl><div><dt>{t("dashboard.registeredItems")}</dt><dd>{fmt.format(kpis.inventory_items)}</dd></div><div><dt>{t("dashboard.lowStockItems")}</dt><dd>{fmt.format(kpis.low_stock_items)}</dd></div><div><dt>{t("dashboard.activeFarms")}</dt><dd>{fmt.format(kpis.farms_count)}</dd></div></dl></section>
  </div>;
}
