"use client";
import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import styles from './HelpTooltip.module.css';
export function HelpTooltip({id,label,text}:{id:string;label:string;text:string}) {
  const [hovered,setHovered]=useState(false);
  const [focused,setFocused]=useState(false);
  const [pinned,setPinned]=useState(false);
  const root=useRef<HTMLSpanElement>(null);
  const open=hovered||focused||pinned;
  useEffect(()=>{
    if(!pinned)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setPinned(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[pinned]);
  return <span ref={root} className={styles.root} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onKeyDown={event=>{if(event.key==='Escape'){setPinned(false);setHovered(false);setFocused(false);event.stopPropagation();}}}>
    <button type="button" className={styles.trigger} aria-label={label} aria-expanded={open} aria-describedby={open?id:undefined} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onClick={()=>setPinned(value=>!value)}><CircleHelp size={18} aria-hidden="true"/></button>
    {open&&<span id={id} role="tooltip" className={styles.bubble}>{text}</span>}
  </span>;
}
