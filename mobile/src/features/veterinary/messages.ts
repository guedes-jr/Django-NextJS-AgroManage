import type {Language} from '../../i18n/messages';
import type {CurralPreset, VetDeadline, VetStatus} from './contracts';

const pt={
  animals:{
    title:'Animais', start:'Animais', subtitle:'Todos os animais atendidos, por cliente.', allStatuses:'Todas as situações', allCategories:'Todas as categorias',
    history:'Histórico', historyTitle:'Histórico de {animal}', empty:'Nenhum atendimento ainda.', procedures:'{count} atendimento(s)',
    pregnant:'Prenha', open:'Vazia', notDone:'Não feito', removal:'Retirada do dispositivo (D{day})', iatf:'Inseminação do IATF',
    semen:'Sêmen: {value}', bull:'Touro / sêmen: {value}', gestation:'Gestação: {days} dias · parto previsto {date}', returnIn:'Retorno em {days} dias',
    protocol:'Protocolo IATF de {days} dias · início {date}', discard:'Motivo: {value}', responsible:'Responsável: {value}', notes:'Obs.: {value}',
    rescheduled:'Remarcado para {date}', inHerd:'No rebanho', method:'Cobertura: {value}',
  },
  launch:{
    title:'Lançar atendimento', start:'Lançar atendimento', data:'Dados do atendimento', client:'Cliente / fazenda', newClient:'+ Novo cliente', clientName:'Nome do cliente',
    date:'Data (AAAA-MM-DD)', responsible:'Responsável', typed:'Digitar o nome', responsiblePlaceholder:'Quem atendeu', animal:'Animal',
    animalHint:'Digite o brinco ou o nome. Se ainda não existir, ele é cadastrado ao salvar.', animalPlaceholder:'Nome ou número do animal',
    checking:'Procurando o animal…', known:'Já cadastrado', isNew:'Animal novo: será cadastrado ao salvar.', situation:'Situação', nextStep:'Próximo',
    category:'Categoria', categoryHint:'Mude só se o animal mudou de categoria.', diagnosis:'Diagnóstico', pregnant:'Prenha', open:'Vazia',
    conduct:'Conduta', method:'Como foi a cobertura?', gestation:'Idade gestacional (dias)', proposed:'Cobertura em {date} · parto previsto {calving}{bull}',
    proposedBull:' · touro/sêmen {bull}', fix:'Corrigir os dados', useProposed:'Usar os dados do protocolo/inseminação', calving:'Parto previsto: {date}',
    management:'Manejo (dias)', cycling:'Ciclando', notCycling:'Não ciclando', protocolStart:'Início do protocolo D0 (AAAA-MM-DD)', protocolAlerts:'Alertas que serão criados:',
    returnDays:'Retorno em (dias)', discardReason:'Motivo do descarte',
    stepTitle:'{step} foi feito?', iatfTitle:'A inseminação (IATF) foi feita?', done:'Feito', notDone:'Não feito', doneDate:'Data em que foi feito (AAAA-MM-DD)',
    bull:'Touro / sêmen usado', plannedOn:'Previsto para {date}', notes:'Observação (opcional)', save:'Salvar atendimento', saving:'Salvando…',
    saved:'Atendimento de {animal} salvo.', savedNew:'Atendimento salvo e animal {animal} cadastrado.', alertsCreated:'{count} alerta(s) criado(s).',
    another:'Novo atendimento', toList:'Ver lista de curral', unknown:'Não foi possível confirmar se o atendimento foi salvo. Confira a lista de curral antes de lançar de novo.',
    check:'Conferir na lista', rejected:'Não foi possível salvar. Confira os dados e tente novamente.', inputsWeb:'Insumos usados (estoque) e anexos são lançados no sistema web.',
    problems:{client:'Informe o nome do cliente.',date:'Informe a data no formato AAAA-MM-DD.',future:'A data não pode ser depois de hoje.',animal:'Digite o nome ou o número do animal.',
      stepDone:'Escolha Feito ou Não feito.',stepDate:'Informe a data em que foi feito.',stepBull:'Informe o touro ou sêmen usado.',category:'Escolha a categoria do animal.',
      diagnosis:'Escolha o diagnóstico: prenha ou vazia.',conduct:'Escolha a conduta.',method:'Escolha como foi a cobertura.',gestation:'Informe a idade gestacional em dias (0 a 320).'} as Record<string,string>,
    conducts:{iatf_protocol:'Protocolo IATF',observe_heat:'Observar cio',induction:'Indução',discard:'Descarte'} as Record<string,string>,
    methods:{artificial:'Inseminação artificial',natural:'Monta natural'} as Record<string,string>,
    discard:{repeat_open:'Vazia repetida',age:'Idade',low_production:'Baixa produção',health:'Sanidade',other:'Outro'} as Record<string,string>,
  },
  title:'Área do veterinário', curral:'Alertas e lista de curral', subtitle:'O que precisa ser feito, para levar ao curral.',
  loading:'Carregando…', error:'Não foi possível carregar a Área do veterinário. Confira a conexão e tente novamente.', retry:'Tentar novamente',
  noAccess:'A Área do veterinário não está contratada para esta organização ou o seu cargo não tem acesso.',
  empty:'Ainda não há animais. Depois do primeiro atendimento, a lista de curral aparece aqui.', none:'Nenhum animal com esses filtros.',
  search:'Brinco, animal ou fazenda', allClients:'Todas as fazendas', refresh:'Atualizar', updated:'Atualizado às {time}',
  late:'Atrasados', today:'Hoje', week:'Em 7 dias', count:'{count} animal(is)', lateDays:'atrasado {days} dia(s)', noDate:'Sem data',
  next:'Próximo', last:'Último', web:'Abrir no sistema web', failedLink:'Não foi possível abrir o sistema web.', back:'Voltar',
  readOnlyHint:'Clientes, cobrança, relatório e rebanho continuam no sistema web por enquanto.',
  presets:{all:'Todos',late:'Atrasados',today:'Hoje',week:'Próx. 7 dias',protocol:'Em protocolo',inseminated:'Inseminadas',pregnant:'Prenhas',open:'Vazias'} as Record<CurralPreset,string>,
  status:{protocol:'Em protocolo',inseminated:'Inseminada',pregnant:'Prenha',open:'Vazia',attended:'Atendida',none:'Sem registro'} as Record<VetStatus,string>,
  deadline:{late:'Atrasado',today:'Hoje',week:'Esta semana',later:'Mais adiante',nodate:'Sem data'} as Record<VetDeadline,string>,
  category:{vaca_solteira:'Vaca solteira',vaca_parida:'Vaca parida',novilha:'Novilha'} as Record<string,string>,
  kind:{insemination:'Inseminação',protocol:'Protocolo IATF',iatf_insemination:'IATF (inseminar)',ultrasound:'Ultrassom',palpation:'Palpação',other:'Outro'} as Record<string,string>,
  nextCode:{
    alert_calving:'Parto previsto', alert_removal:'Retirar dispositivo + prostaglandina + indutor de ovulação + eCG (D{day})', alert_inseminate:'Inseminar (D{day})',
    alert_observe_heat:'Observar cio', alert_induction_review:'Reavaliar após a indução', alert_ultrasound:'Ultrassom (diagnóstico)', first:'Primeiro atendimento',
    inseminate_iatf:'Inseminar (IATF)', ultrasound:'Ultrassom (diagnóstico)', calving:'Parto', discard:'Descarte', observe_heat:'Observar cio',
    induction_review:'Reavaliar após a indução', define_conduct:'Definir conduta', new:'Novo atendimento',
  } as Record<string,string>,
};
export type VeterinaryCopy=typeof pt;

const en:VeterinaryCopy={
  animals:{
    title:'Animals', start:'Animals', subtitle:'Every animal attended, by client.', allStatuses:'All statuses', allCategories:'All categories',
    history:'History', historyTitle:'History of {animal}', empty:'No visit yet.', procedures:'{count} visit(s)',
    pregnant:'Pregnant', open:'Open', notDone:'Not done', removal:'Device removal (D{day})', iatf:'IATF insemination',
    semen:'Semen: {value}', bull:'Bull / semen: {value}', gestation:'Gestation: {days} days · expected calving {date}', returnIn:'Return in {days} days',
    protocol:'{days}-day IATF protocol · start {date}', discard:'Reason: {value}', responsible:'Responsible: {value}', notes:'Notes: {value}',
    rescheduled:'Rescheduled to {date}', inHerd:'In the herd', method:'Breeding: {value}',
  },
  launch:{
    title:'Record visit', start:'Record visit', data:'Visit details', client:'Client / farm', newClient:'+ New client', clientName:'Client name',
    date:'Date (YYYY-MM-DD)', responsible:'Responsible', typed:'Type the name', responsiblePlaceholder:'Who attended', animal:'Animal',
    animalHint:'Type the tag or the name. If it does not exist yet, it is registered on save.', animalPlaceholder:'Animal name or number',
    checking:'Looking for the animal…', known:'Already registered', isNew:'New animal: it will be registered on save.', situation:'Status', nextStep:'Next',
    category:'Category', categoryHint:'Change it only if the animal changed category.', diagnosis:'Diagnosis', pregnant:'Pregnant', open:'Open',
    conduct:'Conduct', method:'How was the breeding?', gestation:'Gestational age (days)', proposed:'Breeding on {date} · expected calving {calving}{bull}',
    proposedBull:' · bull/semen {bull}', fix:'Correct the data', useProposed:'Use the protocol/insemination data', calving:'Expected calving: {date}',
    management:'Handling (days)', cycling:'Cycling', notCycling:'Not cycling', protocolStart:'Protocol start D0 (YYYY-MM-DD)', protocolAlerts:'Alerts that will be created:',
    returnDays:'Return in (days)', discardReason:'Cull reason',
    stepTitle:'Was {step} done?', iatfTitle:'Was the insemination (IATF) done?', done:'Done', notDone:'Not done', doneDate:'Date it was done (YYYY-MM-DD)',
    bull:'Bull / semen used', plannedOn:'Planned for {date}', notes:'Notes (optional)', save:'Save visit', saving:'Saving…',
    saved:'Visit of {animal} saved.', savedNew:'Visit saved and animal {animal} registered.', alertsCreated:'{count} alert(s) created.',
    another:'New visit', toList:'See corral list', unknown:'Unable to confirm whether the visit was saved. Check the corral list before recording it again.',
    check:'Check the list', rejected:'Unable to save. Check the data and try again.', inputsWeb:'Inputs used (stock) and attachments are recorded in the web system.',
    problems:{client:'Enter the client name.',date:'Enter the date as YYYY-MM-DD.',future:'The date cannot be after today.',animal:'Type the animal name or number.',
      stepDone:'Choose Done or Not done.',stepDate:'Enter the date it was done.',stepBull:'Enter the bull or semen used.',category:'Choose the animal category.',
      diagnosis:'Choose the diagnosis: pregnant or open.',conduct:'Choose the conduct.',method:'Choose how the breeding was.',gestation:'Enter the gestational age in days (0 to 320).'},
    conducts:{iatf_protocol:'IATF protocol',observe_heat:'Watch for heat',induction:'Induction',discard:'Cull'},
    methods:{artificial:'Artificial insemination',natural:'Natural mating'},
    discard:{repeat_open:'Repeated open',age:'Age',low_production:'Low production',health:'Health',other:'Other'},
  },
  title:'Veterinarian area', curral:'Alerts and corral list', subtitle:'What needs to be done, to take to the corral.',
  loading:'Loading…', error:'Unable to load the veterinarian area. Check the connection and try again.', retry:'Try again',
  noAccess:'The veterinarian area is not contracted for this organization or your role has no access.',
  empty:'No animals yet. After the first visit, the corral list appears here.', none:'No animal with these filters.',
  search:'Tag, animal or farm', allClients:'All farms', refresh:'Refresh', updated:'Updated at {time}',
  late:'Late', today:'Today', week:'In 7 days', count:'{count} animal(s)', lateDays:'{days} day(s) late', noDate:'No date',
  next:'Next', last:'Last', web:'Open in the web system', failedLink:'Unable to open the web system.', back:'Back',
  readOnlyHint:'Clients, billing, report and herd stay in the web system for now.',
  presets:{all:'All',late:'Late',today:'Today',week:'Next 7 days',protocol:'In protocol',inseminated:'Inseminated',pregnant:'Pregnant',open:'Open'},
  status:{protocol:'In protocol',inseminated:'Inseminated',pregnant:'Pregnant',open:'Open',attended:'Attended',none:'No record'},
  deadline:{late:'Late',today:'Today',week:'This week',later:'Later',nodate:'No date'},
  category:{vaca_solteira:'Dry cow',vaca_parida:'Lactating cow',novilha:'Heifer'},
  kind:{insemination:'Insemination',protocol:'IATF protocol',iatf_insemination:'IATF (inseminate)',ultrasound:'Ultrasound',palpation:'Palpation',other:'Other'},
  nextCode:{
    alert_calving:'Expected calving', alert_removal:'Remove device + prostaglandin + ovulation inducer + eCG (D{day})', alert_inseminate:'Inseminate (D{day})',
    alert_observe_heat:'Watch for heat', alert_induction_review:'Re-examine after induction', alert_ultrasound:'Ultrasound (diagnosis)', first:'First visit',
    inseminate_iatf:'Inseminate (IATF)', ultrasound:'Ultrasound (diagnosis)', calving:'Calving', discard:'Cull', observe_heat:'Watch for heat',
    induction_review:'Re-examine after induction', define_conduct:'Define the conduct', new:'New visit',
  },
};

const es:VeterinaryCopy={
  animals:{
    title:'Animales', start:'Animales', subtitle:'Todos los animales atendidos, por cliente.', allStatuses:'Todas las situaciones', allCategories:'Todas las categorías',
    history:'Historial', historyTitle:'Historial de {animal}', empty:'Ninguna atención todavía.', procedures:'{count} atención(es)',
    pregnant:'Preñada', open:'Vacía', notDone:'No hecho', removal:'Retiro del dispositivo (D{day})', iatf:'Inseminación de IATF',
    semen:'Semen: {value}', bull:'Toro / semen: {value}', gestation:'Gestación: {days} días · parto previsto {date}', returnIn:'Retorno en {days} días',
    protocol:'Protocolo IATF de {days} días · inicio {date}', discard:'Motivo: {value}', responsible:'Responsable: {value}', notes:'Obs.: {value}',
    rescheduled:'Reprogramado para {date}', inHerd:'En el rebaño', method:'Cubrición: {value}',
  },
  launch:{
    title:'Registrar atención', start:'Registrar atención', data:'Datos de la atención', client:'Cliente / finca', newClient:'+ Nuevo cliente', clientName:'Nombre del cliente',
    date:'Fecha (AAAA-MM-DD)', responsible:'Responsable', typed:'Escribir el nombre', responsiblePlaceholder:'Quién atendió', animal:'Animal',
    animalHint:'Escribe el arete o el nombre. Si aún no existe, se registra al guardar.', animalPlaceholder:'Nombre o número del animal',
    checking:'Buscando el animal…', known:'Ya registrado', isNew:'Animal nuevo: se registrará al guardar.', situation:'Situación', nextStep:'Próximo',
    category:'Categoría', categoryHint:'Cámbiala solo si el animal cambió de categoría.', diagnosis:'Diagnóstico', pregnant:'Preñada', open:'Vacía',
    conduct:'Conducta', method:'¿Cómo fue la cubrición?', gestation:'Edad gestacional (días)', proposed:'Cubrición el {date} · parto previsto {calving}{bull}',
    proposedBull:' · toro/semen {bull}', fix:'Corregir los datos', useProposed:'Usar los datos del protocolo/inseminación', calving:'Parto previsto: {date}',
    management:'Manejo (días)', cycling:'Ciclando', notCycling:'No ciclando', protocolStart:'Inicio del protocolo D0 (AAAA-MM-DD)', protocolAlerts:'Alertas que se crearán:',
    returnDays:'Retorno en (días)', discardReason:'Motivo del descarte',
    stepTitle:'¿Se hizo {step}?', iatfTitle:'¿Se hizo la inseminación (IATF)?', done:'Hecho', notDone:'No hecho', doneDate:'Fecha en que se hizo (AAAA-MM-DD)',
    bull:'Toro / semen usado', plannedOn:'Previsto para {date}', notes:'Observación (opcional)', save:'Guardar atención', saving:'Guardando…',
    saved:'Atención de {animal} guardada.', savedNew:'Atención guardada y animal {animal} registrado.', alertsCreated:'{count} alerta(s) creada(s).',
    another:'Nueva atención', toList:'Ver lista de corral', unknown:'No se pudo confirmar si la atención se guardó. Revisa la lista de corral antes de registrarla de nuevo.',
    check:'Revisar la lista', rejected:'No se pudo guardar. Revisa los datos e inténtalo de nuevo.', inputsWeb:'Los insumos usados (inventario) y los adjuntos se registran en el sistema web.',
    problems:{client:'Indica el nombre del cliente.',date:'Indica la fecha como AAAA-MM-DD.',future:'La fecha no puede ser posterior a hoy.',animal:'Escribe el nombre o el número del animal.',
      stepDone:'Elige Hecho o No hecho.',stepDate:'Indica la fecha en que se hizo.',stepBull:'Indica el toro o semen usado.',category:'Elige la categoría del animal.',
      diagnosis:'Elige el diagnóstico: preñada o vacía.',conduct:'Elige la conducta.',method:'Elige cómo fue la cubrición.',gestation:'Indica la edad gestacional en días (0 a 320).'},
    conducts:{iatf_protocol:'Protocolo IATF',observe_heat:'Observar celo',induction:'Inducción',discard:'Descarte'},
    methods:{artificial:'Inseminación artificial',natural:'Monta natural'},
    discard:{repeat_open:'Vacía repetida',age:'Edad',low_production:'Baja producción',health:'Sanidad',other:'Otro'},
  },
  title:'Área del veterinario', curral:'Alertas y lista de corral', subtitle:'Lo que hay que hacer, para llevar al corral.',
  loading:'Cargando…', error:'No se pudo cargar el área del veterinario. Revisa la conexión e inténtalo de nuevo.', retry:'Reintentar',
  noAccess:'El área del veterinario no está contratada para esta organización o tu cargo no tiene acceso.',
  empty:'Aún no hay animales. Después de la primera atención, la lista de corral aparece aquí.', none:'Ningún animal con estos filtros.',
  search:'Arete, animal o finca', allClients:'Todas las fincas', refresh:'Actualizar', updated:'Actualizado a las {time}',
  late:'Atrasados', today:'Hoy', week:'En 7 días', count:'{count} animal(es)', lateDays:'atrasado {days} día(s)', noDate:'Sin fecha',
  next:'Próximo', last:'Último', web:'Abrir en el sistema web', failedLink:'No se pudo abrir el sistema web.', back:'Volver',
  readOnlyHint:'Clientes, cobro, informe y rebaño siguen en el sistema web por ahora.',
  presets:{all:'Todos',late:'Atrasados',today:'Hoy',week:'Próx. 7 días',protocol:'En protocolo',inseminated:'Inseminadas',pregnant:'Preñadas',open:'Vacías'},
  status:{protocol:'En protocolo',inseminated:'Inseminada',pregnant:'Preñada',open:'Vacía',attended:'Atendida',none:'Sin registro'},
  deadline:{late:'Atrasado',today:'Hoy',week:'Esta semana',later:'Más adelante',nodate:'Sin fecha'},
  category:{vaca_solteira:'Vaca seca',vaca_parida:'Vaca parida',novilha:'Novilla'},
  kind:{insemination:'Inseminación',protocol:'Protocolo IATF',iatf_insemination:'IATF (inseminar)',ultrasound:'Ecografía',palpation:'Palpación',other:'Otro'},
  nextCode:{
    alert_calving:'Parto previsto', alert_removal:'Retirar dispositivo + prostaglandina + inductor de ovulación + eCG (D{day})', alert_inseminate:'Inseminar (D{day})',
    alert_observe_heat:'Observar celo', alert_induction_review:'Reevaluar tras la inducción', alert_ultrasound:'Ecografía (diagnóstico)', first:'Primera atención',
    inseminate_iatf:'Inseminar (IATF)', ultrasound:'Ecografía (diagnóstico)', calving:'Parto', discard:'Descarte', observe_heat:'Observar celo',
    induction_review:'Reevaluar tras la inducción', define_conduct:'Definir conducta', new:'Nueva atención',
  },
};

export const veterinaryMessages:Record<Language,VeterinaryCopy>={
  'pt-BR':pt,
  'pt-PT':{...pt,loading:'A carregar…',search:'Brinco, animal ou exploração',allClients:'Todas as explorações',updated:'Atualizado às {time}',
    readOnlyHint:'Clientes, cobrança, relatório e rebanho continuam no sistema web por agora.',
    empty:'Ainda não há animais. Depois do primeiro atendimento, a lista de curral aparece aqui.',
    launch:{...pt.launch,title:'Registar atendimento',start:'Registar atendimento',save:'Guardar atendimento',saving:'A guardar…',checking:'A procurar o animal…',
      unknown:'Não foi possível confirmar se o atendimento foi guardado. Confira a lista de curral antes de registar de novo.',rejected:'Não foi possível guardar. Confira os dados e tente novamente.'}},
  en, es,
};

/** Fills {name} placeholders. */
export function fill(text:string,values:Record<string,string|number>){return text.replace(/\{(\w+)\}/g,(_,key:string)=>String(values[key]??''));}

/** Readable lines of one history procedure (same facts the web history shows, without values). */
export function historyLines(copy:VeterinaryCopy,item:{kind:string;result:string;semen:string;bull:string;notes:string;responsible:string;conduct:string;
  management_days:number|null;protocol_start:string|null;return_days:number;discard_reason:string;gestation_now:number|null;gestation_days:number;
  calving_date:string|null;coverage_method:string;step:string;step_day:number|null;rescheduled_to:string|null;not_done:boolean},date:(day:string)=>string){
  const a=copy.animals,l=copy.launch;
  const title=item.step==='removal'?fill(a.removal,{day:item.step_day??''}):item.step==='insemination'&&item.kind!=='insemination'?a.iatf:copy.kind[item.kind]??item.kind;
  const lines:string[]=[];
  if(item.not_done)lines.push(a.notDone);
  if(item.result==='pregnant'){
    if(item.calving_date)lines.push(fill(a.gestation,{days:item.gestation_now??item.gestation_days,date:date(item.calving_date)}));
    if(item.coverage_method)lines.push(fill(a.method,{value:l.methods[item.coverage_method]??item.coverage_method}));
  }
  if(item.conduct){
    lines.push(l.conducts[item.conduct]??item.conduct);
    if(item.conduct==='iatf_protocol'&&item.management_days&&item.protocol_start)lines.push(fill(a.protocol,{days:item.management_days,date:date(item.protocol_start)}));
    if((item.conduct==='observe_heat'||item.conduct==='induction')&&item.return_days)lines.push(fill(a.returnIn,{days:item.return_days}));
    if(item.conduct==='discard'&&item.discard_reason)lines.push(fill(a.discard,{value:l.discard[item.discard_reason]??item.discard_reason}));
  }
  if(item.semen)lines.push(fill(a.semen,{value:item.semen}));
  else if(item.bull)lines.push(fill(a.bull,{value:item.bull}));
  if(item.rescheduled_to)lines.push(fill(a.rescheduled,{date:date(item.rescheduled_to)}));
  if(item.responsible)lines.push(fill(a.responsible,{value:item.responsible}));
  if(item.notes)lines.push(fill(a.notes,{value:item.notes}));
  const result=item.result==='pregnant'?a.pregnant:item.result==='open'?a.open:'';
  return {title,result,lines};
}
