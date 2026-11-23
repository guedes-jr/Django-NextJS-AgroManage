import type { Language } from '../../i18n/messages';
import type { SwinePhase } from './contracts';

type Copy = {
  title: string;
  subtitle: string;
  scopeHint: string;
  open: string;
  openRecord: string;
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
  dateOfBirth: string;
  status: string;
  farm: string;
  phaseLabel: string;
  category: string;
  origin: string;
  exit: string;
  startDate: string;
  cycles: string;
  cycle: string;
  matingType: string;
  sire: string;
  pregnancyStatus: string;
  expectedBirth: string;
  totalBorn: string;
  stillborn: string;
  mummified: string;
  avgBirthWeight: string;
  expectedWeaningDays: string;
  notes: string;
  historyTitle: string;
  historyHint: string;
  showHistory: string;
  emptyHistory: string;
  eventTypes: Record<string, string>;
  amount: string;
  cost: string;
  buyer: string;
  cause: string;
  totalWeight: string;
  averagePerAnimal: string;
  entryWeight: string;
  entryQuantity: string;
  endDate: string;
  currentPhase: string;
  dosage: string;
  animalsTreated: string;
  inventoryAmount: string;
  reason: string;
  parity: string;
  openDays: string;
  lastCoverage: string;
  coverage: string;
  gestationDays: string;
  daysRemaining: string;
  forecast: string;
  estimatedForecast: string;
  estimatedCoverage: string;
  estimatedWeaning: string;
  recordedExit: string;
  weighingTitle: string;
  weightKg: string;
  weighingDate: string;
  reviewWeighing: string;
  weighingReviewHint: string;
  confirmWeighing: string;
  editWeighing: string;
  newWeighing: string;
  weighingSaved: string;
  weighingInvalid: string;
  weighingError: string;
  weighingUnconfirmed: string;
  weighingChanged: string;
  matingTitle: string;
  matingDate: string;
  matingTypes: Record<'natural' | 'ai' | 'iatf', string>;
  sireInfo: string;
  reviewMating: string;
  matingReviewHint: string;
  confirmMating: string;
  editMating: string;
  matingSaved: string;
  matingInvalid: string;
  matingError: string;
  matingUnconfirmed: string;
  matingChanged: string;
  diagnosisTitle: string;
  diagnosisHint: string;
  diagnosisDate: string;
  diagnosisResult: string;
  diagnosisResults: Record<'positive' | 'negative', string>;
  reviewDiagnosis: string;
  diagnosisReviewHint: string;
  confirmDiagnosis: string;
  editDiagnosis: string;
  diagnosisSaved: string;
  diagnosisInvalid: string;
  diagnosisError: string;
  diagnosisUnconfirmed: string;
  diagnosisChanged: string;
  diagnosisUnavailable: string;
  diagnosisCheckHistory: string;
  diagnosisLimited: string;
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
  openRecord: 'Ver ficha completa',
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
  dateOfBirth: 'Nascimento',
  status: 'Situação',
  farm: 'Fazenda',
  phaseLabel: 'Fase',
  category: 'Categoria',
  origin: 'Origem',
  exit: 'Saída',
  startDate: 'Início da gestação',
  cycles: 'Histórico reprodutivo',
  cycle: 'Ciclo',
  matingType: 'Tipo de cobertura',
  sire: 'Reprodutor',
  pregnancyStatus: 'Situação da gestação',
  expectedBirth: 'Previsão de parto',
  totalBorn: 'Total de nascidos',
  stillborn: 'Natimortos',
  mummified: 'Mumificados',
  avgBirthWeight: 'Peso médio ao nascer',
  expectedWeaningDays: 'Dias previstos até o desmame',
  notes: 'Observações',
  historyTitle: 'Histórico do lote',
  historyHint: 'Inclui fases anteriores e lotes de origem quando disponíveis.',
  showHistory: 'Abrir histórico',
  emptyHistory: 'Nenhum evento disponível para este lote.',
  eventTypes: { phase: 'Fase', feed: 'Ração', weight: 'Pesagem', sale: 'Venda', death: 'Mortalidade', vaccine: 'Vacinação' },
  amount: 'Valor',
  cost: 'Custo',
  buyer: 'Comprador',
  cause: 'Causa',
  totalWeight: 'Peso total',
  averagePerAnimal: 'Média por animal',
  entryWeight: 'Peso de entrada',
  entryQuantity: 'Quantidade de entrada',
  endDate: 'Data final',
  currentPhase: 'Fase atual',
  dosage: 'Dosagem',
  animalsTreated: 'Animais atendidos',
  inventoryAmount: 'Quantidade no estoque',
  reason: 'Motivo',
  parity: 'Partos',
  openDays: 'Dias em aberto',
  lastCoverage: 'Última cobertura',
  coverage: 'Cobertura',
  gestationDays: 'Dias de gestação',
  daysRemaining: 'Dias restantes',
  forecast: 'Previsão',
  estimatedForecast: 'Previsão estimada',
  estimatedCoverage: 'Previsão estimada de cobertura',
  estimatedWeaning: 'Previsão estimada de desmame',
  recordedExit: 'Data de saída informada',
  weighingTitle: 'Registrar pesagem média do lote',
  weightKg: 'Peso médio do lote (kg)',
  weighingDate: 'Data da pesagem',
  reviewWeighing: 'Revisar pesagem',
  weighingReviewHint: 'Confirme se o peso informado é a média por animal do lote.',
  confirmWeighing: 'Confirmar pesagem',
  editWeighing: 'Alterar dados',
  newWeighing: 'Nova pesagem',
  weighingSaved: 'Pesagem registrada.',
  weighingInvalid: 'Informe um peso positivo com até três casas decimais e uma data válida.',
  weighingError: 'Não foi possível registrar a pesagem. Verifique os dados e tente novamente.',
  weighingUnconfirmed: 'Não foi possível confirmar se a pesagem foi gravada. Tente novamente com o mesmo envio para evitar duplicidade.',
  weighingChanged: 'O lote mudou desde que a ficha foi aberta. Volte à lista da fase e abra a ficha novamente.',
  matingTitle: 'Registrar cobertura',
  matingDate: 'Data da cobertura',
  matingTypes: { natural: 'Monta natural', ai: 'Inseminação artificial', iatf: 'IATF' },
  sireInfo: 'Reprodutor ou sêmen',
  reviewMating: 'Revisar cobertura',
  matingReviewHint: 'Confira a matriz, a data e o tipo antes de registrar a cobertura.',
  confirmMating: 'Confirmar cobertura',
  editMating: 'Alterar dados',
  matingSaved: 'Cobertura registrada. A previsão de parto é estimada.',
  matingInvalid: 'Informe uma data válida e confira o tipo de cobertura e os limites dos campos.',
  matingError: 'Não foi possível registrar a cobertura. Verifique os dados e tente novamente.',
  matingUnconfirmed: 'Não foi possível confirmar se a cobertura foi gravada. Tente novamente com o mesmo envio para evitar duplicidade.',
  matingChanged: 'A situação reprodutiva mudou desde que a ficha foi aberta. Volte à lista e abra a ficha novamente.',
  diagnosisTitle: 'Registrar diagnóstico de gestação',
  diagnosisHint: 'Registre somente o resultado informado pelo responsável. O app não realiza o diagnóstico; o resultado fica vinculado à cobertura exibida.',
  diagnosisDate: 'Data do diagnóstico',
  diagnosisResult: 'Resultado informado',
  diagnosisResults: { positive: 'Positivo', negative: 'Negativo' },
  reviewDiagnosis: 'Revisar diagnóstico',
  diagnosisReviewHint: 'Confira o resultado e a cobertura vinculada antes de confirmar.',
  confirmDiagnosis: 'Confirmar diagnóstico',
  editDiagnosis: 'Alterar dados',
  diagnosisSaved: 'Diagnóstico registrado.',
  diagnosisInvalid: 'Escolha o resultado e informe uma data entre a cobertura e hoje.',
  diagnosisError: 'Não foi possível registrar o diagnóstico. Verifique os dados.',
  diagnosisUnconfirmed: 'Não foi possível confirmar se o diagnóstico foi gravado. Não envie novamente; confira o histórico reprodutivo.',
  diagnosisChanged: 'A matriz ou a cobertura mudou desde a abertura desta tela. Confira o histórico e reabra a ficha.',
  diagnosisUnavailable: 'Não há cobertura pendente elegível para diagnóstico nesta ficha.',
  diagnosisCheckHistory: 'Conferir histórico reprodutivo',
  diagnosisLimited: 'A previsão da cobertura não é válida para confirmar gestação. Somente o resultado negativo está disponível; confira o cadastro no web.',
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
  openRecord: 'View full record',
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
  dateOfBirth: 'Date of birth',
  status: 'Status',
  farm: 'Farm',
  phaseLabel: 'Phase',
  category: 'Category',
  origin: 'Origin',
  exit: 'Exit',
  startDate: 'Gestation start',
  cycles: 'Reproductive history',
  cycle: 'Cycle',
  matingType: 'Mating type',
  sire: 'Sire',
  pregnancyStatus: 'Pregnancy status',
  expectedBirth: 'Expected birth',
  totalBorn: 'Total born',
  stillborn: 'Stillborn',
  mummified: 'Mummified',
  avgBirthWeight: 'Average birth weight',
  expectedWeaningDays: 'Expected days to weaning',
  notes: 'Notes',
  historyTitle: 'Batch history',
  historyHint: 'Includes previous phases and source batches when available.',
  showHistory: 'Open history',
  emptyHistory: 'No events are available for this batch.',
  eventTypes: { phase: 'Phase', feed: 'Feed', weight: 'Weighing', sale: 'Sale', death: 'Mortality', vaccine: 'Vaccination' },
  amount: 'Amount',
  cost: 'Cost',
  buyer: 'Buyer',
  cause: 'Cause',
  totalWeight: 'Total weight',
  averagePerAnimal: 'Average per animal',
  entryWeight: 'Entry weight',
  entryQuantity: 'Entry quantity',
  endDate: 'End date',
  currentPhase: 'Current phase',
  dosage: 'Dosage',
  animalsTreated: 'Animals treated',
  inventoryAmount: 'Inventory quantity',
  reason: 'Reason',
  parity: 'Parity',
  openDays: 'Days open',
  lastCoverage: 'Last mating',
  coverage: 'Mating',
  gestationDays: 'Gestation days',
  daysRemaining: 'Days remaining',
  forecast: 'Forecast',
  estimatedForecast: 'Estimated forecast',
  estimatedCoverage: 'Estimated mating date',
  estimatedWeaning: 'Estimated weaning date',
  recordedExit: 'Recorded exit date',
  weighingTitle: 'Record average batch weight',
  weightKg: 'Average batch weight (kg)',
  weighingDate: 'Weighing date',
  reviewWeighing: 'Review weighing',
  weighingReviewHint: 'Confirm that the entered weight is the average per animal in this batch.',
  confirmWeighing: 'Confirm weighing',
  editWeighing: 'Change details',
  newWeighing: 'New weighing',
  weighingSaved: 'Weighing recorded.',
  weighingInvalid: 'Enter a positive weight with up to three decimal places and a valid date.',
  weighingError: 'Unable to record the weighing. Check the details and try again.',
  weighingUnconfirmed: 'We could not confirm whether the weighing was saved. Retry the same submission to avoid creating a duplicate.',
  weighingChanged: 'The batch changed after this page was opened. Return to the phase list and open the batch again.',
  matingTitle: 'Record mating',
  matingDate: 'Mating date',
  matingTypes: { natural: 'Natural mating', ai: 'Artificial insemination', iatf: 'Timed AI (IATF)' },
  sireInfo: 'Sire or semen details',
  reviewMating: 'Review mating',
  matingReviewHint: 'Check the female, date and mating type before recording.',
  confirmMating: 'Confirm mating',
  editMating: 'Change details',
  matingSaved: 'Mating recorded. The expected farrowing date is an estimate.',
  matingInvalid: 'Enter a valid date and check the mating type and field limits.',
  matingError: 'Unable to record the mating. Check the details and try again.',
  matingUnconfirmed: 'We could not confirm whether the mating was saved. Retry the same submission to avoid creating a duplicate.',
  matingChanged: 'The reproductive status changed after this page was opened. Return to the list and open the animal again.',
  diagnosisTitle: 'Record pregnancy diagnosis',
  diagnosisHint: 'Record only the result reported by the responsible person. The app does not diagnose; the result is linked to the displayed mating.',
  diagnosisDate: 'Diagnosis date',
  diagnosisResult: 'Reported result',
  diagnosisResults: { positive: 'Positive', negative: 'Negative' },
  reviewDiagnosis: 'Review diagnosis',
  diagnosisReviewHint: 'Check the result and linked mating before confirming.',
  confirmDiagnosis: 'Confirm diagnosis',
  editDiagnosis: 'Change details',
  diagnosisSaved: 'Diagnosis recorded.',
  diagnosisInvalid: 'Choose a result and a date between mating and today.',
  diagnosisError: 'Unable to record the diagnosis. Check the details.',
  diagnosisUnconfirmed: 'We could not confirm whether the diagnosis was saved. Do not resubmit; check reproductive history.',
  diagnosisChanged: 'The female or mating changed after this page was opened. Check history and reopen the record.',
  diagnosisUnavailable: 'No eligible pending mating is available for diagnosis on this record.',
  diagnosisCheckHistory: 'Check reproductive history',
  diagnosisLimited: 'The mating forecast is not valid for confirming pregnancy. Only a negative result is available; check the record on the web.',
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
  openRecord: 'Ver ficha completa',
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
  dateOfBirth: 'Fecha de nacimiento',
  status: 'Estado',
  farm: 'Granja',
  phaseLabel: 'Fase',
  category: 'Categoría',
  origin: 'Origen',
  exit: 'Salida',
  startDate: 'Inicio de gestación',
  cycles: 'Historial reproductivo',
  cycle: 'Ciclo',
  matingType: 'Tipo de cubrición',
  sire: 'Reproductor',
  pregnancyStatus: 'Estado de gestación',
  expectedBirth: 'Fecha prevista de parto',
  totalBorn: 'Total nacidos',
  stillborn: 'Nacidos muertos',
  mummified: 'Momificados',
  avgBirthWeight: 'Peso medio al nacer',
  expectedWeaningDays: 'Días previstos hasta el destete',
  notes: 'Observaciones',
  historyTitle: 'Historial del lote',
  historyHint: 'Incluye fases anteriores y lotes de origen cuando estén disponibles.',
  showHistory: 'Abrir historial',
  emptyHistory: 'No hay eventos disponibles para este lote.',
  eventTypes: { phase: 'Fase', feed: 'Alimentación', weight: 'Pesaje', sale: 'Venta', death: 'Mortalidad', vaccine: 'Vacunación' },
  amount: 'Importe',
  cost: 'Coste',
  buyer: 'Comprador',
  cause: 'Causa',
  totalWeight: 'Peso total',
  averagePerAnimal: 'Promedio por animal',
  entryWeight: 'Peso de entrada',
  entryQuantity: 'Cantidad de entrada',
  endDate: 'Fecha final',
  currentPhase: 'Fase actual',
  dosage: 'Dosis',
  animalsTreated: 'Animales tratados',
  inventoryAmount: 'Cantidad en inventario',
  reason: 'Motivo',
  parity: 'Partos',
  openDays: 'Días abiertos',
  lastCoverage: 'Última cubrición',
  coverage: 'Cubrición',
  gestationDays: 'Días de gestación',
  daysRemaining: 'Días restantes',
  forecast: 'Previsión',
  estimatedForecast: 'Previsión estimada',
  estimatedCoverage: 'Previsión estimada de cubrición',
  estimatedWeaning: 'Previsión estimada de destete',
  recordedExit: 'Fecha de salida registrada',
  weighingTitle: 'Registrar peso medio del lote',
  weightKg: 'Peso medio del lote (kg)',
  weighingDate: 'Fecha del pesaje',
  reviewWeighing: 'Revisar pesaje',
  weighingReviewHint: 'Confirma que el peso indicado es el promedio por animal del lote.',
  confirmWeighing: 'Confirmar pesaje',
  editWeighing: 'Cambiar datos',
  newWeighing: 'Nuevo pesaje',
  weighingSaved: 'Pesaje registrado.',
  weighingInvalid: 'Indica un peso positivo con hasta tres decimales y una fecha válida.',
  weighingError: 'No se pudo registrar el pesaje. Revisa los datos e inténtalo de nuevo.',
  weighingUnconfirmed: 'No se pudo confirmar si se guardó el pesaje. Reintenta el mismo envío para evitar duplicados.',
  weighingChanged: 'El lote cambió desde que se abrió esta ficha. Vuelve a la lista de la fase y abre el lote de nuevo.',
  matingTitle: 'Registrar cubrición',
  matingDate: 'Fecha de cubrición',
  matingTypes: { natural: 'Monta natural', ai: 'Inseminación artificial', iatf: 'IATF' },
  sireInfo: 'Reproductor o semen',
  reviewMating: 'Revisar cubrición',
  matingReviewHint: 'Comprueba la hembra, la fecha y el tipo antes de registrar la cubrición.',
  confirmMating: 'Confirmar cubrición',
  editMating: 'Cambiar datos',
  matingSaved: 'Cubrición registrada. La fecha prevista de parto es estimada.',
  matingInvalid: 'Indica una fecha válida y comprueba el tipo de cubrición y los límites de los campos.',
  matingError: 'No se pudo registrar la cubrición. Revisa los datos e inténtalo de nuevo.',
  matingUnconfirmed: 'No se pudo confirmar si se guardó la cubrición. Reintenta el mismo envío para evitar duplicados.',
  matingChanged: 'El estado reproductivo cambió desde que se abrió esta ficha. Vuelve a la lista y abre el animal de nuevo.',
  diagnosisTitle: 'Registrar diagnóstico de gestación',
  diagnosisHint: 'Registra solo el resultado indicado por el responsable. La app no diagnostica; el resultado se vincula a la cubrición mostrada.',
  diagnosisDate: 'Fecha del diagnóstico',
  diagnosisResult: 'Resultado informado',
  diagnosisResults: { positive: 'Positivo', negative: 'Negativo' },
  reviewDiagnosis: 'Revisar diagnóstico',
  diagnosisReviewHint: 'Comprueba el resultado y la cubrición vinculada antes de confirmar.',
  confirmDiagnosis: 'Confirmar diagnóstico',
  editDiagnosis: 'Cambiar datos',
  diagnosisSaved: 'Diagnóstico registrado.',
  diagnosisInvalid: 'Elige el resultado e indica una fecha entre la cubrición y hoy.',
  diagnosisError: 'No se pudo registrar el diagnóstico. Revisa los datos.',
  diagnosisUnconfirmed: 'No se pudo confirmar si se guardó el diagnóstico. No lo vuelvas a enviar; consulta el historial reproductivo.',
  diagnosisChanged: 'La hembra o la cubrición cambió desde que se abrió esta ficha. Consulta el historial y vuelve a abrir el registro.',
  diagnosisUnavailable: 'No hay una cubrición pendiente elegible para diagnóstico en esta ficha.',
  diagnosisCheckHistory: 'Consultar historial reproductivo',
  diagnosisLimited: 'La previsión de la cubrición no es válida para confirmar la gestación. Solo está disponible el resultado negativo; revisa el registro en la web.',
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
