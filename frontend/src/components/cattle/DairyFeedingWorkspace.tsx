"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { ArrowLeft, Plus, Trash2, Wheat, Save, RefreshCw } from 'lucide-react';
import { useOrganizationAccess } from '@/components/auth/OrganizationAccessContext';
import { useOrganizationLocale } from '@/lib/locale';
import { cattleError, cattleService, type Page } from '@/services/cattleService';
import { milkToday } from '@/services/milkProductionService';
import { dairyFeedingService as service, dairyFeedQuantity, type DairyFeedCatalog, type DairyFeedAnimal,
  type DairyFeedGroup, type DairyGroupFeed, type DairyFeedReceipt, type DairyFeedingCommand, type DairyFeedCancellation } from '@/services/dairyFeedingService';
import { Modal } from '@/components/ui/Modal';
import DailyFeedingPage from './CattleDailyFeedingPage';
import styles from './dairy-worksheet.module.css';

const root = '/home/seguimento/pecuaria-leiteira';
type Pending = {kind: 'supply'; values: DairyFeedingCommand} | {kind: 'cancel'; values: DairyFeedCancellation};
const emptyFeed = (): DairyGroupFeed => ({item: '', quantity_kg: '', mode: 'per_head_day'});
export function DairyFeedingWorkspace() {
  const access = useOrganizationAccess();
  const {t, language} = useOrganizationLocale();
  const manager = !!access && ['admin', 'manager'].includes(access.role);
  const [farms, setFarms] = useState<{id: string; name: string}[]>([]);
  const [farm, setFarm] = useState('');
  const [date, setDate] = useState(milkToday);
  const [start, setStart] = useState(milkToday);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [catalog, setCatalog] = useState<DairyFeedCatalog | null>(null);
  const [history, setHistory] = useState<Page<DairyFeedReceipt> | null>(null);
  const [selected, setSelected] = useState<Record<string, DairyFeedAnimal>>({});
  const [groups, setGroups] = useState<DairyFeedGroup[]>([]);
  const [name, setName] = useState('');
  const [feeds, setFeeds] = useState<DairyGroupFeed[]>([emptyFeed()]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{source: string; index: number; name: string} | null>(null);
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const selectedIds = Object.keys(selected);
  const used = new Set(groups.flatMap(group => group.animals));
  const dirty = !!groups.length || !!selectedIds.length || !!notes || feeds.some(feed => !!feed.item || !!feed.quantity_kg);
  const locked = saving || !!pending;
  const canWrite = manager && !access?.read_only && !locked && !!farm && !loading;
  const number = (value: number | string) => Number(value).toLocaleString(language, {maximumFractionDigits: 2});
  const day = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(language);
  useEffect(() => {
    if (!manager) return;
    const controller = new AbortController();
    cattleService.farms(controller.signal).then(rows => { if (!controller.signal.aborted) { setFarms(rows); if (rows.length === 1) setFarm(rows[0].id); } })
      .catch(err => { if (!controller.signal.aborted) setError(cattleError(err, language)); });
    return () => controller.abort();
  }, [manager, language]);
  useEffect(() => {
    if (!manager || !farm) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setCatalog(null);
      service.animals({farm, category, search, page, page_size: 20}, controller.signal)
        .then(rows => { if (!controller.signal.aborted) setCatalog(rows); })
        .catch(err => { if (!controller.signal.aborted) setError(cattleError(err, language)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [manager, farm, category, search, page, revision, language]);
  useEffect(() => {
    if (!manager || !farm) return;
    const controller = new AbortController();
    service.history(farm, historyPage, controller.signal).then(rows => { if (!controller.signal.aborted) setHistory(rows); })
      .catch(err => { if (!controller.signal.aborted) { setHistory(null); setError(cattleError(err, language)); } });
    return () => controller.abort();
  }, [manager, farm, historyPage, revision, language]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  if (access && ['feeder', 'operator'].includes(access.role)) return <DailyFeedingPage/>;
  if (!manager) return <p role="alert">{t('cattle.feedProduction.permissionDenied')}</p>;

  function addGroup() {
    if (!selectedIds.length) { setError(t('dairy.worksheet.selectRequired')); return; }
    if (feeds.some(feed => !feed.item || !(Number(feed.quantity_kg)>0))) { setError(t('dairy.worksheet.feedRequired')); return; }
    if (new Set(feeds.map(feed => feed.item)).size !== feeds.length) { setError(t('dairy.worksheet.feedRequired')); return; }
    setGroups(current => [...current, {name: name.trim() || `${t('dairy.worksheet.group')} ${current.length+1}`, animals: selectedIds, feeds: feeds.map(feed => ({...feed}))}]);
    setSelected({}); setName(''); setFeeds([emptyFeed()]); setError('');
  }
  function complete(kind: Pending['kind']) {
    setPending(null); setCancelTarget(null); setReason(''); setError('');
    if (kind === 'supply') { setGroups([]); setSelected({}); setNotes(''); setFeeds([emptyFeed()]); }
    setSuccess(t('dairy.worksheet.groupSuccess')); setRevision(value => value+1);
  }
  async function execute(command: Pending) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(''); setSuccess('');
    try {
      const receipt = command.kind === 'supply' ? await service.supply(command.values) : await service.cancel(command.values);
      if (receipt.saved !== true || receipt.mode !== (command.kind === 'supply' ? 'feeding' : 'feeding_cancel') || receipt.farm !== command.values.farm || receipt.request_key !== command.values.request_key) { setPending(command); setError(t('dairy.worksheet.uncertain')); return; }
      complete(command.kind);
    } catch (err) {
      if (!isAxiosError(err) || !err.response || err.response.status >= 500) setPending(command); else setPending(null);
      setError(cattleError(err, language));
    } finally { busy.current = false; setSaving(false); }
  }
  async function checkReceipt() {
    if (!pending || busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const receipt = await service.receipt(pending.values.farm, pending.values.request_key);
      if (receipt.saved === true && receipt.mode === (pending.kind === 'supply' ? 'feeding' : 'feeding_cancel') && receipt.farm === pending.values.farm && receipt.request_key === pending.values.request_key) complete(pending.kind);
      else setError(t('dairy.worksheet.uncertain'));
    } catch (err) { setError(isAxiosError(err) && err.response?.status === 404 ? t('dairy.worksheet.noReceipt') : cattleError(err, language)); }
    finally { busy.current = false; setSaving(false); }
  }
  function updateFeed(index: number, value: Partial<DairyGroupFeed>) { setFeeds(current => current.map((feed,i) => i===index ? {...feed,...value} : feed)); }
  return <div className={styles.page}>
    <Link className={styles.back} href={root} onClick={event => { if (locked || (dirty && !window.confirm(t('dairy.worksheet.draftWarning')))) event.preventDefault(); }}><ArrowLeft size={15}/>{t('dairy.worksheet.operations')}</Link>
    <header className={styles.header}><div className={styles.brand}><span className={styles.brandIcon}><Wheat size={24}/></span><div><h1>{t('dairy.worksheet.groupTitle')}</h1><p>{t('dairy.worksheet.groupDescription')}</p></div></div><button className="btn btn-outline-secondary btn-sm" disabled={dirty || locked || loading} onClick={() => { setError(''); setRevision(value => value+1); }}><RefreshCw size={15}/>{t('inventory.alerts.refresh')}</button></header>
    <div className={styles.filters}><label className={styles.field}>{t('dairy.home.farm')}<select className="form-select form-select-sm" value={farm} disabled={dirty || locked} onChange={event => { setFarm(event.target.value); setCatalog(null); setHistory(null); setPage(1); setHistoryPage(1); }}><option value="">{t('dairy.home.farm')}</option>{farms.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className={styles.field}>{t('dairy.worksheet.periodStart')}<input type="date" className="form-control form-control-sm" required max={date} value={start} disabled={locked || !!groups.length} onChange={event => setStart(event.target.value)}/></label><label className={styles.field}>{t('dairy.worksheet.periodEnd')}<input type="date" className="form-control form-control-sm" required min={start} max={milkToday()} value={date} disabled={locked || !!groups.length} onChange={event => setDate(event.target.value)}/></label></div>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}{success && <p className="alert alert-success" role="status">{success}</p>}
    {pending && <div className="alert alert-warning"><p>{t('dairy.worksheet.uncertain')}</p><div className={styles.actions}><button className="btn btn-outline-dark btn-sm" disabled={saving} onClick={checkReceipt}>{t('dairy.worksheet.checkReceipt')}</button><button className="btn btn-outline-dark btn-sm" disabled={saving} onClick={() => execute(pending)}>{t('dairy.worksheet.sameRequest')}</button></div></div>}
    {!farm ? <p className="alert alert-info">{t('dairy.worksheet.chooseFarm')}</p> : <>
      <div className={styles.forms}><section className={styles.panel}><h2 className={styles.sectionTitle}>{t('dairy.worksheet.animal')}</h2><div className={styles.panelBody}>
        <div className={styles.fields}><label className={styles.field}>{t('livestock.registration.category')}<select className="form-select form-select-sm" value={category} disabled={locked} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">{t('inventory.products.allCategories')}</option>{['Vaca','Matriz','Novilha','Bezerro','Touro','Reprodutor','Garrote'].map(value => <option key={value}>{value}</option>)}</select></label><label className={styles.field}>{t('dairy.worksheet.search')}<input className="form-control form-control-sm" value={search} disabled={locked} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label></div>
        <div className={styles.actions}><button className="btn btn-sm btn-outline-success" disabled={!canWrite || !catalog} onClick={() => setSelected(current => ({...current,...Object.fromEntries((catalog?.results || []).filter(row => !used.has(row.id)).map(row => [row.id,row]))}))}>{t('dairy.worksheet.selectPage')}</button><button className="btn btn-sm btn-outline-secondary" disabled={locked} onClick={() => setSelected({})}>{t('dairy.worksheet.clearSelection')}</button><span>{t('dairy.worksheet.heads',{count:selectedIds.length})}</span></div>
        {loading ? <p role="status">{t('workspace.loading')}</p> : catalog && <><div className={styles.animalList}>{catalog.results.map(row => <label key={row.id}><input type="checkbox" disabled={!canWrite || used.has(row.id)} checked={!!selected[row.id] || used.has(row.id)} onChange={event => setSelected(current => { const next={...current}; if(event.target.checked) next[row.id]=row; else delete next[row.id]; return next; })}/><span><strong>{row.identifier} · {row.name || row.category}</strong><small>{row.category} · {row.batch_code || '—'}</small></span></label>)}</div><div className={styles.pagination}><span>{catalog.count}</span><div className={styles.actions}><button className="btn btn-sm btn-outline-secondary" disabled={locked || page<=1} onClick={() => setPage(value => value-1)}>{t('notifications.previous')}</button><button className="btn btn-sm btn-outline-secondary" disabled={locked || !catalog.next} onClick={() => setPage(value => value+1)}>{t('notifications.next')}</button></div></div></>}
      </div></section>
      <section className={styles.panel}><h2 className={styles.sectionTitle}>{t('dairy.worksheet.feedForm')}</h2><div className={styles.panelBody}>
        <label className={styles.field}>{t('dairy.worksheet.groupName')}<input className="form-control form-control-sm" maxLength={80} value={name} disabled={!canWrite} onChange={event => setName(event.target.value)}/></label>
        {feeds.map((feed,index) => <div className={styles.groupFeed} key={index}><label className={styles.field}>{t('inventory.movements.feed')}<select className="form-select form-select-sm" value={feed.item} disabled={!canWrite} onChange={event => updateFeed(index,{item:event.target.value})}><option value="">{t('cattle.form.select')}</option>{catalog?.products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className={styles.feedLine}><label className={styles.field}>{t('dairy.worksheet.feedMode')}<select className="form-select form-select-sm" value={feed.mode} disabled={!canWrite} onChange={event => updateFeed(index,{mode:event.target.value as DairyGroupFeed['mode']})}><option value="per_head_day">{t('dairy.worksheet.perHeadDay')}</option><option value="total">{t('dairy.worksheet.periodKg')}</option></select></label><label className={styles.field}>{t('dairy.worksheet.quantity')}<input className="form-control form-control-sm" type="number" min="0.01" step="0.01" value={feed.quantity_kg} disabled={!canWrite} onChange={event => updateFeed(index,{quantity_kg:event.target.value})}/></label></div><div className={styles.actions}><strong>{number(dairyFeedQuantity(feed,selectedIds.length,start,date))} kg</strong>{feeds.length>1 && <button className="btn btn-sm btn-outline-danger" disabled={!canWrite} onClick={() => setFeeds(current => current.filter((_,i) => i!==index))}><Trash2 size={14}/>{t('dairy.worksheet.remove')}</button>}</div></div>)}
        <div className={styles.actions}><button className="btn btn-outline-secondary btn-sm" disabled={!canWrite || feeds.length>=10} onClick={() => setFeeds(current => [...current,emptyFeed()])}><Plus size={15}/>{t('dairy.worksheet.addFeed')}</button><button className="btn btn-success btn-sm" disabled={!canWrite || !selectedIds.length || groups.length>=10} onClick={addGroup}><Plus size={15}/>{t('dairy.worksheet.addGroup')}</button></div>
      </div></section></div>
      <section className={`${styles.panel} ${styles.totalPanel}`}><h2 className={styles.sectionTitle}>{t('dairy.worksheet.groupsReview')}</h2><div className={styles.panelBody}><p className={styles.muted}>{t('dairy.worksheet.noGroups')}</p>{groups.map((group,index) => <div className={styles.reviewGroup} key={index}><div><strong>{group.name} · {group.animals.length}</strong>{group.feeds.map((feed,i) => <small key={i}>{catalog?.products.find(row=>row.id===feed.item)?.name || '—'} · {number(dairyFeedQuantity(feed,group.animals.length,start,date))} kg</small>)}</div><button className="btn btn-sm btn-outline-danger" disabled={!canWrite} onClick={() => setGroups(current=>current.filter((_,i)=>i!==index))}><Trash2 size={15}/>{t('dairy.worksheet.remove')}</button></div>)}<label className={styles.field}>{t('dairy.worksheet.notes')}<textarea className="form-control form-control-sm" maxLength={1000} rows={2} disabled={!canWrite} value={notes} onChange={event=>setNotes(event.target.value)}/></label><button className="btn btn-success" disabled={!canWrite || !groups.length || !!selectedIds.length || feeds.some(feed=>!!feed.item || !!feed.quantity_kg)} onClick={() => execute({kind:'supply',values:{farm,date,period_start:start,request_key:crypto.randomUUID(),groups,notes}})}><Save size={15}/>{t('dairy.worksheet.confirmGroups')}</button></div></section>
      <section className={styles.panel}><h2 className={styles.sectionTitle}>{t('dairy.worksheet.groupHistory')}</h2><div className={styles.panelBody}>{history?.results.map(receipt => <div key={receipt.request_key}><strong>{day(receipt.period_start)} — {day(receipt.date)}</strong>{receipt.groups.map((group,index) => <div className={styles.reviewGroup} key={index}><div><strong>{group.name} · {t('dairy.worksheet.feedDays',{days:receipt.days,heads:group.head_count})}</strong>{group.feeds.map((feed,i)=><small key={i}>{feed.name} · {number(feed.total_kg)} kg</small>)}{group.cancelled && <small>{t('workspace.cancelledLabel')}</small>}</div>{!group.cancelled && <button className="btn btn-outline-danger btn-sm" disabled={!canWrite || dirty} onClick={() => {setCancelTarget({source:receipt.request_key,index,name:group.name});setReason('');}}>{t('dairy.worksheet.cancelFeed')}</button>}</div>)}</div>)}{history && !history.count && <p>{t('workspace.noRecordsMatchThisFilter')}</p>}<div className={styles.pagination}><span>{history?.count || 0}</span><div className={styles.actions}><button className="btn btn-outline-secondary btn-sm" disabled={locked || historyPage<=1} onClick={()=>{setHistory(null);setHistoryPage(value=>value-1);}}>{t('notifications.previous')}</button><button className="btn btn-outline-secondary btn-sm" disabled={locked || !history?.next} onClick={()=>{setHistory(null);setHistoryPage(value=>value+1);}}>{t('notifications.next')}</button></div></div><Link href={`${root}/relatorios#alimentacao`}>{t('swine.home.module.reports')}</Link></div></section>
    </>}
    <Modal isOpen={!!cancelTarget} title={t('dairy.worksheet.cancelFeed')} description={cancelTarget?.name} onClose={() => {if(!locked)setCancelTarget(null);}}><form className={styles.panelBody} onSubmit={event=>{event.preventDefault();if(cancelTarget)execute({kind:'cancel',values:{farm,request_key:crypto.randomUUID(),source_key:cancelTarget.source,group_index:cancelTarget.index,reason}});}}>{error && <p className="alert alert-danger" role="alert">{error}</p>}<label className={styles.field}>{t('dairy.worksheet.cancelReason')}<textarea className="form-control" required maxLength={500} value={reason} disabled={locked} onChange={event=>setReason(event.target.value)}/></label><button className="btn btn-danger" disabled={locked || !reason.trim()}>{t('dairy.worksheet.cancelFeed')}</button></form></Modal>
  </div>;
}
