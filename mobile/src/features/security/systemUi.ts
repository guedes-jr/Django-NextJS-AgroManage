/** Tracks system screens the app opens on purpose (camera, gallery, files, share) so returning from them does not lock. */
let open=0;let endedAt:number|null=null;
export async function withSystemUi<T>(run:()=>Promise<T>):Promise<T>{
 open+=1;
 try{return await run();}
 finally{open-=1;endedAt=Date.now();}
}
export const systemUiState=()=>({active:open>0,endedAt});
