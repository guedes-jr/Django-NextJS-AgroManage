"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, Bell, Beef, CheckCheck, ChevronLeft, ChevronRight, FileText, Inbox, Package, Receipt, RotateCcw, Search, Settings2, Trash2 } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import type { Notification } from "@/services/notificationService";
import MarketingContent from "@/components/notifications/MarketingContent";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";
import styles from "./notifications.module.css";

const typeMeta: Record<string, { label: TranslationKey; icon: typeof Bell }> = {
  system: { label: "notifications.category.system", icon: Bell },
  animal_cycle: { label: "notifications.category.animalCycle", icon: Beef },
  overdue_payment: { label: "notifications.category.overduePayment", icon: Receipt },
  marketing: { label: "notifications.category.marketing", icon: Bell },
  stock: { label: "notifications.category.stock", icon: Package },
  animal: { label: "notifications.category.animal", icon: Beef },
  finance: { label: "notifications.category.finance", icon: Receipt },
  report: { label: "notifications.category.report", icon: FileText },
};

const priorityLabel: Record<string, TranslationKey> = {
  low: "notifications.priority.low",
  medium: "notifications.priority.medium",
  high: "notifications.priority.high",
  urgent: "notifications.priority.urgent",
};

const statusLabels: Record<"all" | "unread" | "read" | "archived", TranslationKey> = {
  all: "notifications.all",
  unread: "notifications.unread",
  read: "notifications.read",
  archived: "notifications.archived",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { language, t } = useOrganizationLocale();
  const { notifications, unreadCount, loading, error, fetchNotifications, markAsRead, markAllAsRead, deleteNotification, archiveNotification, unarchiveNotification } = useNotifications();
  const [status, setStatus] = useState<"all" | "unread" | "read" | "archived">("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Notification | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(language);
    return notifications.filter(notification => {
      if (status === "archived" && !notification.is_archived) return false;
      if (status !== "archived" && notification.is_archived) return false;
      if (status === "unread" && notification.is_read) return false;
      if (status === "read" && !notification.is_read) return false;
      if (type !== "all" && (notification.category || notification.type) !== type) return false;
      const created = notification.created_at?.slice(0, 10) || "";
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      return !term || `${notification.title} ${notification.message}`.toLocaleLowerCase(language).includes(term);
    });
  }, [dateFrom, dateTo, language, notifications, search, status, type]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeNotifications = notifications.filter(notification => !notification.is_archived);

  const openNotification = async (notification: Notification) => {
    setBusyId(notification.id);
    try {
      if (!notification.is_read) await markAsRead(notification.id);
      if (notification.promotion || (notification.group_items?.length || 0) > 1) setDetail(notification);
      else if (notification.link) router.push(notification.link);
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
    {detail && <div className="platform-card border rounded-3 p-4 mb-3" role="region" aria-label={t("notifications.details")}><div className="d-flex justify-content-between gap-2"><h2 className="h5">{detail.title}</h2><button className="btn btn-outline-secondary btn-sm" onClick={() => setDetail(null)}>{t("notifications.close")}</button></div>{detail.promotion ? <MarketingContent {...detail.promotion}/> : <ul>{detail.group_items?.map((item,i) => <li key={i}>{item.message}</li>)}</ul>}</div>}
    <header className={styles.header}>
      <div><span>{t("notifications.center")}</span><h1>{t("notifications.title")}</h1><p>{t("notifications.description")}</p></div>
      <div className="d-flex gap-2"><Link href="/home/notifications/preferences" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2"><Settings2 size={17}/> {t("notifications.preferences")}</Link>{unreadCount > 0 && <button onClick={() => void markAllAsRead()}><CheckCheck size={18}/> {t("notifications.markAllRead")}</button>}</div>
    </header>

    <section className={styles.summary}>
      <div><span>{t("notifications.active")}</span><strong>{activeNotifications.length}</strong></div>
      <div><span>{t("notifications.unread")}</span><strong>{unreadCount}</strong></div>
      <div><span>{t("notifications.archived")}</span><strong>{notifications.length - activeNotifications.length}</strong></div>
    </section>

    <section className={styles.toolbar} aria-label={t("notifications.filters")}>
      <label className={styles.search}><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("notifications.searchPlaceholder")} aria-label={t("notifications.searchAria")}/></label>
      <div className={styles.statusTabs}>{(["all", "unread", "read", "archived"] as const).map(item => <button key={item} className={status === item ? styles.active : ""} onClick={() => { setStatus(item); setPage(1); }}>{t(statusLabels[item])}</button>)}</div>
      <select value={type} onChange={event => setType(event.target.value)} aria-label={t("notifications.allCategories")}><option value="all">{t("notifications.allCategories")}</option>{Object.entries(typeMeta).map(([value, meta]) => <option value={value} key={value}>{t(meta.label)}</option>)}</select>
      <input className="form-control form-control-sm" style={{width:140}} type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} aria-label={t("notifications.startDate")}/>
      <input className="form-control form-control-sm" style={{width:140}} type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} aria-label={t("notifications.endDate")}/>
    </section>

    <section className={styles.list} aria-live="polite">
      {loading ? <div className={styles.empty}><span className={styles.spinner}/><strong>{t("notifications.loading")}</strong></div>
      : error ? <div className={styles.empty}><Inbox size={36}/><strong>{t("notifications.loadFailed")}</strong><p>{error}</p><button onClick={() => void fetchNotifications()}>{t("notifications.retry")}</button></div>
      : visible.length === 0 ? <div className={styles.empty}><Inbox size={38}/><strong>{notifications.length ? t("notifications.noFiltered") : t("notifications.allCaughtUp")}</strong><p>{notifications.length ? t("notifications.changeFilters") : t("notifications.newUpdates")}</p></div>
      : pageItems.map(notification => {
        const meta = typeMeta[notification.category || notification.type] || typeMeta.system;
        const Icon = meta.icon;
        return <article className={`${styles.item} ${!notification.is_read ? styles.unread : ""}`} key={notification.id}>
          <button className={styles.open} onClick={() => void openNotification(notification)} disabled={busyId === notification.id}>
            <span className={styles.icon} data-type={notification.type}><Icon size={20}/></span>
            <span className={styles.content}><span className={styles.itemTop}><strong>{notification.title}{notification.occurrence_count > 1 && <b className="badge bg-success-subtle text-success ms-2">×{notification.occurrence_count}</b>}</strong><small>{notification.last_occurred_at || notification.created_at ? new Date(notification.last_occurred_at || notification.created_at).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }) : t("notifications.dateUnknown")}</small></span><span className={styles.message}>{notification.message}</span><span className={styles.meta}><i data-priority={notification.priority}/>{t(meta.label)} · {t("notifications.priority")} {priorityLabel[notification.priority] ? t(priorityLabel[notification.priority]) : notification.priority}</span></span>
            {notification.link && <ChevronRight className={styles.chevron} size={20}/>} 
          </button>
          <div className={styles.actions}>
            {!notification.is_read && <button onClick={() => void markAsRead(notification.id)} title={t("notifications.markRead")} aria-label={t("notifications.markReadAria", { title: notification.title })}><CheckCheck size={17}/></button>}
            {notification.is_archived ? <button onClick={() => void unarchiveNotification(notification.id)} title={t("notifications.restore")} aria-label={t("notifications.restoreAria", { title: notification.title })}><RotateCcw size={17}/></button> : <button onClick={() => void archiveNotification(notification.id)} title={t("notifications.archive")} aria-label={t("notifications.archiveAria", { title: notification.title })}><Archive size={17}/></button>}
            <button onClick={() => void removeNotification(notification)} disabled={busyId === notification.id} title={t("notifications.delete")} aria-label={t("notifications.deleteAria", { title: notification.title })}><Trash2 size={17}/></button>
          </div>
        </article>;
      })}
    </section>
    {visible.length > pageSize && <nav className="d-flex justify-content-center align-items-center gap-3" aria-label={t("notifications.pagination")}><button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={17}/> {t("notifications.previous")}</button><span className="small text-muted">{t("notifications.pageOf", { page: currentPage, pages: pageCount })}</span><button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" disabled={currentPage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{t("notifications.next")} <ChevronRight size={17}/></button></nav>}
  </div>;
}
