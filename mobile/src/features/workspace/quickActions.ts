import type { User } from '../auth/contracts';
import type { Language } from '../../i18n/messages';
import { taskWriteAccess } from '../agenda/contracts';
import { canCreateCattle } from '../cattle/contracts';
import { canWriteClinic } from '../clinic/contracts';
import { canWriteDailyFeeding } from '../feeding/contracts';
import { canWriteInventory } from '../inventory/contracts';
import { canOpenModule, type ModuleKey } from '../home/contracts';
import type { HomeIconName } from '../home/HomeIcon';
import { nativeDestination } from './navigation';

export type QuickActionId = 'milk' | 'feeding' | 'clinic' | 'task' | 'dairyAnimal' | 'beefAnimal' | 'stock' | 'swine' | 'crops' | 'finance' | 'structure';
export type QuickDestination = { pathname: string; params?: Record<string, string> };
// `destination: null` means the routine is not native yet and opens the web alternative panel.
export type QuickAction = { id: QuickActionId; module: ModuleKey; icon: HomeIconName; destination: QuickDestination | null };

// Ordered by how often the routine is recorded in the field. Every gate mirrors the destination screen's own check;
// hiding an action is a convenience, the server remains the authority.
export function quickActions(user: User): QuickAction[] {
  const { access } = user;
  if (access.read_only) return [];
  const can = (key: ModuleKey) => canOpenModule(access, key);
  const native = (key: ModuleKey) => nativeDestination(key, true) as QuickDestination | null;
  const actions: (QuickAction | false)[] = [
    can('dairy') && canCreateCattle(user) && { id: 'milk', module: 'dairy', icon: 'chart', destination: { pathname: '/milk' } },
    can('feeding') && canWriteDailyFeeding(user) && { id: 'feeding', module: 'feeding', icon: 'box', destination: { pathname: '/feeding' } },
    can('clinic') && canWriteClinic(user) && { id: 'clinic', module: 'clinic', icon: 'heart', destination: native('clinic') },
    can('agenda') && taskWriteAccess(user) === 'full' && { id: 'task', module: 'agenda', icon: 'agenda', destination: native('agenda') },
    can('dairy') && canCreateCattle(user) && { id: 'dairyAnimal', module: 'dairy', icon: 'plus', destination: native('dairy') },
    can('beef') && canCreateCattle(user) && { id: 'beefAnimal', module: 'beef', icon: 'plus', destination: native('beef') },
    can('inventory') && canWriteInventory(user) && { id: 'stock', module: 'inventory', icon: 'box', destination: { pathname: '/inventory/launch' } },
    can('swine') && { id: 'swine', module: 'swine', icon: 'pig', destination: null },
    can('crops') && { id: 'crops', module: 'crops', icon: 'leaf', destination: null },
    can('finance') && { id: 'finance', module: 'finance', icon: 'wallet', destination: null },
    can('structure') && { id: 'structure', module: 'structure', icon: 'home', destination: null },
  ];
  return actions.filter((action): action is QuickAction => !!action);
}

type Copy = { title: string; hint: string; web: string; actions: Record<QuickActionId, { label: string; description: string }> };
const pt: Copy = {
  title: 'Registrar agora', hint: 'Escolha a rotina. Ela abre com a fazenda e a data de hoje.', web: 'Abre no sistema web',
  actions: {
    milk: { label: 'Lançar leite', description: 'Produção por animal ou total' },
    feeding: { label: 'Registrar trato', description: 'Fornecimento do dia por lote' },
    clinic: { label: 'Nova ocorrência', description: 'Tratamento, vacina ou medicação' },
    task: { label: 'Nova atividade', description: 'Tarefa ou lembrete na agenda' },
    dairyAnimal: { label: 'Novo animal leiteiro', description: 'Cadastro na pecuária leiteira' },
    beefAnimal: { label: 'Novo animal de corte', description: 'Cadastro no gado de corte' },
    stock: { label: 'Movimentar estoque', description: 'Entrada ou saída de produtos' },
    swine: { label: 'Suinocultura', description: 'Lançamentos de suínos' },
    crops: { label: 'Plantações', description: 'Operações de lavoura' },
    finance: { label: 'Lançamento financeiro', description: 'Receitas e despesas' },
    structure: { label: 'Estrutura da fazenda', description: 'Pastos, instalações e áreas' },
  },
};
const en: Copy = {
  title: 'Record now', hint: 'Pick the routine. It opens with today’s farm and date.', web: 'Opens in the web system',
  actions: {
    milk: { label: 'Record milk', description: 'Per animal or farm total' },
    feeding: { label: 'Record feeding', description: 'Today’s delivery per batch' },
    clinic: { label: 'New health event', description: 'Treatment, vaccine or medication' },
    task: { label: 'New activity', description: 'Task or reminder in the calendar' },
    dairyAnimal: { label: 'New dairy animal', description: 'Dairy herd registration' },
    beefAnimal: { label: 'New beef animal', description: 'Beef herd registration' },
    stock: { label: 'Move inventory', description: 'Product receipt or issue' },
    swine: { label: 'Swine', description: 'Swine records' },
    crops: { label: 'Crops', description: 'Field operations' },
    finance: { label: 'Financial entry', description: 'Revenue and expenses' },
    structure: { label: 'Farm structure', description: 'Pastures, facilities and areas' },
  },
};
const es: Copy = {
  title: 'Registrar ahora', hint: 'Elige la rutina. Se abre con la finca y la fecha de hoy.', web: 'Se abre en el sistema web',
  actions: {
    milk: { label: 'Registrar leche', description: 'Por animal o total de la finca' },
    feeding: { label: 'Registrar alimentación', description: 'Suministro del día por lote' },
    clinic: { label: 'Nueva ocurrencia', description: 'Tratamiento, vacuna o medicación' },
    task: { label: 'Nueva actividad', description: 'Tarea o recordatorio en la agenda' },
    dairyAnimal: { label: 'Nuevo animal lechero', description: 'Registro en ganadería lechera' },
    beefAnimal: { label: 'Nuevo animal de carne', description: 'Registro en ganado de carne' },
    stock: { label: 'Mover inventario', description: 'Entrada o salida de productos' },
    swine: { label: 'Porcicultura', description: 'Registros de cerdos' },
    crops: { label: 'Cultivos', description: 'Operaciones de cultivo' },
    finance: { label: 'Registro financiero', description: 'Ingresos y gastos' },
    structure: { label: 'Estructura de la finca', description: 'Potreros, instalaciones y áreas' },
  },
};
const ptPT: Copy = {
  ...pt, title: 'Registar agora', hint: 'Escolha a rotina. Abre com a exploração e a data de hoje.',
  actions: {
    ...pt.actions,
    milk: { label: 'Lançar leite', description: 'Produção por animal ou total' },
    feeding: { label: 'Registar alimentação', description: 'Fornecimento do dia por lote' },
    dairyAnimal: { label: 'Novo animal leiteiro', description: 'Registo na pecuária leiteira' },
    beefAnimal: { label: 'Novo animal de carne', description: 'Registo no gado de carne' },
    stock: { label: 'Movimentar existências', description: 'Entrada ou saída de produtos' },
    structure: { label: 'Estrutura da exploração', description: 'Pastagens, instalações e áreas' },
  },
};
export const quickActionMessages: Record<Language, Copy> = { 'pt-BR': pt, 'pt-PT': ptPT, en, es };
