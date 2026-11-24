import type {Language} from '../../i18n/messages';
const pt={
 title:'Estruturas',subtitle:'Instalações e benfeitorias das fazendas',search:'Buscar estrutura',all:'Todas',empty:'Nenhuma estrutura encontrada.',
 categories:{corral:'Curral',pigsty:'Chiqueiro',poultry_house:'Galinheiro',warehouse:'Armazéns',irrigation:'Irrigação',water_reservoir:'Reservatórios',facility:'Instalações',fence:'Cercas',other:'Outros'} as Record<string,string>,
 maintenance:{not_scheduled:'Sem manutenção agendada',overdue:'Manutenção vencida',due_soon:'Manutenção próxima',scheduled:'Manutenção agendada'} as Record<string,string>,
 detail:'Ficha da estrutura',farm:'Fazenda',area:'Área construída',length:'Comprimento',width:'Largura',quantity:'Quantidade',acquired:'Aquisição',lastMaintenance:'Última manutenção',nextMaintenance:'Próxima manutenção',maintenanceNotes:'Notas de manutenção',description:'Descrição',notes:'Observações',
 items:'Itens da estrutura',noItems:'Nenhum item cadastrado.',value:'Valor',acquisitionValue:'Valor de aquisição',currentValue:'Valor atual',
 web:'Gerenciar estruturas no web',webHint:'Cadastro, edição e itens das estruturas continuam no sistema web.',
};
type Copy=Omit<Record<keyof typeof pt,string>,'categories'|'maintenance'>&{categories:Record<string,string>;maintenance:Record<string,string>};
const en:Copy={
 title:'Structures',subtitle:'Farm facilities and improvements',search:'Search structure',all:'All',empty:'No structures found.',
 categories:{corral:'Corral',pigsty:'Pigsty',poultry_house:'Poultry house',warehouse:'Warehouses',irrigation:'Irrigation',water_reservoir:'Reservoirs',facility:'Facilities',fence:'Fences',other:'Other'},
 maintenance:{not_scheduled:'No maintenance scheduled',overdue:'Maintenance overdue',due_soon:'Maintenance due soon',scheduled:'Maintenance scheduled'},
 detail:'Structure record',farm:'Farm',area:'Built area',length:'Length',width:'Width',quantity:'Quantity',acquired:'Acquisition',lastMaintenance:'Last maintenance',nextMaintenance:'Next maintenance',maintenanceNotes:'Maintenance notes',description:'Description',notes:'Notes',
 items:'Structure items',noItems:'No items registered.',value:'Value',acquisitionValue:'Acquisition value',currentValue:'Current value',
 web:'Manage structures on the web',webHint:'Registration, editing and structure items remain on the web.',
};
const es:Copy={
 title:'Estructuras',subtitle:'Instalaciones y mejoras de las fincas',search:'Buscar estructura',all:'Todas',empty:'No se encontraron estructuras.',
 categories:{corral:'Corral',pigsty:'Porqueriza',poultry_house:'Gallinero',warehouse:'Almacenes',irrigation:'Riego',water_reservoir:'Reservorios',facility:'Instalaciones',fence:'Cercas',other:'Otros'},
 maintenance:{not_scheduled:'Sin mantenimiento programado',overdue:'Mantenimiento vencido',due_soon:'Mantenimiento próximo',scheduled:'Mantenimiento programado'},
 detail:'Ficha de la estructura',farm:'Finca',area:'Área construida',length:'Largo',width:'Ancho',quantity:'Cantidad',acquired:'Adquisición',lastMaintenance:'Último mantenimiento',nextMaintenance:'Próximo mantenimiento',maintenanceNotes:'Notas de mantenimiento',description:'Descripción',notes:'Observaciones',
 items:'Ítems de la estructura',noItems:'Sin ítems registrados.',value:'Valor',acquisitionValue:'Valor de adquisición',currentValue:'Valor actual',
 web:'Gestionar estructuras en la web',webHint:'El registro, la edición y los ítems de las estructuras siguen en la web.',
};
export const structureMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,categories:{...pt.categories,warehouse:'Armazéns',pigsty:'Pocilga'},search:'Procurar estrutura'}};
