import type {Language} from '../../i18n/messages';
const pt={
 title:'Plantações',subtitle:'Ciclos de cultivo da organização',search:'Buscar plantação, cultura ou talhão',all:'Todas',empty:'Nenhuma plantação encontrada.',
 statuses:{planned:'Planejada',planting:'Em plantio',growing:'Em desenvolvimento',management:'Em manejo',harvesting:'Em colheita',finished:'Finalizada',cancelled:'Cancelada'} as Record<string,string>,
 active:'Ativas',area:'Área',field:'Talhão',farm:'Fazenda',crop:'Cultura',variety:'Variedade',planting:'Plantio',expectedHarvest:'Colheita prevista',actualHarvest:'Colheita realizada',responsible:'Responsável',population:'População',spacing:'Espaçamento',
 cultivationDays:'Dias de cultivo',daysRemaining:'Dias para colheita',production:'Produção estimada',bags:'Sacas estimadas',
 finance:'Resultado da plantação',investment:'Investimento',costHa:'Custo por hectare',revenue:'Receita estimada',profit:'Lucro estimado',roi:'Retorno estimado',realProfit:'Resultado realizado',financeHint:'Valores calculados pelo servidor a partir das operações e títulos vinculados.',
 detail:'Ficha da plantação',history:'Histórico de operações',noHistory:'Nenhum registro deste tipo.',
 kinds:{'land-preparations':'Preparo','plantings':'Plantio','fertilizations':'Adubação','pesticides':'Defensivos','irrigations':'Irrigação','harvests':'Colheita'} as Record<string,string>,
 cost:'Custo',quantity:'Quantidade',web:'Lançar operações no web',webHint:'Lançamentos de preparo, plantio, adubação, defensivos, irrigação, colheita e vendas geram custos e títulos; por isso continuam no sistema web nesta versão.',readonly:'Consulta',
};
type Copy=Omit<Record<keyof typeof pt,string>,'statuses'|'kinds'>&{statuses:Record<string,string>;kinds:Record<string,string>};
const en:Copy={
 title:'Crops',subtitle:'Organization crop cycles',search:'Search crop, culture or field',all:'All',empty:'No crops found.',
 statuses:{planned:'Planned',planting:'Planting',growing:'Growing',management:'Management',harvesting:'Harvesting',finished:'Finished',cancelled:'Cancelled'},
 active:'Active',area:'Area',field:'Field',farm:'Farm',crop:'Crop',variety:'Variety',planting:'Planting',expectedHarvest:'Expected harvest',actualHarvest:'Actual harvest',responsible:'Responsible',population:'Population',spacing:'Spacing',
 cultivationDays:'Days in cultivation',daysRemaining:'Days to harvest',production:'Estimated production',bags:'Estimated bags',
 finance:'Crop result',investment:'Investment',costHa:'Cost per hectare',revenue:'Estimated revenue',profit:'Estimated profit',roi:'Estimated return',realProfit:'Realized result',financeHint:'Values computed by the server from linked operations and titles.',
 detail:'Crop record',history:'Operation history',noHistory:'No records of this type.',
 kinds:{'land-preparations':'Preparation','plantings':'Planting','fertilizations':'Fertilization','pesticides':'Crop protection','irrigations':'Irrigation','harvests':'Harvest'},
 cost:'Cost',quantity:'Quantity',web:'Record operations on the web',webHint:'Preparation, planting, fertilization, crop protection, irrigation, harvest and sales generate costs and titles, so they remain on the web in this version.',readonly:'Read only',
};
const es:Copy={
 title:'Cultivos',subtitle:'Ciclos de cultivo de la organización',search:'Buscar cultivo, especie o parcela',all:'Todos',empty:'No se encontraron cultivos.',
 statuses:{planned:'Planificado',planting:'En siembra',growing:'En desarrollo',management:'En manejo',harvesting:'En cosecha',finished:'Finalizado',cancelled:'Cancelado'},
 active:'Activos',area:'Área',field:'Parcela',farm:'Finca',crop:'Cultivo',variety:'Variedad',planting:'Siembra',expectedHarvest:'Cosecha prevista',actualHarvest:'Cosecha realizada',responsible:'Responsable',population:'Población',spacing:'Espaciamiento',
 cultivationDays:'Días de cultivo',daysRemaining:'Días para cosecha',production:'Producción estimada',bags:'Bolsas estimadas',
 finance:'Resultado del cultivo',investment:'Inversión',costHa:'Costo por hectárea',revenue:'Ingreso estimado',profit:'Ganancia estimada',roi:'Retorno estimado',realProfit:'Resultado realizado',financeHint:'Valores calculados por el servidor a partir de operaciones y títulos vinculados.',
 detail:'Ficha del cultivo',history:'Historial de operaciones',noHistory:'Sin registros de este tipo.',
 kinds:{'land-preparations':'Preparación','plantings':'Siembra','fertilizations':'Fertilización','pesticides':'Fitosanitarios','irrigations':'Riego','harvests':'Cosecha'},
 cost:'Costo',quantity:'Cantidad',web:'Registrar operaciones en la web',webHint:'Preparación, siembra, fertilización, fitosanitarios, riego, cosecha y ventas generan costos y títulos; por eso siguen en la web en esta versión.',readonly:'Consulta',
};
export const cropMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,title:'Plantações',search:'Procurar plantação, cultura ou talhão',statuses:{...pt.statuses,planting:'Em sementeira'},planting:'Sementeira',kinds:{...pt.kinds,plantings:'Sementeira'}}};
