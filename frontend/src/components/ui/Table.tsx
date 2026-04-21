import { HTMLAttributes, ReactNode, forwardRef } from "react";
import "./table.css";
interface TableProps extends HTMLAttributes<HTMLTableElement> {
  striped?: boolean;
  hover?: boolean;
  bordered?: boolean;
  borderless?: boolean;
  responsive?: boolean;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className = "", striped = true, hover = true, bordered = false, borderless = false, responsive = false, children, ...props }, ref) => {
    const tableClass = [
      "table",
      striped && "table-striped",
      hover && "table-hover",
      bordered && "table-bordered",
      borderless && "table-borderless",
    ]
      .filter(Boolean)
      .join(" ");

    const wrapperClass = responsive ? "table-responsive" : "";

    return (
      <div className={wrapperClass}>
        <table ref={ref} className={`${tableClass} table-agro ${className}`} {...props}>
          {children}
        </table>
      </div>
    );
  }
);

Table.displayName = "Table";

export const TableHead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = "", ...props }, ref) => {
    return <thead ref={ref} className={className} {...props} />;
  }
);

TableHead.displayName = "TableHead";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = "", ...props }, ref) => {
    return <tbody ref={ref} className={className} {...props} />;
  }
);

TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className = "", ...props }, ref) => {
    return <tr ref={ref} className={className} {...props} />;
  }
);

TableRow.displayName = "TableRow";

export const TableHeader = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement>>(
  ({ className = "", ...props }, ref) => {
    return <th ref={ref} className={className} {...props} />;
  }
);

TableHeader.displayName = "TableHeader";

export const TableCell = forwardRef<HTMLTableCellElement, HTMLAttributes<HTMLTableCellElement> & { colSpan?: number }>(
  ({ className = "", colSpan, ...props }, ref) => {
    return <td ref={ref} className={className} colSpan={colSpan} {...props} />;
  }
);

TableCell.displayName = "TableCell";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
}

export const TablePagination = ({ page, totalPages, onPageChange, totalItems, itemsPerPage }: TablePaginationProps) => {
  const startItem = (page - 1) * (itemsPerPage || 20) + 1;
  const endItem = Math.min(page * (itemsPerPage || 20), totalItems || 0);

  return (
    <div className="d-flex justify-content-between align-items-center mt-3">
      <div className="text-muted">
        {totalItems ? (
          <span>
            Mostrando {startItem} a {endItem} de {totalItems} registros
          </span>
        ) : (
          <span>Página {page} de {totalPages}</span>
        )}
      </div>
      <nav>
        <ul className="pagination pagination-sm mb-0">
          <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
            <button className="page-link" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
              Anterior
            </button>
          </li>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
              <button className="page-link" onClick={() => onPageChange(p)}>
                {p}
              </button>
            </li>
          ))}
          <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
            <button className="page-link" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
              Próxima
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};