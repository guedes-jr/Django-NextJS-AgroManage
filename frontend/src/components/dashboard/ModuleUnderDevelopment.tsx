import Link from "next/link";
import { ArrowLeft, Bird, Construction, Icon, type LucideProps } from "lucide-react";
import { cowHead } from "@lucide/lab";
import type { ComponentType } from "react";
import styles from "./ModuleUnderDevelopment.module.css";

type BlockedModule = "bovinos" | "aves";
type ModuleIcon = ComponentType<LucideProps>;

const CowIcon: ModuleIcon = (props) => <Icon iconNode={cowHead} {...props} />;

const modules: Record<BlockedModule, { title: string; icon: ModuleIcon }> = {
  bovinos: { title: "Bovinos", icon: CowIcon },
  aves: { title: "Aves", icon: Bird },
};

export function ModuleUnderDevelopment({ module }: { module: BlockedModule }) {
  const config = modules[module];
  const ModuleIcon = config.icon;

  return (
    <section className={styles.wrapper} aria-labelledby="module-development-title">
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          <ModuleIcon size={38} strokeWidth={1.8} />
        </div>
        <span className={styles.status}>
          <Construction size={16} aria-hidden="true" />
          Em desenvolvimento
        </span>
        <h1 id="module-development-title">Módulo de {config.title}</h1>
        <p>
          Esta funcionalidade ainda está em desenvolvimento e ficará disponível em uma próxima atualização.
        </p>
        <Link href="/home" className={styles.backLink}>
          <ArrowLeft size={18} aria-hidden="true" />
          Voltar para o dashboard
        </Link>
      </div>
    </section>
  );
}
