"use client";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { usePublicLocale } from "@/lib/publicLocale";
import { FormEvent, useEffect, useState } from "react";
import { LockKeyhole, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { Theme } from "@/lib/theme";
import {
  AffiliateAccount,
  affiliateService,
} from "@/services/affiliateService";
import styles from "../section.module.css";
export default function SettingsPage() {
  const { t } = usePublicLocale();
  const themeLabels: Record<Theme, string> = { light: t("settings.preferences.themeLight"), dark: t("settings.preferences.themeDark"), contrast: t("settings.preferences.themeContrast") };
  const errorText = (error: unknown) => getOrganizationErrorMessage(error, t("workspace.couldNotSaveTheChanges"));

  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [account, setAccount] = useState<AffiliateAccount | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    new_password_confirm: "",
  });
  useEffect(() => {
    affiliateService
      .account()
      .then(setAccount)
      .catch(() => setError(t("workspace.couldNotLoadYourProfile")));
  }, [t]);
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setError("");
    setMessage("");
    try {
      const updated = await affiliateService.updateAccount(account);
      setAccount(updated);
      setTheme(updated.theme);
      const stored = localStorage.getItem("user");
      if (stored)
        localStorage.setItem(
          "user",
          JSON.stringify({ ...JSON.parse(stored), ...updated }),
        );
      const affiliateStored = localStorage.getItem("affiliate_user");
      if (affiliateStored)
        localStorage.setItem(
          "affiliate_user",
          JSON.stringify({ ...JSON.parse(affiliateStored), ...updated }),
        );
      setMessage(t("workspace.profileUpdatedSuccessfully"));
    } catch (err) {
      setError(errorText(err));
    }
  };
  const chooseTheme = async (next: Theme) => {
    setTheme(next);
    if (account) {
      setAccount({ ...account, theme: next });
      try {
        await affiliateService.updateAccount({ theme: next });
      } catch {
        setError(
          t("workspace.theThemeWasAppliedOnThisDeviceButCouldNot"),
        );
      }
    }
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const result = await affiliateService.changePassword(passwords);
      setMessage(result.detail);
      window.setTimeout(() => {
        [
          "access_token",
          "refresh_token",
          "affiliate_user",
          "affiliate_profile",
          "user",
        ].forEach((k) => localStorage.removeItem(k));
        router.replace("/login");
      }, 1400);
    } catch (err) {
      setError(errorText(err));
    }
  };
  if (!account)
    return <div className={styles.loading}>{t("workspace.loadingSettings")}</div>;
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>{t("settings.title")}</h1>
        <p>{t("workspace.updateYourDetailsPortalAppearanceAndAccessCredentials")}</p>
      </div>
      {message && <div className={styles.feedback}>{message}</div>}
      {error && (
        <div className={`${styles.feedback} ${styles.error}`}>{error}</div>
      )}
      <div className={styles.settingsGrid}>
        <form className={styles.formCard} onSubmit={saveProfile}>
          <h2>{t("workspace.profileDetails")}</h2>
          <p>{t("workspace.informationUsedForIdentificationAndContact")}</p>
          <div className={styles.field}>
            <label htmlFor="name">{t("users.name")}</label>
            <input
              id="name"
              value={account.full_name}
              onChange={(e) =>
                setAccount({ ...account, full_name: e.target.value })
              }
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="email">{t("workspace.signInEmail")}</label>
            <input
              id="email"
              type="email"
              value={account.email}
              onChange={(e) =>
                setAccount({ ...account, email: e.target.value })
              }
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="phone">{t("workspace.phoneWhatsapp")}</label>
            <input
              id="phone"
              value={account.phone}
              onChange={(e) =>
                setAccount({ ...account, phone: e.target.value })
              }
            />
          </div>
          <button className={styles.primaryButton}>
            <Save size={16} /> {t("workspace.saveProfile")} </button>
        </form>
        <section className={styles.formCard}>
          <h2>{t("workspace.appearance")}</h2>
          <p> {t("workspace.chooseHowThePortalLooksNowAndOnFutureVisits")} </p>
          <div className={styles.themes}>
            {(["light", "dark", "contrast"] as Theme[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseTheme(item)}
                className={`${styles.theme} ${theme === item ? styles.themeActive : ""}`}
              >
                {themeLabels[item]}
              </button>
            ))}
          </div>
          <small> {t("workspace.youCanAlsoQuicklyToggleDarkModeAtTheTop")} </small>
        </section>
        <form className={styles.formCard} onSubmit={changePassword}>
          <h2>{t("settings.password.title")}</h2>
          <p>{t("workspace.afterTheChangeAllCurrentSessionsWillEnd")}</p>
          <div className={styles.field}>
            <label htmlFor="current">{t("settings.password.current")}</label>
            <input
              id="current"
              type="password"
              value={passwords.current_password}
              onChange={(e) =>
                setPasswords({ ...passwords, current_password: e.target.value })
              }
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="new">{t("settings.password.new")}</label>
            <input
              id="new"
              type="password"
              minLength={8}
              value={passwords.new_password}
              onChange={(e) =>
                setPasswords({ ...passwords, new_password: e.target.value })
              }
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm">{t("settings.password.confirmNew")}</label>
            <input
              id="confirm"
              type="password"
              minLength={8}
              value={passwords.new_password_confirm}
              onChange={(e) =>
                setPasswords({
                  ...passwords,
                  new_password_confirm: e.target.value,
                })
              }
              required
            />
          </div>
          <button className={styles.primaryButton}>
            <LockKeyhole size={16} /> {t("settings.password.title")} </button>
        </form>
      </div>
    </div>
  );
}
