import type {Language} from '../../i18n/messages';
import type {DraftFeature} from './contracts';

const pt={
 title:'Rascunhos',subtitle:'Guardados só neste aparelho. Nada é enviado sem você revisar e confirmar.',empty:'Nenhum rascunho neste aparelho.',open:'Rascunhos neste aparelho',
 resume:'Retomar',discard:'Descartar',discardTitle:'Descartar rascunho?',discardBody:'O conteúdo será apagado deste aparelho.',cancel:'Cancelar',
 saving:'Salvando rascunho…',savedAt:'Rascunho salvo neste aparelho às {time}.',saveError:'Não foi possível salvar o rascunho neste aparelho. O formulário continua funcionando.',
 tooLarge:'O conteúdo é grande demais para guardar como rascunho.',restored:'Rascunho de {date} restaurado. Confira os dados antes de enviar.',
 incompatible:'Há um rascunho de uma versão anterior deste formulário que não pode ser reaplicado.',discardOld:'Apagar rascunho antigo',
 unconfirmed:'O último envio deste conteúdo não foi confirmado. Confira se ele já foi registrado antes de enviar de novo.',unconfirmedTag:'Envio não confirmado',
 expires:'Expira em {days} dia(s)',updated:'Atualizado em {date}',
 leaveTitle:'Sair do formulário?',leaveBody:'O que você digitou fica guardado como rascunho neste aparelho.',keep:'Manter rascunho',stay:'Continuar editando',discardAndLeave:'Descartar',
 logoutTitle:'Sair da conta?',logoutBody:'Há {count} rascunho(s) neste aparelho. Ao sair, eles serão apagados.',logoutConfirm:'Sair e apagar',logout:'Sair',
 features:{'cattle-animal':'Cadastro de animal','support-ticket':'Chamado de suporte'} as Record<DraftFeature,string>,
};
type Copy=Omit<Record<keyof typeof pt,string>,'features'>&{features:Record<DraftFeature,string>};
const en:Copy={
 title:'Drafts',subtitle:'Kept on this device only. Nothing is sent until you review and confirm.',empty:'No drafts on this device.',open:'Drafts on this device',
 resume:'Resume',discard:'Discard',discardTitle:'Discard draft?',discardBody:'The content will be deleted from this device.',cancel:'Cancel',
 saving:'Saving draft…',savedAt:'Draft saved on this device at {time}.',saveError:'Unable to save the draft on this device. The form still works.',
 tooLarge:'The content is too large to keep as a draft.',restored:'Draft from {date} restored. Check the data before sending.',
 incompatible:'There is a draft from an older version of this form that cannot be reapplied.',discardOld:'Delete old draft',
 unconfirmed:'The last send of this content was not confirmed. Check whether it was already recorded before sending again.',unconfirmedTag:'Send not confirmed',
 expires:'Expires in {days} day(s)',updated:'Updated {date}',
 leaveTitle:'Leave the form?',leaveBody:'What you typed stays as a draft on this device.',keep:'Keep draft',stay:'Keep editing',discardAndLeave:'Discard',
 logoutTitle:'Sign out?',logoutBody:'There are {count} draft(s) on this device. Signing out deletes them.',logoutConfirm:'Sign out and delete',logout:'Sign out',
 features:{'cattle-animal':'Animal registration','support-ticket':'Support ticket'},
};
const es:Copy={
 title:'Borradores',subtitle:'Guardados solo en este dispositivo. Nada se envía sin que revises y confirmes.',empty:'No hay borradores en este dispositivo.',open:'Borradores en este dispositivo',
 resume:'Retomar',discard:'Descartar',discardTitle:'¿Descartar borrador?',discardBody:'El contenido se borrará de este dispositivo.',cancel:'Cancelar',
 saving:'Guardando borrador…',savedAt:'Borrador guardado en este dispositivo a las {time}.',saveError:'No se pudo guardar el borrador en este dispositivo. El formulario sigue funcionando.',
 tooLarge:'El contenido es demasiado grande para guardarlo como borrador.',restored:'Borrador del {date} restaurado. Revisa los datos antes de enviar.',
 incompatible:'Hay un borrador de una versión anterior de este formulario que no se puede volver a aplicar.',discardOld:'Borrar borrador antiguo',
 unconfirmed:'El último envío de este contenido no se confirmó. Revisa si ya se registró antes de enviarlo de nuevo.',unconfirmedTag:'Envío no confirmado',
 expires:'Vence en {days} día(s)',updated:'Actualizado el {date}',
 leaveTitle:'¿Salir del formulario?',leaveBody:'Lo que escribiste queda como borrador en este dispositivo.',keep:'Mantener borrador',stay:'Seguir editando',discardAndLeave:'Descartar',
 logoutTitle:'¿Cerrar sesión?',logoutBody:'Hay {count} borrador(es) en este dispositivo. Al salir, se borrarán.',logoutConfirm:'Salir y borrar',logout:'Salir',
 features:{'cattle-animal':'Registro de animal','support-ticket':'Ticket de soporte'},
};
export const draftMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,
 subtitle:'Guardados apenas neste aparelho. Nada é enviado sem rever e confirmar.',saving:'A guardar rascunho…',savedAt:'Rascunho guardado neste aparelho às {time}.',
 saveError:'Não foi possível guardar o rascunho neste aparelho. O formulário continua a funcionar.',tooLarge:'O conteúdo é demasiado grande para guardar como rascunho.',
 restored:'Rascunho de {date} reposto. Confirme os dados antes de enviar.',leaveBody:'O que escreveu fica guardado como rascunho neste aparelho.',stay:'Continuar a editar',
 unconfirmed:'O último envio deste conteúdo não foi confirmado. Verifique se já foi registado antes de enviar de novo.',
}};
