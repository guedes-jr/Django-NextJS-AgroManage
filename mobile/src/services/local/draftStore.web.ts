import {createMemoryDraftStore,type DraftStore} from '../../features/drafts/store';

/** The web preview keeps nothing on disk: drafts vanish with the tab. */
export function createDraftStore():DraftStore{return createMemoryDraftStore();}
