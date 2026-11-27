import type {Language} from '../../i18n/messages';

const pt={title:'Sem conexão · somente consulta',body:'Mostrando dados salvos neste aparelho. Última confirmação com o servidor: {date}. Envios ficam bloqueados; telas não abertas com conexão não têm dados salvos.',retry:'Tentar conectar',checking:'Conectando…'};
type Copy=Record<keyof typeof pt,string>;
const en:Copy={title:'No connection · read-only',body:'Showing data saved on this device. Last server confirmation: {date}. Sending is blocked; screens not opened while online have no saved data.',retry:'Try to connect',checking:'Connecting…'};
const es:Copy={title:'Sin conexión · solo consulta',body:'Mostrando datos guardados en este dispositivo. Última confirmación con el servidor: {date}. Los envíos están bloqueados; las pantallas no abiertas con conexión no tienen datos guardados.',retry:'Intentar conectar',checking:'Conectando…'};
export const offlineMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,title:'Sem ligação · só consulta',body:'A mostrar dados guardados neste aparelho. Última confirmação com o servidor: {date}. Os envios estão bloqueados; ecrãs não abertos com ligação não têm dados guardados.',retry:'Tentar ligar',checking:'A ligar…'}};
