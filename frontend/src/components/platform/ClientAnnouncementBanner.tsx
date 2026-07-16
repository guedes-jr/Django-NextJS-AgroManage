"use client";
import { useEffect,useState } from "react";
import { apiClient } from "@/services/api";
import type { PlatformAnnouncement } from "@/types/platform";
export function ClientAnnouncementBanner(){const [items,setItems]=useState<PlatformAnnouncement[]>([]);useEffect(()=>{apiClient.get("platform/client-state/").then(r=>setItems(r.data.announcements||[])).catch(()=>undefined);},[]);if(!items.length)return null;const item=items[0];const colors:Record<string,string>={info:"#1d4ed8",success:"#15803d",warning:"#b45309",critical:"#b91c1c"};return <div className="text-white text-center px-3 py-2 small" style={{background:colors[item.level]||colors.info}}><strong>{item.title}:</strong> {item.message}</div>}
