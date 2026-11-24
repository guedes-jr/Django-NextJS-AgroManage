import type {PropsWithChildren} from 'react';
import {usePathname} from 'expo-router';
import {WorkspaceShell,type WorkspaceArea} from './WorkspaceShell';

/** Area highlighted in the shell, derived from the route so secondary screens keep the right context. */
export function areaForPath(path:string):WorkspaceArea{
 const p=path.toLowerCase();
 if(p.startsWith('/agenda'))return 'agenda';
 if(p.startsWith('/milk'))return 'milk';
 if(p.startsWith('/inventory')||p.startsWith('/feed/')||p==='/feed')return 'inventory';
 if(p.startsWith('/feeding'))return 'feeding';
 if(p.startsWith('/clinic'))return 'clinic';
 if(p.startsWith('/notifications'))return 'notifications';
 if(p.startsWith('/cattle/dairy'))return 'dairy';
 if(p.startsWith('/cattle'))return 'beef';
 if(p.startsWith('/swine'))return 'swine';
 if(p.startsWith('/veterinary'))return 'veterinary';
 if(p.startsWith('/profile'))return 'profile';
 if(p.startsWith('/finance'))return 'finance';
 if(p.startsWith('/crops'))return 'crops';
 if(p.startsWith('/structures'))return 'structure';
 if(p.startsWith('/support'))return 'support';
 if(p.startsWith('/assistant'))return 'assistant';
 if(p.startsWith('/reports'))return 'reports';
 if(p.startsWith('/organization')||p.startsWith('/team'))return 'settings';
 if(p.startsWith('/search'))return 'search';
 return 'other';
}
/**
 * Secondary screens and forms: same brand header (with back + title) and bottom navigation as the main areas.
 * Keeps the former AgendaShell signature so screens migrate without logic changes. The navigation hides while the keyboard is open.
 */
export function AgendaShell({title,onBack,children,layout='wide'}:PropsWithChildren<{title:string;backLabel?:string;onBack:()=>void;layout?:'wide'|'form'}>){
 const path=usePathname();
 return <WorkspaceShell active={areaForPath(path)} title={title} onBack={onBack} layout={layout}>{children}</WorkspaceShell>;
}
export function AgendaFormShell(props:PropsWithChildren<{title:string;backLabel?:string;onBack:()=>void;layout?:'form'|'wide'}>){
 return <AgendaShell {...props} layout="form"/>;
}
