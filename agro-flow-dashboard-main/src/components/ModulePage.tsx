import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Filter, Download } from "lucide-react";

type Col<T> = { key: keyof T; label: string; render?: (row: T) => React.ReactNode };

export function ModulePage<T extends { id: string | number }>({
  title,
  subtitle,
  stats,
  columns,
  rows,
  addLabel,
}: {
  title: string;
  subtitle: string;
  stats: { label: string; value: string; hint?: string; color?: string }[];
  columns: Col<T>[];
  rows: T[];
  addLabel: string;
}) {
  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button size="sm" className="gap-2 bg-gradient-primary">
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-0 bg-gradient-card shadow-soft">
            <CardContent className="p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">{s.value}</div>
              {s.hint && (
                <div className="mt-1 text-xs" style={{ color: s.color ?? "var(--color-muted-foreground)" }}>
                  {s.hint}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-soft">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." className="h-9 pl-9" />
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" /> Filtros
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={String(c.key)}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/40">
                    {columns.map((c) => (
                      <TableCell key={String(c.key)}>
                        {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const cls = {
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/20 text-warning-foreground border-warning/40",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
    info: "bg-primary/15 text-primary border-primary/30",
  }[tone];
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  );
}
