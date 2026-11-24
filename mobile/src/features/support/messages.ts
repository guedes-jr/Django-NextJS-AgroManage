import type {Language} from '../../i18n/messages';
const pt={
 title:'Suporte',subtitle:'Seus chamados com a equipe Fazenda+',newTicket:'Abrir chamado',search:'Buscar pelo assunto',all:'Todos',empty:'Nenhum chamado encontrado.',
 statuses:{open:'Aberto',in_progress:'Em atendimento',waiting_customer:'Aguardando você',resolved:'Resolvido',closed:'Fechado'} as Record<string,string>,
 categories:{access:'Acesso',billing:'Cobrança',technical:'Problema técnico',question:'Dúvida',other:'Outro'} as Record<string,string>,
 priorities:{low:'Baixa',normal:'Normal',high:'Alta',urgent:'Urgente'} as Record<string,string>,
 subject:'Assunto',body:'Descreva o que aconteceu',category:'Categoria',priority:'Prioridade',send:'Enviar chamado',openHint:'Inclua o que você tentou fazer, a tela e a mensagem exibida. Anexos podem ser enviados pelo sistema web.',
 conversation:'Conversa',team:'Equipe Fazenda+',you:'Você',noMessages:'Nenhuma mensagem ainda.',reply:'Escreva uma resposta',sendReply:'Enviar resposta',attachments:'anexo(s) disponível(is) no web',
 resolved:'Marcar como resolvido',closed:'Fechar chamado',open:'Reabrir chamado',updated:'Atualizado',
 errSubject:'Informe um assunto com pelo menos 3 caracteres.',errBody:'Descreva o chamado com pelo menos 3 caracteres.',changed:'O chamado foi atualizado por outra pessoa. Recarregamos a conversa; confira antes de enviar novamente.',failed:'Não foi possível enviar. Confira a conexão e tente novamente.',
 detail:'Chamado',
};
type Copy=Omit<Record<keyof typeof pt,string>,'statuses'|'categories'|'priorities'>&{statuses:Record<string,string>;categories:Record<string,string>;priorities:Record<string,string>};
const en:Copy={
 title:'Support',subtitle:'Your tickets with the Fazenda+ team',newTicket:'Open ticket',search:'Search by subject',all:'All',empty:'No tickets found.',
 statuses:{open:'Open',in_progress:'In progress',waiting_customer:'Waiting for you',resolved:'Resolved',closed:'Closed'},
 categories:{access:'Access',billing:'Billing',technical:'Technical issue',question:'Question',other:'Other'},
 priorities:{low:'Low',normal:'Normal',high:'High',urgent:'Urgent'},
 subject:'Subject',body:'Describe what happened',category:'Category',priority:'Priority',send:'Send ticket',openHint:'Include what you tried, the screen and the message shown. Attachments can be sent on the web.',
 conversation:'Conversation',team:'Fazenda+ team',you:'You',noMessages:'No messages yet.',reply:'Write a reply',sendReply:'Send reply',attachments:'attachment(s) available on the web',
 resolved:'Mark as resolved',closed:'Close ticket',open:'Reopen ticket',updated:'Updated',
 errSubject:'Enter a subject with at least 3 characters.',errBody:'Describe the ticket with at least 3 characters.',changed:'Someone else updated the ticket. The conversation was reloaded; check it before sending again.',failed:'Unable to send. Check the connection and try again.',
 detail:'Ticket',
};
const es:Copy={
 title:'Soporte',subtitle:'Tus tickets con el equipo Fazenda+',newTicket:'Abrir ticket',search:'Buscar por asunto',all:'Todos',empty:'No se encontraron tickets.',
 statuses:{open:'Abierto',in_progress:'En atención',waiting_customer:'Esperando tu respuesta',resolved:'Resuelto',closed:'Cerrado'},
 categories:{access:'Acceso',billing:'Cobro',technical:'Problema técnico',question:'Consulta',other:'Otro'},
 priorities:{low:'Baja',normal:'Normal',high:'Alta',urgent:'Urgente'},
 subject:'Asunto',body:'Describe lo que pasó',category:'Categoría',priority:'Prioridad',send:'Enviar ticket',openHint:'Incluye lo que intentaste, la pantalla y el mensaje mostrado. Los adjuntos se pueden enviar en la web.',
 conversation:'Conversación',team:'Equipo Fazenda+',you:'Tú',noMessages:'Aún no hay mensajes.',reply:'Escribe una respuesta',sendReply:'Enviar respuesta',attachments:'adjunto(s) disponible(s) en la web',
 resolved:'Marcar como resuelto',closed:'Cerrar ticket',open:'Reabrir ticket',updated:'Actualizado',
 errSubject:'Indica un asunto con al menos 3 caracteres.',errBody:'Describe el ticket con al menos 3 caracteres.',changed:'Otra persona actualizó el ticket. Recargamos la conversación; revísala antes de enviar de nuevo.',failed:'No se pudo enviar. Revisa la conexión e inténtalo de nuevo.',
 detail:'Ticket',
};
export const supportMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,statuses:{...pt.statuses,waiting_customer:'A aguardar por si'},search:'Procurar pelo assunto'}};
