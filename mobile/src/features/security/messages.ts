import type {Language} from '../../i18n/messages';

const pt={
 lockedTitle:'Fazenda Mais bloqueado',lockedHint:'Desbloqueie para continuar de onde parou.',unlock:'Desbloquear',usePassword:'Entrar com e-mail e senha',
 prompt:'Desbloquear o Fazenda Mais',cancel:'Cancelar',fallback:'Usar senha do aparelho',
 unavailable:'A biometria não está disponível agora. Entre com seu e-mail e senha.',failed:'Não foi possível confirmar. Tente de novo.',
 security:'Segurança',settingFace:'Desbloquear com reconhecimento facial',settingFingerprint:'Desbloquear com digital',settingIris:'Desbloquear com íris',settingDevice:'Desbloquear com biometria',
 settingHint:'Pede a biometria ao abrir o app e ao voltar depois de 2 minutos. Não substitui a senha: quando a sessão expira, é preciso entrar de novo.',
 settingUnavailable:'Cadastre uma biometria nas configurações do aparelho para usar o desbloqueio.',enabled:'Desbloqueio por biometria ativado.',disabled:'Desbloqueio por biometria desativado.',
 about:'Sobre o app',back:'Voltar',version:'Versão',system:'Sistema',server:'Servidor',environment:'Ambiente',production:'Produção',development:'Desenvolvimento',notConfigured:'Não configurado',
 documents:'Documentos',terms:'Termos de uso',privacy:'Política de privacidade',license:'Licença e direitos autorais',accessHelp:'Ajuda para entrar',
 accessHelpText:'Esqueceu a senha? Use "Esqueci minha senha" na tela de entrada. Conta bloqueada ou sem acesso a um módulo? Fale com o administrador da sua organização.',
 linkFailed:'Não foi possível abrir o link. Tente novamente.',
};
type Copy=Record<keyof typeof pt,string>;
const en:Copy={
 lockedTitle:'Fazenda Mais locked',lockedHint:'Unlock to continue where you left off.',unlock:'Unlock',usePassword:'Sign in with email and password',
 prompt:'Unlock Fazenda Mais',cancel:'Cancel',fallback:'Use device passcode',
 unavailable:'Biometrics are not available right now. Sign in with your email and password.',failed:'Unable to confirm. Try again.',
 security:'Security',settingFace:'Unlock with face recognition',settingFingerprint:'Unlock with fingerprint',settingIris:'Unlock with iris',settingDevice:'Unlock with biometrics',
 settingHint:'Asks for biometrics when the app opens and when you return after 2 minutes. It does not replace the password: when the session expires you sign in again.',
 settingUnavailable:'Enroll a biometric in the device settings to use unlock.',enabled:'Biometric unlock turned on.',disabled:'Biometric unlock turned off.',
 about:'About the app',back:'Back',version:'Version',system:'System',server:'Server',environment:'Environment',production:'Production',development:'Development',notConfigured:'Not configured',
 documents:'Documents',terms:'Terms of use',privacy:'Privacy policy',license:'License and copyright',accessHelp:'Sign-in help',
 accessHelpText:'Forgot your password? Use "Forgot password" on the sign-in screen. Account blocked or no access to a module? Contact your organization administrator.',
 linkFailed:'Unable to open the link. Try again.',
};
const es:Copy={
 lockedTitle:'Fazenda Mais bloqueado',lockedHint:'Desbloquea para continuar donde lo dejaste.',unlock:'Desbloquear',usePassword:'Entrar con correo y contraseña',
 prompt:'Desbloquear Fazenda Mais',cancel:'Cancelar',fallback:'Usar código del dispositivo',
 unavailable:'La biometría no está disponible ahora. Entra con tu correo y contraseña.',failed:'No se pudo confirmar. Inténtalo de nuevo.',
 security:'Seguridad',settingFace:'Desbloquear con reconocimiento facial',settingFingerprint:'Desbloquear con huella',settingIris:'Desbloquear con iris',settingDevice:'Desbloquear con biometría',
 settingHint:'Pide la biometría al abrir la app y al volver después de 2 minutos. No reemplaza la contraseña: cuando la sesión vence, debes entrar de nuevo.',
 settingUnavailable:'Registra una biometría en los ajustes del dispositivo para usar el desbloqueo.',enabled:'Desbloqueo biométrico activado.',disabled:'Desbloqueo biométrico desactivado.',
 about:'Acerca de la app',back:'Volver',version:'Versión',system:'Sistema',server:'Servidor',environment:'Entorno',production:'Producción',development:'Desarrollo',notConfigured:'No configurado',
 documents:'Documentos',terms:'Términos de uso',privacy:'Política de privacidad',license:'Licencia y derechos de autor',accessHelp:'Ayuda para entrar',
 accessHelpText:'¿Olvidaste la contraseña? Usa "Olvidé mi contraseña" en la pantalla de acceso. ¿Cuenta bloqueada o sin acceso a un módulo? Habla con el administrador de tu organización.',
 linkFailed:'No se pudo abrir el enlace. Inténtalo de nuevo.',
};
export const securityMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,
 lockedHint:'Desbloqueie para continuar onde parou.',usePassword:'Entrar com e-mail e palavra-passe',fallback:'Usar código do aparelho',
 unavailable:'A biometria não está disponível agora. Entre com o seu e-mail e palavra-passe.',settingFingerprint:'Desbloquear com impressão digital',
 settingHint:'Pede a biometria ao abrir a aplicação e ao voltar após 2 minutos. Não substitui a palavra-passe: quando a sessão expira, é preciso entrar de novo.',
 settingUnavailable:'Registe uma biometria nas definições do aparelho para usar o desbloqueio.',about:'Sobre a aplicação',
 accessHelpText:'Esqueceu a palavra-passe? Use "Esqueci-me da palavra-passe" no ecrã de entrada. Conta bloqueada ou sem acesso a um módulo? Contacte o administrador da sua organização.',
}};
