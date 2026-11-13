"use client";

import { useState } from 'react';
import { Milk, Save, Trash2 } from 'lucide-react';
import { useOrganizationLocale } from '@/lib/locale';
import { dairyFeedSlots, type DairyWorksheet, type DairyWorksheetTotal, type DairyFeedSlot } from '@/services/dairyWorksheetService';
import styles from './dairy-worksheet.module.css';

const slotKeys = {concentrate: 'dairy.worksheet.concentrate', silage: 'dairy.worksheet.silage', mineral: 'dairy.worksheet.mineral'} as const;
export function DairyTotalPanel({date, data, disabled, manager, onDirty, onSave}: {
  date: string; data: DairyWorksheet; disabled: boolean; manager: boolean;
  onDirty: () => void; onSave: (total: DairyWorksheetTotal) => void;
}) {
  const {t, language} = useOrganizationLocale();
  const [values, setValues] = useState<DairyWorksheetTotal>(() => data.total || {
    id: null, expected_version: '', period_start: date, liters: '', discarded_liters: '0',
    discard_reason: '', notes: '', oxytocin_ml: '0', batch: null, feeds: [],
  });
  const [error, setError] = useState('');
  const readonly = disabled || (!!data.total && !manager);
  function change(key: keyof Omit<DairyWorksheetTotal, 'feeds'>, value: string) {
    setValues(current => ({...current, [key]: value})); onDirty();
  }
  function feed(slot: DairyFeedSlot, key: 'item' | 'quantity_kg', value: string) {
    setValues(current => ({...current, feeds: [...current.feeds.filter(row => row.slot !== slot),
      {...(current.feeds.find(row => row.slot === slot) || {slot, item: '', quantity_kg: '0'}), [key]: value}]})); onDirty();
  }
  function submit() {
    const feeds = values.feeds.filter(row => Number(row.quantity_kg) !== 0);
    if (feeds.some(row => !row.item || !(Number(row.quantity_kg) > 0))) { setError(t('dairy.worksheet.feedRequired')); return; }
    setError(''); onSave({...values, batch: values.batch || null, feeds});
  }
  return <section className={`${styles.panel} ${styles.totalPanel}`}>
    <h2 className={styles.sectionTitle}><Milk size={17}/>{t('dairy.worksheet.periodTotal')}</h2>
    <form className={styles.panelBody} onSubmit={event => { event.preventDefault(); submit(); }}>
      <p className={styles.muted}>{t('dairy.worksheet.periodHelp')}</p>
      {data.total && <p className={styles.muted}>{t('dairy.worksheet.totalExists')}</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <div className={styles.totalFields}>
        <label className={styles.field}>{t('dairy.worksheet.periodStart')}<input type="date" className="form-control form-control-sm" required max={date} value={values.period_start} disabled={readonly} onChange={event => change('period_start', event.target.value)}/></label>
        <label className={styles.field}>{t('dairy.worksheet.periodEnd')}<input type="date" className="form-control form-control-sm" value={date} readOnly disabled={readonly}/></label>
        <label className={styles.field}>{t('dairy.worksheet.totalFarm')}<input className="form-control form-control-sm" type="number" min="0.01" step="0.01" required disabled={readonly} value={values.liters} onChange={event => change('liters', event.target.value)}/></label>
        <label className={styles.field}>{t('dairy.worksheet.totalFeedTarget')}<select className="form-select form-select-sm" value={values.batch || ''} disabled={readonly} onChange={event => change('batch', event.target.value)}><option value="">{t('dairy.worksheet.allFarmCows')}</option>{data.batches.map(row => <option key={row.id} value={row.id}>{row.batch_code} {row.name}</option>)}</select></label>
        {dairyFeedSlots.filter(slot => slot !== 'mineral').map(slot => { const current = values.feeds.find(feed => feed.slot === slot); return <div className={styles.feedLine} key={slot}><label className={styles.field}>{t(slotKeys[slot])}<select className="form-select form-select-sm" value={current?.item || ''} disabled={readonly} onChange={event => feed(slot, 'item', event.target.value)}><option value="">{t('dairy.worksheet.noFeed')}</option>{data.products.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className={styles.field}>{t('dairy.worksheet.quantity')}<input className="form-control form-control-sm" type="number" min="0" step="0.01" disabled={readonly} value={current?.quantity_kg || '0'} onChange={event => feed(slot, 'quantity_kg', event.target.value)}/></label></div>; })}
        <label className={styles.field}>{t('dairy.worksheet.oxytocin')}<input className="form-control form-control-sm" type="number" min="0" step="0.01" disabled={readonly} value={values.oxytocin_ml} onChange={event => change('oxytocin_ml', event.target.value)}/></label>
        <label className={styles.field}>{t('dairy.worksheet.discard')}<input className="form-control form-control-sm" type="number" min="0" step="0.01" disabled={readonly} value={values.discarded_liters} onChange={event => change('discarded_liters', event.target.value)}/></label>
        <label className={styles.field}>{t('dairy.worksheet.discardReason')}<input className="form-control form-control-sm" maxLength={200} disabled={readonly} value={values.discard_reason} onChange={event => change('discard_reason', event.target.value)} required={Number(values.discarded_liters)>0}/></label>
        <label className={styles.field}>{t('dairy.worksheet.notes')}<input className="form-control form-control-sm" maxLength={2000} disabled={readonly} value={values.notes} onChange={event => change('notes', event.target.value)}/></label>
      </div>
      <div className={styles.actions}>{manager && data.total && <button type="button" className="btn btn-outline-danger btn-sm" disabled={readonly} onClick={() => onSave({...values, remove: true})}><Trash2 size={15}/>{t('dairy.worksheet.remove')}</button>}<button className="btn btn-success btn-sm" type="submit" disabled={readonly}><Save size={15}/>{t('dairy.worksheet.saveTotal')}</button>{data.total && <strong>{Number(data.total.liters).toLocaleString(language)} L</strong>}</div>
    </form>
  </section>;
}
