import type {PickSource,PickedFile} from '../../features/support/attachments';

export class AttachmentFileError extends Error{constructor(public reason:'permission'|'read'|'share'|'unsupported'){super(reason);}}

/** The web preview does not exercise native pickers; the web system handles attachments itself. */
export async function pickAttachment(_source:PickSource):Promise<PickedFile|null>{throw new AttachmentFileError('unsupported');}
export async function openAttachment(_request:{url:string;headers:Record<string,string>},_attachment:{id:string;filename:string}):Promise<void>{throw new AttachmentFileError('unsupported');}
