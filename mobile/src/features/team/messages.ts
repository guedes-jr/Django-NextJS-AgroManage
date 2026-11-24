import type {Language} from '../../i18n/messages';
const pt={title:'Equipe e acessos',subtitle:'Pessoas da organização e seus perfis',search:'Buscar nome ou e-mail',all:'Todos',active:'Ativos',inactive:'Inativos',empty:'Nenhuma pessoa encontrada.',
 roles:{admin:'Administrador',manager:'Gerente',operator:'Operador',feeder:'Tratador',veterinarian:'Veterinário'} as Record<string,string>,
 responsible:'Responsável',readOnly:'Somente leitura',crops:'Plantações',web:'Gerenciar equipe no web',webHint:'Convites, alteração de perfil, escopo de espécies e desativação continuam no sistema web.',total:'Pessoas',};
type Copy=Omit<Record<keyof typeof pt,string>,'roles'>&{roles:Record<string,string>};
const en:Copy={title:'Team and access',subtitle:'Organization people and their profiles',search:'Search name or email',all:'All',active:'Active',inactive:'Inactive',empty:'No people found.',
 roles:{admin:'Administrator',manager:'Manager',operator:'Operator',feeder:'Feeder',veterinarian:'Veterinarian'},responsible:'Responsible',readOnly:'Read only',crops:'Crops',web:'Manage team on the web',webHint:'Invitations, role changes, species scope and deactivation remain on the web.',total:'People'};
const es:Copy={title:'Equipo y accesos',subtitle:'Personas de la organización y sus perfiles',search:'Buscar nombre o correo',all:'Todos',active:'Activos',inactive:'Inactivos',empty:'No se encontraron personas.',
 roles:{admin:'Administrador',manager:'Gerente',operator:'Operador',feeder:'Alimentador',veterinarian:'Veterinario'},responsible:'Responsable',readOnly:'Solo lectura',crops:'Cultivos',web:'Gestionar equipo en la web',webHint:'Invitaciones, cambios de perfil, alcance de especies y desactivación siguen en la web.',total:'Personas'};
export const teamMessages:Record<Language,Copy>={'pt-BR':pt,en,es,'pt-PT':{...pt,search:'Procurar nome ou e-mail'}};
