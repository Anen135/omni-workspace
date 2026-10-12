import { label, record } from '../../services/omni-client';
import { materialLink } from './teaching-materials';

function plainText(value: unknown): string {
  return new DOMParser().parseFromString(label(value), 'text/html').body.textContent || '';
}
export function MaterialContent({ value }: { value: unknown }) {
  let content = value;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { return <p>{plainText(content)}</p>; }
  }
  if (!content || typeof content !== 'object' || !('blocks' in content) || !Array.isArray(content.blocks)) return <p>Содержимое этого формата доступно в оригинальном Omni.</p>;
  return <div>{content.blocks.map((block, index) => {
    const item = record(block);
    const data = record(item.data);
    if (item.type === 'header') return <h4 key={index}>{plainText(data.text)}</h4>;
    if (item.type === 'paragraph' || item.type === 'quote') return <p key={index}>{plainText(data.text)}</p>;
    if (item.type === 'code') return <pre key={index}>{label(data.code)}</pre>;
    if (item.type === 'list' && Array.isArray(data.items)) return <ul key={index}>{data.items.map((item: unknown, i: number) => <li key={i}>{plainText(typeof item === 'object' && item && 'content' in item ? item.content : item)}</li>)}</ul>;
    const url = materialLink(record(data.file).url || data.url || data.link || data.source);
    return url ? <p key={index}><a href={url} target="_blank" rel="noopener noreferrer">{plainText(data.caption || data.title) || 'Открыть вложение'}</a></p> : <p key={index}>Этот блок доступен в оригинальном Omni.</p>;
  })}</div>;
}
