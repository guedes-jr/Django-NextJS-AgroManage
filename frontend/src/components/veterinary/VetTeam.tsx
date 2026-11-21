"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus, UsersRound } from "lucide-react";
import { veterinaryService, vetError, type VetTeamMember, type VetTeamUser } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";

/** Area team with logins and the commission of each member (admin and manager edit). */
export function VetTeam({ ctx, canEdit }: { ctx: VetContext; canEdit: boolean }) {
  const { t } = ctx;
  const [members, setMembers] = useState<VetTeamMember[] | null>(null);
  const [candidates, setCandidates] = useState<VetTeamUser[]>([]);
  const [user, setUser] = useState("");
  const [commission, setCommission] = useState("0");
  const [message, setMessage] = useState("");

  const fetchTeam = (signal?: AbortSignal) => Promise.all([veterinaryService.team(signal), veterinaryService.teamCandidates(signal)]);
  const load = useCallback(async () => {
    const [team, options] = await fetchTeam();
    setMembers(team);
    setCandidates(options);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchTeam(controller.signal)
      .then(([team, options]) => { setMembers(team); setCandidates(options); })
      .catch(() => { if (!controller.signal.aborted) setMembers([]); });
    return () => controller.abort();
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await load();
      await ctx.reload();
      setMessage(t("vet.team.saved"));
    } catch (err) {
      setMessage(vetError(err, t("vet.saveError")));
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}><h2><UsersRound size={18} className={styles.ok} aria-hidden="true" /> {t("vet.team.title")}</h2></div>
      <p className={styles.hint}>{t("vet.team.hint")}</p>
      {members === null ? <p className={styles.muted}>{t("vet.loading")}</p> : members.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 420 }}>
            <thead><tr><th>{t("vet.team.member")}</th><th>{t("vet.team.commission")}</th><th /></tr></thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td><b>{m.name}</b><div className={styles.muted}>{m.email}</div></td>
                  <td>
                    {canEdit ? (
                      <input key={m.commission_percent} className={`form-control form-control-sm ${styles.moneyInput}`} inputMode="decimal" defaultValue={m.commission_percent}
                        aria-label={`${t("vet.team.commission")} ${m.name}`}
                        onBlur={e => { const value = e.target.value.replace(",", "."); if (Number(value) !== Number(m.commission_percent)) void run(() => veterinaryService.updateTeamMember(m.id, { commission_percent: value })); }} />
                    ) : `${m.commission_percent}%`}
                  </td>
                  <td>{canEdit && <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`${t("vet.team.remove")} ${m.name}`} onClick={() => void run(() => veterinaryService.removeTeamMember(m.id))}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className={styles.muted}>{t("vet.team.empty")}</p>}
      {canEdit && candidates.length > 0 && (
        <div className={styles.inputRow} style={{ marginTop: 10 }}>
          <select className="form-select" aria-label={t("vet.team.member")} value={user} onChange={e => setUser(e.target.value)}>
            <option value="">{t("vet.team.choose")}</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="form-control" inputMode="decimal" aria-label={t("vet.team.commission")} value={commission} onChange={e => setCommission(e.target.value)} />
          <button type="button" className="btn btn-sm btn-agro" disabled={!user} onClick={() => void run(async () => { await veterinaryService.addTeamMember({ user, commission_percent: commission.replace(",", ".") || "0" }); setUser(""); setCommission("0"); })}>
            <UserPlus size={14} aria-hidden="true" /> {t("vet.team.add")}
          </button>
        </div>
      )}
      {message && <p role="status" className={styles.hint} style={{ margin: "8px 0 0" }}>{message}</p>}
    </section>
  );
}
