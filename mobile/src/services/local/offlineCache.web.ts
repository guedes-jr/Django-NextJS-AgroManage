import {createMemoryLocalCache,type LocalCache} from '../../features/offline/contracts';

/** The web preview keeps nothing on disk. */
export function createOfflineCache(namespace:string):LocalCache{return createMemoryLocalCache(namespace);}
