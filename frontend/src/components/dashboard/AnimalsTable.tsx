"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  TablePagination,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Search, ArrowUpDown, Filter, MoreHorizontal, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Animal {
  id: string;
  name: string;
  category: string;
  breed?: string;
  weight: number;
  age: string | number;
  status: "Ativo" | "Doente" | "Vendido" | "Quarentena";
  lastCheck?: string;
}

interface AnimalsTableProps {
  data: Animal[];
  type: "bovino" | "suino" | "ave";
}

const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
  Ativo: { bg: "rgba(34, 197, 94, 0.12)", color: "#16a34a", label: "Ativo" },
  Doente: { bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626", label: "Doente" },
  Vendido: { bg: "rgba(132, 204, 22, 0.12)", color: "#65a30d", label: "Vendido" },
  Quarentena: { bg: "rgba(234, 179, 8, 0.12)", color: "#ca8a04", label: "Quarentena" },
};

const columnLabels = {
  bovino: {
    id: "ID",
    name: "Nome/Brinco",
    breed: "Raça",
    weight: "Peso (kg)",
    age: "Idade",
  },
  suino: {
    id: "ID",
    name: "Lote",
    breed: "Fase",
    weight: "Peso (kg)",
    age: "Idade",
  },
  ave: {
    id: "ID",
    name: "Galpão",
    breed: "Linhagem",
    weight: "Mortalidade %",
    age: "Idade",
  },
};

export function AnimalsTable({ data, type }: AnimalsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [attributeFilter, setAttributeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Animal; direction: 'asc' | 'desc' } | null>(null);
  const itemsPerPage = 8;

  const attributeOptions = {
    bovino: [
      { value: "", label: "Todos atributos" },
      { value: "Nelore", label: "Nelore" },
      { value: "Angus", label: "Angus" },
      { value: "Brahman", label: "Brahman" },
      { value: "Hereford", label: "Hereford" },
      { value: "Brangus", label: "Brangus" },
    ],
    suino: [
      { value: "", label: "Todos atributos" },
      { value: "Terminação", label: "Terminação" },
      { value: "Crescimento", label: "Crescimento" },
      { value: "Maternidade", label: "Maternidade" },
      { value: "Creche", label: "Creche" },
      { value: "Reprodução", label: "Reprodução" },
    ],
    ave: [
      { value: "", label: "Todos atributos" },
      { value: "Cobb 500", label: "Cobb 500" },
      { value: "Ross 308", label: "Ross 308" },
      { value: "Hubbard", label: "Hubbard" },
      { value: "Cobb", label: "Cobb" },
    ],
  };

  const handleSort = (key: keyof Animal) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    let result = [...data];

    if (searchTerm) {
      result = result.filter(
        (animal) =>
          animal.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          animal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (animal.breed && animal.breed.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (statusFilter !== "Todos") {
      result = result.filter((animal) => animal.status === statusFilter);
    }

    if (attributeFilter) {
      result = result.filter((animal) => animal.breed === attributeFilter);
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, statusFilter, attributeFilter, sortConfig]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentItems = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const cols = columnLabels[type];

  return (
    <div className="d-flex flex-column gap-4">
      <div className="dashboard-card border border-border">
        <div className="glass-filter-bar m-3 d-flex flex-wrap gap-3 align-items-center">
          <div className="login-input-group flex-grow-1" style={{ maxWidth: 380, marginBottom: 0 }}>
            <div className="login-input-wrapper">
              <input
                type="text"
                className="login-input login-input-icon-left"
                style={{ background: "var(--background)", color: "var(--foreground)" }}
                placeholder={`Buscar por ${type === 'ave' ? 'galpão, linhagem' : 'ID, nome, raça'}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="login-input-icon text-muted-foreground" size={18} />
            </div>
          </div>
          
          <div className="login-input-group" style={{ width: 160, marginBottom: 0 }}>
            <div className="login-input-wrapper">
              <select
                className="login-input login-input-icon-left"
                style={{ background: "var(--background)", color: "var(--foreground)" }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="Todos">Todos</option>
                <option value="Ativo">Ativo</option>
                <option value="Doente">Doente</option>
                <option value="Quarentena">Quarentena</option>
                <option value="Vendido">Vendido</option>
              </select>
              <Filter className="login-input-icon text-muted-foreground" size={18} />
            </div>
          </div>
          
          <div className="login-input-group" style={{ width: 180, marginBottom: 0 }}>
            <div className="login-input-wrapper">
              <select
                className="login-input login-input-icon-left"
                style={{ background: "var(--background)", color: "var(--foreground)" }}
                value={attributeFilter}
                onChange={(e) => setAttributeFilter(e.target.value)}
              >
                {attributeOptions[type as keyof typeof attributeOptions].map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Filter className="login-input-icon text-muted-foreground" size={18} />
            </div>
          </div>
          <Button variant="outline-secondary" className="d-flex align-items-center gap-2 ms-auto" style={{ height: 42 }}>
            <Filter size={16} />
            Mais filtros
          </Button>
        </div>

        <Table responsive className="mb-0 border-0">
          <TableHead className="bg-transparent border-bottom border-border">
            <TableRow className="border-0 hover-bg-muted">
              <TableHeader className="cursor-pointer text-muted-foreground border-0" onClick={() => handleSort('id')}>
                <div className="d-flex align-items-center gap-2">
                  {cols.id}
                  {sortConfig?.key === 'id' && <ArrowUpDown size={14} />}
                </div>
              </TableHeader>
              <TableHeader className="cursor-pointer text-muted-foreground border-0" onClick={() => handleSort('name')}>
                <div className="d-flex align-items-center gap-2">
                  {cols.name}
                  {sortConfig?.key === 'name' && <ArrowUpDown size={14} />}
                </div>
              </TableHeader>
              {type !== 'ave' && (
                <TableHeader className="cursor-pointer text-muted-foreground border-0" onClick={() => handleSort('breed' as keyof Animal)}>
                  <div className="d-flex align-items-center gap-2">
                    {cols.breed}
                    {sortConfig?.key === 'breed' && <ArrowUpDown size={14} />}
                  </div>
                </TableHeader>
              )}
              <TableHeader className="cursor-pointer text-muted-foreground border-0" onClick={() => handleSort('weight')}>
                <div className="d-flex align-items-center gap-2">
                  {cols.weight}
                  {sortConfig?.key === 'weight' && <ArrowUpDown size={14} />}
                </div>
              </TableHeader>
              <TableHeader className="cursor-pointer text-muted-foreground border-0" onClick={() => handleSort('age')}>
                <div className="d-flex align-items-center gap-2">
                  {cols.age}
                  {sortConfig?.key === 'age' && <ArrowUpDown size={14} />}
                </div>
              </TableHeader>
              <TableHeader className="text-muted-foreground border-0">Status</TableHeader>
              <TableHeader className="text-end text-muted-foreground border-0" style={{ width: 100 }}>Ações</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {currentItems.length > 0 ? (
                currentItems.map((animal) => {
                  const status = statusConfig[animal.status];
                  return (
                    <motion.tr 
                      key={animal.id} 
                      className="align-middle border-bottom border-border hover-bg-muted transition-colors"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <TableCell className="border-0">
                        <span className="fw-bold text-foreground">{animal.id}</span>
                      </TableCell>
                      <TableCell className="border-0">
                        <div>
                          <span className="fw-semibold d-block text-foreground">{animal.name}</span>
                          {animal.lastCheck && (
                            <span className="text-muted-foreground" style={{ fontSize: "0.75rem" }}>
                              Última checagem: {animal.lastCheck}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {type !== 'ave' && (
                        <TableCell className="border-0">
                          <span className="text-muted-foreground">{animal.breed || '-'}</span>
                        </TableCell>
                      )}
                      <TableCell className="border-0">
                        <span className="fw-semibold text-foreground">
                          {animal.weight}{type === 'ave' ? '%' : ' kg'}
                        </span>
                      </TableCell>
                      <TableCell className="border-0">
                        <span className="text-muted-foreground">{animal.age}</span>
                      </TableCell>
                      <TableCell className="border-0">
                        <Badge 
                          className={`px-3 py-1.5 fw-semibold border-0 badge-glow-${animal.status}`}
                          style={{ 
                            background: status.bg, 
                            color: status.color,
                            fontSize: "0.75rem" 
                          }}
                        >
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end border-0">
                        <div className="d-flex gap-2 justify-content-end">
                          <Button variant="outline-secondary" size="sm" className="p-2 border border-border bg-background hover-bg-muted text-foreground rounded-circle">
                            <Eye size={16} />
                          </Button>
                          <Button variant="outline-secondary" size="sm" className="p-2 border border-border bg-background hover-bg-muted text-foreground rounded-circle">
                            <MoreHorizontal size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-5 text-muted-foreground border-0">
                    Nenhum registro encontrado para a busca.
                  </TableCell>
                </TableRow>
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
        
        {totalPages > 0 && (
          <div className="p-3 border-top border-border">
            <TablePagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredData.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}