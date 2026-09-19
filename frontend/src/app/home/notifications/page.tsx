"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, Bell, Beef, CheckCheck, ChevronLeft, ChevronRight, FileText, Inbox, Package, Receipt, RotateCcw, Search, Settings2, Trash2 } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/services/notificationService";
import styles from "./notifications.module.css";

const typeMeta: Record<string, { label: string; icon: typeof Bell }> = {
  system: { label: "Sistema", icon: Bell },
  stock: { label: "Estoque", icon: Package },
  animal: { label: "Animais", icon: Beef },
  finance: { label: "Financeiro", icon: Receipt },
  report: { label: "Relatórios", icon: FileText },
};

const priorityLabel: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, unreadCount, loading, error, fetchNotifications, markAsRead, markAllAsRead, deleteNotification, archiveNotification, unarchiveNotification } = useNotifications();
  const [status, setStatus] = useState<"all" | "unread" | "read" | "archived">("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return notifications.filter(notification => {
      if (status === "archived" && !notification.is_archived) return false;
      if (status !== "archived" && notification.is_archived) return false;
      if (status === "unread" && notification.is_read) return false;
      if (status === "read" && !notification.is_read) return false;
      if (type !== "all" && notification.type !== type) return false;
      const created = notification.created_at.slice(0, 10);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      return !term || `${notification.title} ${notification.message}`.toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [dateFrom, dateTo, notifications, search, status, type]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeNotifications = notifications.filter(notification => !notification.is_archived);

  const openNotification = async (notification: Notification) => {
    setBusyId(notification.id);
    try {
      if (!notification.is_read) await markAsRead(notification.id);
      if (notification.link) router.push(notification.link);
    } finally {
      setBusyId(null);
    }
  };

  const removeNotification = async (notification: Notification) => {
    setBusyId(notification.id);
    try {
      await deleteNotification(notification.id);
    } finally {
      setBusyId(null);
    }
  };

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><span>Central de notificações</span><h1>Notificações</h1><p>Acompanhe as atualizações da sua conta e acesse rapidamente cada registro relacionado.</p></div>
      <div className="d-flex gap-2"><Link href="/home/notifications/preferences" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2"><Settings2 size={17}/> Preferências</Link>{unreadCount > 0 && <button onClick={() => void markAllAsRead()}><CheckCheck size={18}/> Marcar todas como lidas</button>}</div>
    </header>

    <section className={styles.summary}>
      <div><span>Ativas</span><strong>{activeNotifications.length}</strong></div>
      <div><span>Não lidas</span><strong>{unreadCount}</strong></div>
      <div><span>Arquivadas</span><strong>{notifications.length - activeNotifications.length}</strong></div>
    </section>

    <section className={styles.toolbar} aria-label="Filtros de notificações">
      <label className={styles.search}><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por título ou mensagem" aria-label="Buscar notificações"/></label>
      <div className={styles.statusTabs}>{(["all", "unread", "read", "archived"] as const).map(item => <button key={item} className={status === item ? styles.active : ""} onClick={() => { setStatus(item); setPage(1); }}>{item === "all" ? "Todas" : item === "unread" ? "Não lidas" : item === "read" ? "Lidas" : "Arquivadas"}</button>)}</div>
      <select value={type} onChange={event => setType(event.target.value)} aria-label="Filtrar por categoria"><option value="all">Todas as categorias</option>{Object.entries(typeMeta).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select>
      <input className="form-control form-control-sm" style={{width:140}} type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} aria-label="Data inicial"/>
      <input className="form-control form-control-sm" style={{width:140}} type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} aria-label="Data final"/>
    </section>

    <section className={styles.list} aria-live="polite">
      {loading ? <div className={styles.empty}><span className={styles.spinner}/><strong>Carregando notificações</strong></div>
      : error ? <div className={styles.empty}><Inbox size={36}/><strong>Não foi possível carregar</strong><p>{error}</p><button onClick={() => void fetchNotifications()}>Tentar novamente</button></div>
      : visible.length === 0 ? <div className={styles.empty}><Inbox size={38}/><strong>{notifications.length ? "Nenhuma notificação neste filtro" : "Tudo em dia por aqui"}</strong><p>{notifications.length ? "Altere os filtros ou faça uma nova busca." : "Novas atualizações aparecerão nesta central."}</p></div>
      : pageItems.map(notification => {
        const meta = typeMeta[notification.type] || typeMeta.system;
        const Icon = meta.icon;
        return <article className={`${styles.item} ${!notification.is_read ? styles.unread : ""}`} key={notification.id}>
          <button className={styles.open} onClick={() => void openNotification(notification)} disabled={busyId === notification.id}>
            <span className={styles.icon} data-type={notification.type}><Icon size={20}/></span>
            <span className={styles.content}><span className={styles.itemTop}><strong>{notification.title}{notification.occurrence_count > 1 && <b className="badge bg-primary-subtle text-primary ms-2">×{notification.occurrence_count}</b>}</strong><small>{new Date(notification.last_occurred_at || notification.created_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</small></span><span className={styles.message}>{notification.message}</span><span className={styles.meta}><i data-priority={notification.priority}/>{meta.label} · Prioridade {priorityLabel[notification.priority] || notification.priority}</span></span>
            {notification.link && <ChevronRight className={styles.chevron} size={20}/>} 
          </button>
          <div className={styles.actions}>
            {!notification.is_read && <button onClick={() => void markAsRead(notification.id)} title="Marcar como lida" aria-label={`Marcar ${notification.title} como lida`}><CheckCheck size={17}/></button>}
            {notification.is_archived ? <button onClick={() => void unarchiveNotification(notification.id)} title="Restaurar" aria-label={`Restaurar ${notification.title}`}><RotateCcw size={17}/></button> : <button onClick={() => void archiveNotification(notification.id)} title="Arquivar" aria-label={`Arquivar ${notification.title}`}><Archive size={17}/></button>}
            <button onClick={() => void removeNotification(notification)} disabled={busyId === notification.id} title="Excluir notificação" aria-label={`Excluir ${notification.title}`}><Trash2 size={17}/></button>
          </div>
        </article>;
      })}
    </section>
    {visible.length > pageSize && <nav className="d-flex justify-content-center align-items-center gap-3" aria-label="Paginação"><button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={17}/> Anterior</button><span className="small text-muted">Página {currentPage} de {pageCount}</span><button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" disabled={currentPage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Próxima <ChevronRight size={17}/></button></nav>}
  </div>;
}
