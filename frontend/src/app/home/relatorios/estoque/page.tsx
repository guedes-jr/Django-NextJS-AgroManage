"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Boxes, Download, FileChartColumn, PackageOpen, WalletCards } from "lucide-react";
import { apiClient } from "@/services/api";
import styles from "@/components/inventory/inventoryPages.module.css";

interface StockItem { id:string;code:string;name:string;category:string;unit:string;quantity:number;avg_cost:number;total_value:number;min_stock:number;is_low_stock:boolean }
interface StockReport { items:StockItem[];total_items:number;total_value:number;low_stock_count:number }
const money=(value:number)=>value.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const number=(value:number)=>value.toLocaleString("pt-BR",{maximumFractionDigits:2});

export default function StockReportPage(){
  const [data,setData]=useState<StockReport|null>(null);const [category,setCategory]=useState("");const [status,setStatus]=useState("");const [loading,setLoading]=useState(true);
  useEffect(()=>{apiClient.get<StockReport>("/reports/stock/general/").then(({data:report})=>setData(report)).finally(()=>setLoading(false));},[]);
  const categories=useMemo(()=>Array.from(new Set(data?.items.map(item=>item.category)||[])).sort(),[data]);
  const rows=useMemo(()=>(data?.items||[]).filter(item=>(!category||item.category===category)&&(!status||(status==="low"?item.is_low_stock:!item.is_low_stock))),[category,data,status]);
  const totalQuantity=rows.reduce((sum,item)=>sum+item.quantity,0);const totalValue=rows.reduce((sum,item)=>sum+item.total_value,0);const lowItems=(data?.items||[]).filter(item=>item.is_low_stock);
  const exportReport=()=>{const sheet=XLSX.utils.json_to_sheet(rows.map(item=>({Código:item.code,Produto:item.name,Categoria:item.category,Unidade:item.unit,Quantidade:item.quantity,"Valor unitário":item.avg_cost,"Valor total":item.total_value,"Estoque mínimo":item.min_stock,Status:item.is_low_stock?"Baixo":"Normal"})));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Estoque");XLSX.writeFile(book,"relatorio-estoque.xlsx");};
  return <div className={styles.page}>
    <header className={styles.title}><div><span className={styles.titleIcon}><FileChartColumn size={40}/></span><span><h1>Relatório de Estoque</h1><p>Visão completa de todos os itens do estoque da granja.</p></span></div><button className={styles.export} onClick={exportReport} disabled={!rows.length}><Download size={19}/> Exportar relatório</button></header>
    {loading?<div className={styles.empty}>Carregando relatório…</div>:<div className={styles.reportGrid}><main className={styles.reportMain}>
      <section className={styles.reportStats}>
        <article className={styles.stat}><span className={styles.icon}><WalletCards/></span><div><small>Valor total em estoque</small><strong>{money(data?.total_value||0)}</strong><span>Valor de custo total</span></div></article>
        <article className={styles.stat}><span className={styles.icon}><PackageOpen/></span><div><small>Itens cadastrados</small><strong>{data?.total_items||0}</strong><span>Todos os itens ativos</span></div></article>
        <article className={styles.stat}><span className={styles.icon}><AlertTriangle/></span><div><small>Estoque baixo</small><strong>{data?.low_stock_count||0}</strong><span>Itens abaixo do mínimo</span></div></article>
        <article className={styles.stat}><span className={styles.icon}><Boxes/></span><div><small>Quantidade total</small><strong>{number((data?.items||[]).reduce((sum,item)=>sum+item.quantity,0))}</strong><span>Total de unidades</span></div></article>
      </section>
      <section className={styles.panel}><div className={styles.filters}><label>Produtos<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">Todos</option>{categories.map(value=><option key={value}>{value}</option>)}</select></label><label>Status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">Todos</option><option value="normal">Normal</option><option value="low">Baixo</option></select></label><button className={styles.filterButton} type="button">Filtrar</button></div></section>
      <section className={styles.panel}><div className={styles.panelHead}><strong><FileChartColumn size={19}/> Todos os Itens em Estoque ({rows.length})</strong></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th><th>Estoque mínimo</th><th>Status</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{item.code||"—"}</td><td>{item.name}</td><td>{item.category}</td><td>{item.unit}</td><td>{number(item.quantity)}</td><td>{money(item.avg_cost)}</td><td>{money(item.total_value)}</td><td>{number(item.min_stock)}</td><td><span className={`${styles.status} ${item.is_low_stock?styles.statusLow:""}`}>{item.is_low_stock?"Baixo":"Normal"}</span></td></tr>)}{!rows.length&&<tr><td colSpan={9} className={styles.empty}>Nenhum item encontrado.</td></tr>}</tbody>{!!rows.length&&<tfoot><tr><td colSpan={4}>Totais gerais</td><td>{number(totalQuantity)}</td><td/><td>{money(totalValue)}</td><td colSpan={2}/></tr></tfoot>}</table></div></section>
    </main><aside className={styles.alerts}><h2><AlertTriangle size={19} color="#e99b08"/> Alertas</h2><div className={styles.alertIntro}><strong>{lowItems.length} itens em estoque baixo</strong><p>Itens abaixo da quantidade mínima definida.</p></div>{lowItems.slice(0,5).map(item=><article className={styles.alertItem} key={item.id}><strong>{item.name}</strong><div><span>Estoque atual<b>{number(item.quantity)} {item.unit}</b></span><span>Mínimo<b>{number(item.min_stock)} {item.unit}</b></span></div></article>)}{!lowItems.length&&<div className={styles.empty}>Nenhum alerta de estoque baixo.</div>}</aside></div>}
  </div>;
}
