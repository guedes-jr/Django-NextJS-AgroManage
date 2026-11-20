import type { Language } from '../../i18n/messages';
import type { SwinePhase } from './contracts';

type Copy = {
  title: string;
  subtitle: string;
  scopeHint: string;
  open: string;
  total: string;
  loading: string;
  error: string;
  denied: string;
  empty: string;
  retry: string;
  previous: string;
  next: string;
  page: string;
  identifier: string;
  batch: string;
  age: string;
  weight: string;
  entry: string;
  birthDate: string;
  status: string;
  parity: string;
  openDays: string;
  lastCoverage: string;
  coverage: string;
  gestationDays: string;
  daysRemaining: string;
  forecast: string;
  bornAlive: string;
  currentAlive: string;
  deaths: string;
  weaning: string;
  quantity: string;
  days: string;
  dayUnit: string;
  readyNow: string;
  dailyGain: string;
  unavailable: string;
  detail: string;
  close: string;
  phaseSummary: string;
  phase: Record<SwinePhase, string>;
  state: Record<string, string>;
};

const pt: Copy = {
  title: 'Suinocultura',
  subtitle: 'Acompanhe os animais e lotes por fase produtiva.',
  scopeHint: 'Dados de todas as fazendas autorizadas da organização; este serviço ainda não permite filtrar por fazenda.',
  open: 'Ver fase',
  total: 'registros',
  loading: 'Carregando fases…',
  error: 'Não foi possível carregar os dados. Confira a conexão e tente novamente.',
  denied: 'Você não tem acesso a esta área.',
  empty: 'Nenhum registro nesta fase.',
  retry: 'Tentar novamente',
  previous: 'Anterior',
  next: 'Próxima',
  page: 'Página',
  identifier: 'Identificação',
  batch: 'Lote',
  age: 'Idade',
  weight: 'Peso',
  entry: 'Entrada',
  birthDate: 'Data do parto',
  status: 'Situação',
  parity: 'Partos',
  openDays: 'Dias em aberto',
  lastCoverage: 'Última cobertura',
  coverage: 'Cobertura',
  gestationDays: 'Dias de gestação',
  daysRemaining: 'Dias restantes',
  forecast: 'Previsão',
  bornAlive: 'Nascidos vivos',
  currentAlive: 'Vivos atualmente',
  deaths: 'Óbitos',
  weaning: 'Previsão de desmame',
  quantity: 'Animais',
  days: 'Dias na fase',
  dayUnit: 'dias',
  readyNow: 'Pronto!',
  dailyGain: 'Ganho diário',
  unavailable: 'Não foi possível abrir esta fase.',
  detail: 'Resumo do registro',
  close: 'Fechar',
  phaseSummary: 'Resumo da fase',
  phase: {
    marras: 'Marrãs',
    matrizes: 'Matrizes',
    gestacao: 'Gestação',
    maternidade: 'Maternidade',
    creche: 'Creche',
    crescimento: 'Crescimento',
    engorda: 'Engorda',
  },
  state: {
    vazia: 'Vazia',
    'em preparo': 'Em preparo',
    pronta: 'Pronta',
    'aguardando cobertura': 'Aguardando cobertura',
    coberta: 'Coberta',
    gestante: 'Gestante',
    lactante: 'Lactante',
    descanso: 'Em descanso',
    'confirmar prenhez': 'Confirmar prenhez',
    'parto próximo': 'Parto próximo',
    desmamado: 'Desmamado',
    'pronto p/ desmame': 'Pronto para desmame',
    lactação: 'Em lactação',
    active: 'Ativo',
    ready_for_growth: 'Pronto para crescimento',
    'pronto p/ engorda': 'Pronto para engorda',
    'em crescimento': 'Em crescimento',
    'pronto para venda': 'Pronto para venda',
    'em engorda': 'Em engorda',
  },
};

const en: Copy = {
  title: 'Swine',
  subtitle: 'Track animals and batches by production phase.',
  scopeHint: 'Data covers all authorized farms in the organization; this service does not yet support filtering by farm.',
  open: 'View phase',
  total: 'records',
  loading: 'Loading phases…',
  error: 'Unable to load the data. Check your connection and try again.',
  denied: 'You do not have access to this area.',
  empty: 'No records in this phase.',
  retry: 'Try again',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  identifier: 'Identifier',
  batch: 'Batch',
  age: 'Age',
  weight: 'Weight',
  entry: 'Entry',
  birthDate: 'Birth date',
  status: 'Status',
  parity: 'Parity',
  openDays: 'Days open',
  lastCoverage: 'Last mating',
  coverage: 'Mating',
  gestationDays: 'Gestation days',
  daysRemaining: 'Days remaining',
  forecast: 'Forecast',
  bornAlive: 'Live-born',
  currentAlive: 'Currently alive',
  deaths: 'Deaths',
  weaning: 'Weaning forecast',
  quantity: 'Animals',
  days: 'Days in phase',
  dayUnit: 'days',
  readyNow: 'Ready now',
  dailyGain: 'Daily gain',
  unavailable: 'Unable to open this phase.',
  detail: 'Record summary',
  close: 'Close',
  phaseSummary: 'Phase summary',
  phase: {
    marras: 'Gilts',
    matrizes: 'Sows',
    gestacao: 'Pregnancy',
    maternidade: 'Maternity',
    creche: 'Nursery',
    crescimento: 'Growing',
    engorda: 'Finishing',
  },
  state: {
    vazia: 'Open',
    'em preparo': 'Preparing',
    pronta: 'Ready',
    'aguardando cobertura': 'Awaiting mating',
    coberta: 'Mated',
    gestante: 'Pregnant',
    lactante: 'Lactating',
    descanso: 'Resting',
    'confirmar prenhez': 'Pregnancy check',
    'parto próximo': 'Birth approaching',
    desmamado: 'Weaned',
    'pronto p/ desmame': 'Ready to wean',
    lactação: 'Lactating',
    active: 'Active',
    ready_for_growth: 'Ready for growing',
    'pronto p/ engorda': 'Ready for finishing',
    'em crescimento': 'Growing',
    'pronto para venda': 'Ready for sale',
    'em engorda': 'Finishing',
  },
};

const es: Copy = {
  title: 'Porcicultura',
  subtitle: 'Consulta animales y lotes por fase productiva.',
  scopeHint: 'Datos de todas las granjas autorizadas de la organización; este servicio aún no permite filtrar por granja.',
  open: 'Ver fase',
  total: 'registros',
  loading: 'Cargando fases…',
  error: 'No se pudieron cargar los datos. Comprueba la conexión e inténtalo de nuevo.',
  denied: 'No tienes acceso a esta área.',
  empty: 'No hay registros en esta fase.',
  retry: 'Reintentar',
  previous: 'Anterior',
  next: 'Siguiente',
  page: 'Página',
  identifier: 'Identificación',
  batch: 'Lote',
  age: 'Edad',
  weight: 'Peso',
  entry: 'Entrada',
  birthDate: 'Fecha del parto',
  status: 'Estado',
  parity: 'Partos',
  openDays: 'Días abiertos',
  lastCoverage: 'Última cubrición',
  coverage: 'Cubrición',
  gestationDays: 'Días de gestación',
  daysRemaining: 'Días restantes',
  forecast: 'Previsión',
  bornAlive: 'Nacidos vivos',
  currentAlive: 'Vivos actualmente',
  deaths: 'Muertes',
  weaning: 'Previsión de destete',
  quantity: 'Animales',
  days: 'Días en fase',
  dayUnit: 'días',
  readyNow: '¡Listo!',
  dailyGain: 'Ganancia diaria',
  unavailable: 'No se pudo abrir esta fase.',
  detail: 'Resumen del registro',
  close: 'Cerrar',
  phaseSummary: 'Resumen de la fase',
  phase: {
    marras: 'Primerizas',
    matrizes: 'Madres',
    gestacao: 'Gestación',
    maternidade: 'Maternidad',
    creche: 'Guardería',
    crescimento: 'Crecimiento',
    engorda: 'Engorde',
  },
  state: {
    vazia: 'Vacía',
    'em preparo': 'En preparación',
    pronta: 'Lista',
    'aguardando cobertura': 'Pendiente de cubrición',
    coberta: 'Cubierta',
    gestante: 'Gestante',
    lactante: 'Lactante',
    descanso: 'En descanso',
    'confirmar prenhez': 'Confirmar gestación',
    'parto próximo': 'Parto próximo',
    desmamado: 'Destetado',
    'pronto p/ desmame': 'Listo para destete',
    lactação: 'En lactación',
    active: 'Activo',
    ready_for_growth: 'Listo para crecimiento',
    'pronto p/ engorda': 'Listo para engorde',
    'em crescimento': 'En crecimiento',
    'pronto para venda': 'Listo para venta',
    'em engorda': 'En engorde',
  },
};

export const swineMessages: Record<Language, Copy> = {
  'pt-BR': pt,
  'pt-PT': {
    ...pt,
    title: 'Suinicultura',
    subtitle: 'Acompanhe os animais e lotes por fase produtiva.',
    scopeHint: 'Dados de todas as explorações autorizadas da organização; este serviço ainda não permite filtrar por exploração.',
    open: 'Ver fase',
    total: 'registos',
    previous: 'Anterior',
    next: 'Seguinte',
    phase: { ...pt.phase, marras: 'Marrãs', maternidade: 'Maternidade' },
    state: { ...pt.state, vazia: 'Vazia', lactação: 'Em lactação' },
  },
  en,
  es,
};

export function swineStatusLabel(status: string, copy: Copy) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').toLocaleLowerCase();
  const key = normalize(status);
  const entry = Object.entries(copy.state).find(([label]) =>
    normalize(label) === key,
  );
  return entry?.[1] ?? status;
}
