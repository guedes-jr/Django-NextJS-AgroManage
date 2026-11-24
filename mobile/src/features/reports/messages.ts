import type {Language} from '../../i18n/messages';
const pt={title:'Relatórios',subtitle:'Consultas rápidas para decisão no campo',lowStock:'Estoque baixo',lowStockHint:'Produtos abaixo do mínimo e quanto falta',expiry:'Validade de lotes',expiryHint:'Lotes vencidos e a vencer',herd:'Inventário do rebanho',herdHint:'Cabeças ativas por espécie e fazenda',
 critical:'Sem saldo',warning:'Abaixo do mínimo',current:'Saldo',minimum:'Mínimo',needed:'Repor',expiring:'A vencer',expired:'Vencidos',inDays:'em {days} dias',value:'Valor',lot:'Lote',window:'Janela',days:'dias',
 total:'Total',heads:'Cabeças',batches:'Lotes',bySpecies:'Por espécie',byFarm:'Por fazenda',items:'Lotes ativos',empty:'Nada a mostrar neste relatório.',
 more:'Relatórios gerenciais completos',web:'Abrir central de relatórios no web',webHint:'Relatório geral, indicadores de lote, produtividade, plantações, financeiro e exportações em PDF/Excel estão no sistema web.'};
type Copy=typeof pt;
const en:Copy={title:'Reports',subtitle:'Quick checks for field decisions',lowStock:'Low stock',lowStockHint:'Products below minimum and how much is missing',expiry:'Lot expiry',expiryHint:'Expired and expiring lots',herd:'Herd inventory',herdHint:'Active head by species and farm',
 critical:'Out of stock',warning:'Below minimum',current:'Balance',minimum:'Minimum',needed:'Restock',expiring:'Expiring',expired:'Expired',inDays:'in {days} days',value:'Value',lot:'Lot',window:'Window',days:'days',
 total:'Total',heads:'Head',batches:'Batches',bySpecies:'By species',byFarm:'By farm',items:'Active batches',empty:'Nothing to show in this report.',
 more:'Full management reports',web:'Open report center on the web',webHint:'General report, batch indicators, productivity, crops, finance and PDF/Excel exports are on the web.'};
const es:Copy={title:'Informes',subtitle:'Consultas rápidas para decidir en el campo',lowStock:'Inventario bajo',lowStockHint:'Productos bajo el mínimo y cuánto falta',expiry:'Vencimiento de lotes',expiryHint:'Lotes vencidos y por vencer',herd:'Inventario del rebaño',herdHint:'Cabezas activas por especie y finca',
 critical:'Sin saldo',warning:'Bajo el mínimo',current:'Saldo',minimum:'Mínimo',needed:'Reponer',expiring:'Por vencer',expired:'Vencidos',inDays:'en {days} días',value:'Valor',lot:'Lote',window:'Ventana',days:'días',
 total:'Total',heads:'Cabezas',batches:'Lotes',bySpecies:'Por especie',byFarm:'Por finca',items:'Lotes activos',empty:'Nada que mostrar en este informe.',
 more:'Informes de gestión completos',web:'Abrir centro de informes en la web',webHint:'Informe general, indicadores de lote, productividad, cultivos, finanzas y exportaciones PDF/Excel están en la web.'};
export const reportMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,title:'Relatórios'}};
