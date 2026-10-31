import Link from "next/link";
import { Milk, Scale, ChevronRight } from "lucide-react";
import styles from "@/components/livestock/species-module-home.module.css";

export default function Page() {
  return <div className={styles.page}>
    <header className={styles.header}><div><h1>Bovinos</h1><p>Escolha o tipo de produção para acessar as rotinas do rebanho.</p></div></header>
    <section aria-label="Tipos de produção bovina" className={styles.moduleGrid}>
      <Link href="/home/rebanho/bovinos/corte" className={styles.moduleCard} data-tone="orange"><div className={styles.moduleIcon}><Scale size={29} aria-hidden="true"/></div><div className={styles.moduleCopy}><h2 className="h5 fw-bold">Gado de corte</h2><p>Cria, recria e engorda. Lotes, pesagens, alimentação, pastagens e vendas.</p></div><span className={styles.moduleAction}>Acessar <ChevronRight size={19} aria-hidden="true"/></span></Link>
      <Link href="/home/rebanho/bovinos/pecuaria-leiteira" className={styles.moduleCard} data-tone="cyan"><div className={styles.moduleIcon}><Milk size={29} aria-hidden="true"/></div><div className={styles.moduleCopy}><h2 className="h5 fw-bold">Pecuária leiteira</h2><p>Ordenhas, produção e descarte de leite. Lactação, reprodução, alimentação e sanidade.</p></div><span className={styles.moduleAction}>Acessar <ChevronRight size={19} aria-hidden="true"/></span></Link>
    </section>
    <p className="small text-muted-foreground mt-3">As duas áreas utilizam os cadastros e históricos bovinos existentes.</p>
  </div>;
}
