import { Fragment, ReactNode } from "react";

type MarkdownMessageProps = {
  text: string;
  className?: string;
};

const inlinePattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*]+\*)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MarkdownMessage({ text, className }: MarkdownMessageProps) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      nodes.push(<pre key={nodes.length}><code>{code.join("\n")}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const content = renderInline(heading[2]);
      if (heading[1].length === 1) nodes.push(<h2 key={nodes.length}>{content}</h2>);
      else if (heading[1].length === 2) nodes.push(<h3 key={nodes.length}>{content}</h3>);
      else nodes.push(<h4 key={nodes.length}>{content}</h4>);
      index += 1;
      continue;
    }

    const listMatch = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^([-*]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      nodes.push(<Tag key={nodes.length}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</Tag>);
      continue;
    }

    if (line.startsWith("> ")) {
      nodes.push(<blockquote key={nodes.length}>{renderInline(line.slice(2))}</blockquote>);
      index += 1;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !lines[index].startsWith("```") && !/^(#{1,3})\s+|^([-*]|\d+[.)])\s+|^> /.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<p key={nodes.length}>{renderInline(paragraph.join(" "))}</p>);
  }

  return <div className={className}>{nodes}</div>;
}
