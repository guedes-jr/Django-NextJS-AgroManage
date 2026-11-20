"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import styles from "./production.module.css";

interface CropPageHeaderProps {
  icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
  /** Plantation context ("Milho setor 1 › Setor 1"): where the user is. */
  plantation?: { id: string; name?: string | null; field?: string | null } | null;
  actions?: ReactNode;
}

/** Standard header of the plantation screens: context, title and the page actions. */
export function CropPageHeader({ icon: Icon, title, description, plantation, actions }: CropPageHeaderProps) {
  return (
    <div className={styles.pageHeader}>
      {plantation && (
        <nav className={styles.crumbs} aria-label="breadcrumb">
          <Link href={`/home/plantacoes/${plantation.id}`}>{plantation.name || "—"}</Link>
          {plantation.field && <><span aria-hidden="true">›</span><span>{plantation.field}</span></>}
          <span aria-hidden="true">›</span>
          <span aria-current="page">{title}</span>
        </nav>
      )}
      <div className={styles.headerRow}>
        <header className={styles.header}>
          <div className={styles.headerIcon}><Icon size={26} strokeWidth={1.8} aria-hidden="true" /></div>
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
        </header>
        {actions && <div className={styles.headerActions}>{actions}</div>}
      </div>
    </div>
  );
}
