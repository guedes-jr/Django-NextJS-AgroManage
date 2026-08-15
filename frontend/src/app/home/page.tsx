"use client";

import "@/components/dashboard/dashboard.css";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Beef, Building2, CalendarDays, CircleDollarSign, Package, PiggyBank, Sprout, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { apiClient } from "@/services/api";

interface User { id:string; email:string; full_name:string; role:string }
interface DashboardKpis { month_revenue:number; month_expense:number; total_animals:number; planted_area_ha:number; inventory_items:number; total_inventory_value:number; low_stock_items:number; farms_count:number }
interface Breakdown { name:string; value:number }
interface Segment { cost:number; revenue:number; profit:number; margin:number; cost_breakdown:Breakdown[]; revenue_breakdown:Breakdown[] }
interface TaskItem { title:string; due_date:string|null; priority:string; status:string; farm:string|null }
interface RecentItem { title:string; date:string; type:"revenue"|"expense"; amount:number; category:string }
interface RevenueItem { mes:string; receita:number; despesa:number }
interface DashboardData { organization:string|null; kpis:DashboardKpis; charts:{ revenue_vs_expense:RevenueItem[] }; segments:{ crops:Segment; livestock:Segment }; recent_activities:RecentItem[]; tasks:TaskItem[] }

const EMPTY_KPIS:DashboardKpis={month_revenue:0,month_expense:0,total_animals:0,planted_area_ha:0,inventory_items:0,total_inventory_value:0,low_stock_items:0,farms_count:0};
const EMPTY_SEGMENT:Segment={cost:0,revenue:0,profit:0,margin:0,cost_breakdown:[],revenue_breakdown:[]};
const COLORS=["var(--chart-1)","var(--chart-4)","var(--chart-3)","var(--chart-5)","var(--chart-2)"];
const fmt=new Intl.NumberFormat("pt-BR");
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const subscribeToHydration=()=>()=>undefined;

function Skeleton(){return <div className="org-dashboard-skeleton"><span/><div>{[0,1,2,3].map(i=><i key={i}/>)}</div><b/></div>}

function FinanceChart({title,subtitle,data}:{title:string;subtitle:string;data:Breakdown[]}){
  const colored=useMemo(()=>data.map((item,index)=>({...item,color:COLORS[index%COLORS.length]})),[data]);
  return <div className="org-finance-chart"><div className="org-finance-chart-title"><strong>{title}</strong><small>{subtitle}</small></div>
    {!colored.length?<div className="org-empty-finance"><CircleDollarSign size={25}/><span>Sem lançamentos no período</span></div>:<div className="org-donut-layout"><div className="org-donut"><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={145}><PieChart><Pie data={colored} dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={2}>{colored.map(item=><Cell key={item.name} fill={item.color} stroke="var(--card)" strokeWidth={2}/>)}</Pie><Tooltip formatter={value=>money.format(Number(value))} contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10}}/></PieChart></ResponsiveContainer></div><div className="org-chart-legend">{colored.slice(0,5).map(item=><span key={item.name}><i style={{background:item.color}}/><b>{item.name}</b><small>{money.format(item.value)}</small></span>)}</div></div>}
  </div>;
}

function SegmentCard({type,title,segment}:{type:"agriculture"|"livestock";title:string;segment:Segment}){
  const Icon=type==="agriculture"?Sprout:Beef;
  return <article className={`org-segment ${type}`}><header><span><Icon size={21}/>{title}</span></header><div className="org-segment-stats">
    <div><small>Custo total</small><strong>{money.format(segment.cost)}</strong></div><div><small>Receita total</small><strong>{money.format(segment.revenue)}</strong></div><div><small>Resultado</small><strong className={segment.profit<0?"negative":"positive"}>{money.format(segment.profit)}</strong></div><div><small>Margem</small><strong className={segment.margin<0?"negative":"positive"}>{segment.margin.toFixed(2).replace(".",",")}%</strong></div>
  </div><div className="org-segment-charts"><FinanceChart title="Custo por atividade" subtitle="Composição dos custos registrados" data={segment.cost_breakdown}/><FinanceChart title="Receita por atividade" subtitle="Origem das receitas registradas" data={segment.revenue_breakdown}/></div></article>;
}

export default function HomePage(){
  const router=useRouter(); const [user,setUser]=useState<User|null>(null); const [dashboard,setDashboard]=useState<DashboardData|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const isClient=useSyncExternalStore(subscribeToHydration,()=>true,()=>false);
  useEffect(()=>{const stored=localStorage.getItem("user");if(stored){try{queueMicrotask(()=>setUser(JSON.parse(stored)))}catch{localStorage.removeItem("user")}}else apiClient.get("/auth/me/").then(r=>{setUser(r.data);localStorage.setItem("user",JSON.stringify(r.data))}).catch(()=>router.push("/login"))},[router]);
  useEffect(()=>{apiClient.get<DashboardData>("/reports/dashboard/").then(r=>setDashboard(r.data)).catch(()=>setError("Não foi possível carregar os dados do painel.")).finally(()=>setLoading(false))},[]);
  if(loading)return <Skeleton/>;
  const kpis=dashboard?.kpis??EMPTY_KPIS; const balance=kpis.month_revenue-kpis.month_expense; const margin=kpis.month_revenue?balance/kpis.month_revenue*100:0; const revenueData=dashboard?.charts.revenue_vs_expense??[]; const previous=revenueData.length>1?revenueData.at(-2):undefined; const current=revenueData.at(-1); const revenueTrend=previous?.receita?((current?.receita??0)-previous.receita)/previous.receita*100:0; const userName=user?.full_name?.split(" ")[0]||"Produtor";
  const metrics=[{label:"Custo total",value:money.format(kpis.month_expense),note:"Despesas pagas neste mês",icon:Wallet,tone:"green"},{label:"Receita total",value:money.format(kpis.month_revenue),note:`${revenueTrend>=0?"▲":"▼"} ${Math.abs(revenueTrend).toFixed(1).replace(".",",")}% vs. período anterior`,icon:CircleDollarSign,tone:"blue",positive:revenueTrend>=0},{label:"Lucro total",value:money.format(balance),note:balance>=0?"Receita menos custos":"Custos acima da receita",icon:balance>=0?TrendingUp:TrendingDown,tone:"orange",positive:balance>=0},{label:"Margem de lucro",value:`${margin.toFixed(2).replace(".",",")}%`,note:"Resultado sobre a receita",icon:TrendingUp,tone:"purple",positive:margin>=0}];
  return <div className="org-dashboard"><header className="org-dashboard-header"><div><h1>Bom dia, {userName}! <span aria-hidden>☀️</span></h1><p>Aqui está o resumo financeiro completo da sua fazenda.</p></div><div className="org-dashboard-context">{dashboard?.organization&&<span><Building2 size={17}/>{dashboard.organization}</span>}<span><CalendarDays size={17}/>{isClient?new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"}):"Período atual"}</span></div></header>
    {error&&<div className="org-dashboard-error">{error}</div>}<section className="org-kpi-grid" aria-label="Resumo financeiro">{metrics.map(metric=><article className={`org-kpi-card tone-${metric.tone}`} key={metric.label}><span className="org-kpi-icon"><metric.icon size={27}/></span><div><small>{metric.label}</small><strong>{metric.value}</strong><p className={metric.positive===false?"negative":""}>{metric.note}</p></div></article>)}</section>
    <section className="org-segments-panel"><div className="org-section-title"><span>Desempenho financeiro</span><h2>Resultado por segmento</h2></div><div className="org-segments-grid"><SegmentCard type="agriculture" title="Plantações" segment={dashboard?.segments?.crops??EMPTY_SEGMENT}/><SegmentCard type="livestock" title="Suinocultura e animais" segment={dashboard?.segments?.livestock??EMPTY_SEGMENT}/></div></section>
    <section className="org-lower-grid"><article className="org-info-panel"><div className="org-section-title"><span>Acompanhamento</span><h2>Alertas e pendências</h2></div><div className="org-task-list">{kpis.low_stock_items>0&&<div className="urgent"><span><AlertTriangle size={19}/></span><p><strong>Estoque abaixo do mínimo</strong><small>{kpis.low_stock_items} {kpis.low_stock_items===1?"item precisa":"itens precisam"} de reposição</small></p><b>Urgente</b></div>}{(dashboard?.tasks??[]).slice(0,3).map((task,index)=><div key={`${task.title}-${index}`} className={task.priority==="critical"||task.priority==="high"?"attention":"info"}><span>{task.priority==="critical"||task.priority==="high"?<AlertTriangle size={19}/>:<Activity size={19}/>}</span><p><strong>{task.title}</strong><small>{task.due_date?`Prazo: ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("pt-BR")}`:"Sem prazo definido"}{task.farm?` · ${task.farm}`:""}</small></p><b>{task.priority==="high"?"Atenção":"Pendente"}</b></div>)}{!(dashboard?.tasks??[]).length&&!kpis.low_stock_items&&<div className="org-all-clear"><Activity size={21}/>Nenhuma pendência para o período.</div>}</div></article>
      <article className="org-info-panel"><div className="org-section-title"><span>Movimentações</span><h2>Atividades financeiras recentes</h2></div><div className="org-recent-list">{(dashboard?.recent_activities??[]).map((item,index)=><div key={`${item.title}-${index}`}><span className={item.type}><PiggyBank size={19}/></span><p><strong>{item.title}</strong><small>{item.category} · {new Date(`${item.date}T00:00:00`).toLocaleDateString("pt-BR")}</small></p><b className={item.type}>{item.type==="revenue"?"+":"−"} {money.format(item.amount)}</b></div>)}{!(dashboard?.recent_activities??[]).length&&<div className="org-all-clear"><Activity size={21}/>Nenhuma movimentação recente.</div>}</div></article></section>
    <section className="org-inventory-strip"><span><Package size={27}/></span><div><small>Valor total em estoque</small><strong>{money.format(kpis.total_inventory_value)}</strong></div><dl><div><dt>Itens cadastrados</dt><dd>{fmt.format(kpis.inventory_items)}</dd></div><div><dt>Itens com estoque baixo</dt><dd>{fmt.format(kpis.low_stock_items)}</dd></div><div><dt>Fazendas ativas</dt><dd>{fmt.format(kpis.farms_count)}</dd></div></dl></section>
  </div>;
}
