import Image from 'next/image';
import { Fragment } from 'react';
export function safeMarketingUrl(url: string) { try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; } }
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_|~~[^~]+~~|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={i}>{part.slice(2, -2)}</s>;
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match && safeMarketingUrl(match[2])) return <a key={i} href={safeMarketingUrl(match[2])} target="_blank" rel="noopener noreferrer">{match[1]}</a>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export default function MarketingContent({body, images = [], link_url, link_label}: {body: string; images?: {id: string; image: string}[]; link_url?: string; link_label?: string}) {
  return <div className="marketing-content">{body.split('\n').map((line, i) => <div key={i} style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minHeight: '1.3em'}}>{line.startsWith('- ') ? <>• {inline(line.slice(2))}</> : inline(line)}</div>)}<div className="d-flex flex-wrap gap-2 mt-3">{images.map(image => <a href={safeMarketingUrl(image.image)} target="_blank" rel="noopener noreferrer" key={image.id}><Image unoptimized width={240} height={280} src={image.image} alt="Imagem da divulgação" style={{maxWidth: '100%', width: 240, maxHeight: 280, objectFit: 'contain', borderRadius: 12}} /></a>)}</div>{link_url && safeMarketingUrl(link_url) && <a className="btn btn-success mt-3" href={safeMarketingUrl(link_url)} target="_blank" rel="noopener noreferrer">{link_label || 'Saiba mais'}</a>}</div>;
}
