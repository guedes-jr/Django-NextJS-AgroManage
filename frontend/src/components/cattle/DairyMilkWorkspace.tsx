"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { ArrowLeft, Milk, Wheat, Save, RefreshCw, History, Trash2, Undo2, Pencil, Plus } from 'lucide-react';
import { useOrganizationAccess } from '@/components/auth/OrganizationAccessContext';
import { useOrganizationLocale, type TranslationKey } from '@/lib/locale';
import { cattleError, cattleService } from '@/services/cattleService';
import { milkToday, milkProductionService, type MilkSummary } from '@/services/milkProductionService';
import { dairyWorksheetService as service, dairySessions, dairyFeedSlots, dairyLiters, dairyCommandRow,
  emptyDairyValues, isDairyReceipt, type DairyWorksheet, type DairyWorksheetRow, type DairyWorksheetValues,
  type DairyWorksheetCommand, type DairyFeed, type DairyFeedSlot } from '@/services/dairyWorksheetService';
import styles from './dairy-worksheet.module.css';
import { DairyTotalPanel } from './DairyTotalPanel';

const root = '/home/seguimento/pecuaria-leiteira';
const sessionKeys = {morning: 'dairy.worksheet.morning', afternoon: 'dairy.worksheet.afternoon', evening: 'dairy.worksheet.evening'} as const;
const slotKeys = {concentrate: 'dairy.worksheet.concentrate', silage: 'dairy.worksheet.silage', mineral: 'dairy.worksheet.mineral'} as const;

export function DairyMilkWorkspace() {
  const access = useOrganizationAccess();
  const { t, language } = useOrganizationLocale();
  const canWrite = !!access && !access.read_only && ['admin', 'manager', 'operator'].includes(access.role);
  const manager = !!access && ['admin', 'manager'].includes(access.role);
  const [farm, setFarm] = useState('');
  const [date, setDate] = useState(milkToday);
  const [batch, setBatch] = useState('');
  const [search, setSearch] = useState('');
  const [tank, setTank] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DairyWorksheet | null>(null);
  const [summary, setSummary] = useState<MilkSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [farmsLoading, setFarmsLoading] = useState(true);
  const [error, setError] = useState('');
  const [farmError, setFarmError] = useState('');
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DairyWorksheetRow>>({});
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<DairyWorksheetValues>(emptyDairyValues);
  const [formDirty, setFormDirty] = useState(false);
  const [totalDirty, setTotalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<DairyWorksheetCommand | null>(null);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const firstInput = useRef<HTMLSelectElement>(null);
  const individualDirty = Object.keys(drafts).length > 0 || Object.values(removed).some(Boolean) || formDirty;
  const dirty = individualDirty || totalDirty;
  const locked = saving || !!pending;
  const ready = canWrite && !!data && !loading && !data.aggregate_mode && !locked && !totalDirty;
  const fmt = (value: number | string | null | undefined) => value == null ? '—' : Number(value).toLocaleString(language, {maximumFractionDigits: 2});
  const rows = data?.results.map(row => drafts[row.id] || row) || [];
  const selected = rows.find(row => row.id === selectedId);
  const visible = rows.filter(row => !removed[row.id]);
  const totalLiters = visible.reduce((sum, row) => sum + dairyLiters(row), 0);
  const feedTotal = (slot: DairyFeedSlot) => visible.reduce((sum, row) => sum + Number(row.feeds.find(feed => feed.slot === slot)?.quantity_kg || 0), 0);

  useEffect(() => {
    const controller = new AbortController();
    cattleService.farms(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setFarmError('');
      if (result.length) setFarm(result[0].id);
    }).catch(err => { if (!controller.signal.aborted) setFarmError(cattleError(err, language)); })
      .finally(() => { if (!controller.signal.aborted) setFarmsLoading(false); });
    return () => controller.abort();
  }, [language, revision]);

  useEffect(() => {
    if (!farm) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(''); setData(null); setSummary(null);
      try {
        const [result, totals] = await Promise.all([
          service.get({farm, date, ...(batch ? {batch} : {}), search, page, page_size: 20}, controller.signal),
          milkProductionService.summary(date, farm, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setData(result); setSummary(totals);
      } catch (err) { if (!controller.signal.aborted) setError(cattleError(err, language)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [farm, date, batch, search, page, revision, language]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  function setField(key: keyof Omit<DairyWorksheetValues, 'feeds'>, value: string) {
    setForm(current => ({...current, [key]: value})); setFormDirty(true);
  }
  function edit(row: DairyWorksheetRow) {
    if (formDirty && !window.confirm(t('dairy.worksheet.draftWarning'))) return;
    setSelectedId(row.id); setForm({...row, feeds: row.feeds.map(feed => ({...feed}))}); setFormDirty(false);
    firstInput.current?.focus(); firstInput.current?.scrollIntoView({block: 'center', behavior: 'smooth'});
  }
  function setFeed(slot: DairyFeedSlot, key: 'item' | 'quantity_kg', value: string) {
    setForm(current => {
      const old = current.feeds.find(feed => feed.slot === slot);
      const replacement: DairyFeed = {...(old || {slot, item: '', quantity_kg: '0'}), [key]: value};
      return {...current, feeds: [...current.feeds.filter(feed => feed.slot !== slot), replacement]};
    }); setFormDirty(true);
  }
  function normalizedFeeds() {
    const feeds = form.feeds.filter(feed => Number(feed.quantity_kg) !== 0);
    if (feeds.some(feed => !feed.item || !(Number(feed.quantity_kg) > 0))) throw new Error(t('dairy.worksheet.feedRequired'));
    return feeds;
  }
  function stage(): DairyWorksheetRow | null {
    if (!selected) { setError(t('dairy.worksheet.selectRequired')); return null; }
    try {
      const row = {...selected, ...form, feeds: normalizedFeeds()};
      setDrafts(current => ({...current, [row.id]: row}));
      setRemoved(current => ({...current, [row.id]: false}));
      setFormDirty(false); setError('');
      return row;
    } catch (err) { setError(err instanceof Error ? err.message : cattleError(err, language)); return null; }
  }
  function applyFeeds(all: boolean) {
    try {
      const feeds = normalizedFeeds();
      if (!feeds.length) throw new Error(t('dairy.worksheet.feedRequired'));
      const targets = visible.filter(row => all || checked[row.id]);
      if (!targets.length) throw new Error(t('dairy.worksheet.selectRequired'));
      setDrafts(current => ({...current, ...Object.fromEntries(targets.map(row => [row.id, {...row, feeds: feeds.map(feed => ({...feed}))}]))}));
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : cattleError(err, language)); }
  }
  function changeRow(row: DairyWorksheetRow, key: keyof Omit<DairyWorksheetValues, 'feeds'>, value: string) {
    setDrafts(current => ({...current, [row.id]: {...row, [key]: value}}));
  }
  function removeRows(ids: string[]) {
    setRemoved(current => ({...current, ...Object.fromEntries(ids.map(id => [id, true]))}));
    setChecked({});
  }
  function discardDrafts() {
    if (!window.confirm(t('dairy.worksheet.draftWarning'))) return;
    setDrafts({}); setRemoved({}); setChecked({}); setForm(emptyDairyValues()); setFormDirty(false); setSelectedId(''); setError('');
    setTotalDirty(false); setData(null);
    setRevision(current => current+1);
  }
  function resetAfterSuccess(received: string) {
    setPending(null); setDrafts({}); setRemoved({}); setChecked({}); setSelectedId(''); setForm(emptyDairyValues()); setFormDirty(false);
    setTotalDirty(false); setData(null);
    setMessage(`${t('dairy.worksheet.saveSuccess')}${Number(received) > 0 ? ` ${t('dairy.worksheet.received', {liters: fmt(received)})}` : ''}`);
    setError(''); setRevision(current => current+1);
  }
  async function execute(command: DairyWorksheetCommand) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const receipt = await service.save(command);
      if (!isDairyReceipt(receipt, command)) { setPending(command); setError(t('dairy.worksheet.uncertain')); return; }
      resetAfterSuccess(receipt.received_liters);
    } catch (err) {
      if (!isAxiosError(err) || !err.response || err.response.status >= 500) setPending(command);
      else setPending(null);
      setError(cattleError(err, language));
    } finally { busy.current = false; setSaving(false); }
  }
  async function save(includeForm: boolean) {
    if (!ready || busy.current || !data) return;
    const staged = includeForm || formDirty ? stage() : null;
    if ((includeForm || formDirty) && !staged) return;
    const changes = {...drafts, ...(staged ? {[staged.id]: staged} : {})};
    const ids = new Set([...Object.keys(changes), ...Object.keys(removed).filter(id => removed[id])]);
    const commandRows = Array.from(ids).flatMap(id => {
      const row = changes[id] || data.results.find(value => value.id === id);
      if (!row || (removed[id] && !row.recorded)) return [];
      return [dairyCommandRow(row, !!removed[id])];
    });
    if (!commandRows.length) { setDrafts({}); setRemoved({}); setChecked({}); setSelectedId(''); setForm(emptyDairyValues()); setFormDirty(false); return; }
    await execute({farm, date, tank: tank || null, request_key: crypto.randomUUID(), rows: commandRows});
  }
  async function checkReceipt() {
    if (!pending || busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const receipt = await service.receipt(pending.farm, pending.request_key);
      if (isDairyReceipt(receipt, pending)) resetAfterSuccess(receipt.received_liters);
      else setError(t('dairy.worksheet.uncertain'));
    } catch (err) { setError(isAxiosError(err) && err.response?.status === 404 ? t('dairy.worksheet.noReceipt') : cattleError(err, language)); }
    finally { busy.current = false; setSaving(false); }
  }
  function navigate(event: React.MouseEvent) {
    if (locked || (dirty && !window.confirm(t('dairy.worksheet.draftWarning')))) event.preventDefault();
  }
  const numeric = (label: TranslationKey, value: string, onChange: (value: string) => void, unit?: string) => <label className={styles.field}>
    <span>{t(label)}{unit}</span><input type="number" min="0" step="0.01" inputMode="decimal" className="form-control form-control-sm" value={value} onChange={event => onChange(event.target.value)} disabled={!ready}/>
  </label>;

  return <div className={styles.page}>
    <Link href={root} className={styles.back} onClick={navigate}><ArrowLeft size={15}/>{t('dairy.worksheet.operations')}</Link>
    <header className={styles.header}><div className={styles.brand}><span className={styles.brandIcon}><Milk size={25}/></span><div><h1>{t('dairy.worksheet.title')}</h1><p>{t('dairy.worksheet.description')}</p></div></div><div className={styles.actions}>
      <Link className="btn btn-outline-secondary btn-sm" href={`${root}/leite/historico`} onClick={navigate}><History size={15}/>{t('dairy.worksheet.totalHistory')}</Link>
      <button className="btn btn-outline-secondary btn-sm" disabled={locked || dirty || loading} onClick={() => setRevision(value => value+1)} aria-label={t('dairy.home.refresh')}><RefreshCw size={15}/></button>
    </div></header>
    <section className={styles.filters} aria-label={t('workspace.filters')}>
      <label className={styles.field}>{t('dairy.home.referenceDate')}<input className="form-control form-control-sm" type="date" max={milkToday()} required value={date} disabled={locked || dirty} onChange={event => { if (event.target.value) { setData(null); setDate(event.target.value); setPage(1); setSelectedId(''); } }}/></label>
      <label className={styles.field}>{t('reproduction.batch')}<select className="form-select form-select-sm" value={batch} disabled={locked || dirty || loading || !data} onChange={event => { setData(null); setBatch(event.target.value); setPage(1); setSelectedId(''); }}><option value="">{t('dairy.worksheet.allBatches')}</option>{data?.batches.map(row => <option key={row.id} value={row.id}>{row.batch_code}{row.name ? ` · ${row.name}` : ''}</option>)}</select></label>
      <label className={`${styles.field} ${styles.search}`}>{t('dairy.worksheet.search')}<input className="form-control form-control-sm" value={search} disabled={locked || dirty || !farm} onChange={event => { setData(null); setSearch(event.target.value); setPage(1); setSelectedId(''); }}/></label>
      <button className="btn btn-success btn-sm" disabled={!ready} onClick={() => firstInput.current?.focus()}><Plus size={15}/>{t('dairy.worksheet.milkForm')}</button>
    </section>
    {farmError && <p className="alert alert-danger" role="alert">{farmError}</p>}
    {!farm && !farmsLoading && <p className="alert alert-info" role="status">{t('dairy.worksheet.chooseFarm')}</p>}
    {!canWrite && <p className="alert alert-info">{t('dairy.worksheet.readonly')}</p>}
    {message && <p className="alert alert-success" role="status">{message}</p>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {pending && <section className="alert alert-warning" role="status"><p>{t('dairy.worksheet.uncertain')}</p><div className={styles.actions}><button className="btn btn-outline-dark btn-sm" disabled={saving} onClick={checkReceipt}>{t('dairy.worksheet.checkReceipt')}</button><button className="btn btn-outline-dark btn-sm" disabled={saving} onClick={() => execute(pending)}>{t('dairy.worksheet.sameRequest')}</button></div></section>}
    {farm && <>
      <div className={styles.metrics}>{[
        [t('workspace.totalProduction'), summary ? `${fmt(summary.produced_liters)} L` : '—'],
        [t('workspace.milkedCows'), fmt(summary?.milked_cows)],
        [t('workspace.averagePerCow'), summary ? `${fmt(summary.average_per_milked_cow)} L` : '—'],
        [t('swine.insights.pending'), fmt(summary?.pending_cows)],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{loading ? '…' : value}</strong></article>)}</div>
      {loading && <p role="status">{t('workspace.loading')}</p>}
      {data?.aggregate_mode && <p className="alert alert-warning">{t('dairy.worksheet.aggregate')}</p>}
      {data && <>
        <label className={styles.tank}><span>{t('dairy.worksheet.tank')}</span><select className="form-select form-select-sm" value={tank} disabled={locked || !canWrite} onChange={event => setTank(event.target.value)}><option value="">{t('dairy.worksheet.noTank')}</option>{data.tanks.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><small>{t('dairy.worksheet.tankHelp')}</small></label>
        <DairyTotalPanel key={`${farm}:${date}:${data.total?.expected_version || 'new'}:${revision}`} date={date} data={data} manager={manager}
          disabled={!canWrite || locked || loading || individualDirty} onDirty={() => setTotalDirty(true)}
          onSave={total => execute({mode: 'total', farm, date, tank: tank || null, request_key: crypto.randomUUID(), total})}/>
        <div className={styles.forms}>
          <section className={styles.panel}><h2 className={styles.sectionTitle}><Milk size={17}/>{t('dairy.worksheet.milkForm')}</h2><div className={styles.panelBody}>
            <label className={styles.field}>{t('dairy.worksheet.animal')}<select ref={firstInput} className="form-select form-select-sm" value={selectedId} disabled={!ready} onChange={event => { const row = rows.find(row => row.id === event.target.value); if (row) edit(row); else { setSelectedId(''); setForm(emptyDairyValues()); setFormDirty(false); } }}><option value="">{t('dairy.worksheet.chooseAnimal')}</option>{rows.map(row => <option key={row.id} value={row.id}>{row.identifier}{row.name ? ` · ${row.name}` : ''}{row.batch_code ? ` · ${row.batch_code}` : ''}</option>)}</select></label>
            <div className={styles.fields}>{dairySessions.map(session => <div key={session}>{numeric(sessionKeys[session], form[session], value => setField(session, value))}</div>)}<output className={styles.total}>{fmt(dairyLiters(form))} L</output></div>
            <div className={styles.fields}>{numeric('dairy.worksheet.oxytocin', form.oxytocin_ml, value => setField('oxytocin_ml', value))}{numeric('dairy.worksheet.discard', form.discarded_liters, value => setField('discarded_liters', value))}<label className={styles.field}>{t('dairy.worksheet.discardReason')}<input className="form-control form-control-sm" value={form.discard_reason} maxLength={200} disabled={!ready} onChange={event => setField('discard_reason', event.target.value)}/></label></div>
            <label className={styles.field}>{t('dairy.worksheet.notes')}<textarea className="form-control form-control-sm" rows={2} maxLength={2000} value={form.notes} disabled={!ready} onChange={event => setField('notes', event.target.value)}/></label>
            <small className={styles.muted}>{t('dairy.worksheet.oxytocinHelp')}</small>
          </div></section>
          <section className={styles.panel}><h2 className={styles.sectionTitle}><Wheat size={17}/>{t('dairy.worksheet.feedForm')}</h2><div className={styles.panelBody}>
            {dairyFeedSlots.map(slot => { const feed = form.feeds.find(feed => feed.slot === slot); const product = data.products.find(product => product.id === feed?.item); return <div className={styles.feedLine} key={slot}><label className={styles.field}>{t(slotKeys[slot])}<select className="form-select form-select-sm" value={feed?.item || ''} disabled={!ready} onChange={event => setFeed(slot, 'item', event.target.value)}><option value="">{t('dairy.worksheet.noFeed')}</option>{data.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{product && <small>{t('dairy.worksheet.stock', {quantity: fmt(product.stock_kg)})}</small>}</label>{numeric('dairy.worksheet.quantity', feed?.quantity_kg || '0', value => setFeed(slot, 'quantity_kg', value))}</div>; })}
            <p className={styles.muted}>{t('dairy.worksheet.review')}</p><div className={styles.actions}><button className="btn btn-outline-success btn-sm" disabled={!ready} onClick={() => applyFeeds(false)}>{t('dairy.worksheet.apply')}</button><button className="btn btn-outline-success btn-sm" disabled={!ready || !rows.length} onClick={() => applyFeeds(true)}>{t('dairy.worksheet.applyPage')}</button></div>
          </div></section>
        </div>
        <div className={styles.formActions}><button className="btn btn-outline-success" disabled={!ready || !selected} onClick={stage}><Plus size={16}/>{t('dairy.worksheet.add')}</button><button className="btn btn-success" disabled={!ready || !selected} onClick={() => save(true)}><Save size={16}/>{t('dairy.worksheet.saveCombined')}</button></div>
        <section className={styles.panel}><div className={styles.sectionTitle}><h2>{t('dairy.worksheet.dailyEntries')}</h2><div className={styles.actions}>{dirty && <span className={styles.draft}>{t('dairy.worksheet.draft')}</span>}{manager && <button className="btn btn-sm btn-outline-light" disabled={!ready || !Object.values(checked).some(Boolean)} onClick={() => removeRows(Object.keys(checked).filter(id => checked[id]))}><Trash2 size={14}/>{t('dairy.worksheet.removeSelected')}</button>}</div></div>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={t('dairy.worksheet.dailyEntries')}><table className={styles.table}><thead><tr><th rowSpan={2}><input type="checkbox" aria-label={t('dairy.worksheet.selectPage')} checked={!!rows.length && rows.every(row => checked[row.id])} onChange={event => setChecked(Object.fromEntries(rows.map(row => [row.id, event.target.checked])))} disabled={!ready}/></th><th rowSpan={2}>{t('dairy.worksheet.animal')}</th><th rowSpan={2}>{t('reproduction.batch')}</th><th colSpan={4}>{t('dairy.worksheet.total')} (L)</th><th colSpan={3}>{t('dairy.worksheet.feedForm')} (kg)</th><th rowSpan={2}>{t('dairy.worksheet.oxytocin')}</th><th rowSpan={2}>{t('dairy.worksheet.discard')}</th><th rowSpan={2}>{t('dairy.worksheet.notes')}</th><th rowSpan={2}>{t('lotReport.actions')}</th></tr><tr>{dairySessions.map(session => <th key={session}>{t(sessionKeys[session])}</th>)}<th>{t('dairy.worksheet.total')}</th>{dairyFeedSlots.map(slot => <th key={slot}>{t(slotKeys[slot])}</th>)}</tr></thead><tbody>
            {rows.map(row => <tr key={row.id} data-removed={!!removed[row.id]}><td><input type="checkbox" aria-label={t('dairy.worksheet.select', {animal: row.identifier})} checked={!!checked[row.id]} disabled={!ready} onChange={event => setChecked(current => ({...current, [row.id]: event.target.checked}))}/></td><th scope="row"><strong>{row.identifier}</strong><small>{row.name || '—'}</small><small>{removed[row.id] ? t('dairy.worksheet.removed') : drafts[row.id] ? t('dairy.worksheet.draft') : row.recorded ? t('dairy.worksheet.recorded') : t('dairy.worksheet.pending')}</small></th><td>{row.batch_code || '—'}</td>{dairySessions.map(session => <td key={session}><input className="form-control form-control-sm" type="number" min="0" step="0.01" value={row[session]} aria-label={`${row.identifier} · ${t(sessionKeys[session])}`} disabled={!ready || removed[row.id]} onChange={event => changeRow(row, session, event.target.value)}/></td>)}<td><strong className={styles.total}>{fmt(dairyLiters(row))}</strong></td>{dairyFeedSlots.map(slot => { const feed = row.feeds.find(feed => feed.slot === slot); return <td key={slot}><small>{feed?.name || data.products.find(product => product.id === feed?.item)?.name || '—'}</small><span>{feed ? fmt(feed.quantity_kg) : '—'}</span></td>; })}<td>{fmt(row.oxytocin_ml)}</td><td>{fmt(row.discarded_liters)}<small>{row.discard_reason}</small></td><td className={styles.notes}>{row.notes || '—'}</td><td><div className={styles.rowActions}><button type="button" className="btn btn-sm btn-outline-secondary" disabled={!ready || removed[row.id]} onClick={() => edit(row)} aria-label={`${t('dairy.worksheet.edit')} · ${row.identifier}`}><Pencil size={14}/></button>{removed[row.id] ? <button className="btn btn-sm btn-outline-secondary" disabled={!ready} onClick={() => setRemoved(current => ({...current, [row.id]: false}))} aria-label={t('dairy.worksheet.undo')}><Undo2 size={14}/></button> : manager && <button className="btn btn-sm btn-outline-danger" disabled={!ready || (!row.recorded && !drafts[row.id])} onClick={() => removeRows([row.id])} aria-label={`${t('dairy.worksheet.remove')} · ${row.identifier}`}><Trash2 size={14}/></button>}</div></td></tr>)}
            {!rows.length && <tr><td colSpan={14}>{t('dairy.worksheet.empty')} <Link href={`${root}/cadastro`}>{t('swine.home.module.registry')}</Link></td></tr>}
          </tbody></table></div>
          <div className={styles.footer}><div><span>{t('dairy.worksheet.pageTotals')}</span><strong>{fmt(totalLiters)} L</strong></div>{dairyFeedSlots.map(slot => <div key={slot}><span>{t(slotKeys[slot])}</span><strong>{fmt(feedTotal(slot))} kg</strong></div>)}<div><span>{t('dairy.worksheet.oxytocin')}</span><strong>{fmt(visible.reduce((sum, row) => sum + Number(row.oxytocin_ml || 0), 0))} mL</strong></div><button className="btn btn-success" disabled={!ready || !dirty} onClick={() => save(false)}><Save size={16}/>{saving ? t('workspace.loading') : t('dairy.worksheet.save')}</button></div>
        </section>
        <div className={styles.pagination}><span>{data.count} · {t('workspace.countRecordsPagePage', {count: data.count, page})}</span><div className={styles.actions}><button className="btn btn-outline-secondary btn-sm" disabled={locked || dirty || page <= 1} onClick={() => { setData(null); setPage(value => value-1); setChecked({}); setSelectedId(''); }}>{t('notifications.previous')}</button><button className="btn btn-outline-secondary btn-sm" disabled={locked || dirty || !data.next} onClick={() => { setData(null); setPage(value => value+1); setChecked({}); setSelectedId(''); }}>{t('notifications.next')}</button></div></div>
      </>}
      {dirty && !locked && <button className="btn btn-outline-secondary btn-sm" onClick={discardDrafts}>{t('dairy.worksheet.discardDraft')}</button>}
    </>}
  </div>;
}
