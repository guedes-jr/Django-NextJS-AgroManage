# Plano de Implementação - Módulo de Relatórios AgroManage

---

## 🎯 Objetivo
Criar um sistema completo de relatórios para gestão do agronegócio, integrando dados de todos os módulos do sistema.

---

## 📊 Estrutura dos Módulos Atuais

| Módulo | Dados Principais |
|--------|------------------|
| **accounts** | Usuários, organizações |
| **farms** | Fazendas, setores |
| **livestock** | Espécies, raças, lotes de animais |
| **crops** | Culturas, plantações |
| **inventory** | Itens de estoque, lotes, movimentações |
| **finance** | Transações, categorias |
| **tasks** | Tarefas |
| **audit** | Auditoria |
| **reports** | (vazio - será implementado) |

---

## 📋 Tipos de Relatórios

### 1. 📈 Relatórios de Produção Animal

| Relatório | Descrição | Fontes de Dados |
|------------|-----------|-----------------|
| **Inventário de Rebanho** | Total de animais por espécie/fazenda | livestock.AnimalBatch |
| **Movimentação de Animais** | Entradas, saídas, transferências | livestock.AnimalBatch |
| **Mortalidade** | Taxa de mortalidade por período | livestock.AnimalBatch |
| **Peso Médio** | Evolução de peso por lote | livestock.AnimalBatch |
| **Produção por Unidade** | Animais por hectare/m² | livestock.AnimalBatch + farms.Farm |
| **Custos por Animal** | Custo de aquisição + manutenção | livestock.AnimalBatch + finance.Transaction |

### 2. 🌾 Relatórios de Culturas/Lavouras

| Relatório | Descrição | Fontes de Dados |
|------------|-----------|-----------------|
| **Área Plantada** | Total por cultura e fazenda | crops.Crop + farms.Farm |
| **Safra** | Produção esperada vs realizada | crops.Crop, crops.Harvest |
| **Custos de Produção** | Gastos por hectare/cultura | crops.Crop + finance.Transaction |
| **Produtividade** | kg/hectare por cultura | crops.Crop, crops.Harvest |

### 3. 📦 Relatórios de Estoque

| Relatório | Descrição | Fontes de Dados |
|------------|-----------|-----------------|
| **Geral de Estoque** | Itens com quantidade atual | inventory.ItemEstoque + LoteEstoque |
| **Movimentação** | Entradas e saídas por período | inventory.MovimentacaoEstoque |
| **Estoque Mínimo** | Itens abaixo do estoque mínimo | inventory.ItemEstoque |
| **Validade** | Itens próximos ao vencimento | inventory.LoteEstoque |
| **Consumo por Setor** | Consumo de ração/medicamentos | inventory.MovimentacaoEstoque |
| **Custo de Estoque** | Valor total em estoque | inventory.LoteEstoque |

### 4. 💰 Relatórios Financeiros

| Relatório | Descrição | Fontes de Dados |
|------------|-----------|-----------------|
| **Fluxo de Caixa** | Entradas e saídas por período | finance.Transaction |
| **DRE** | Demonstração de resultados | finance.Transaction + CategoryType |
| **Por Centro de Custo** | Gastos por fazenda/setor | finance.Transaction + farms.Farm |
| **Contas a Pagar/Receber** | Situação atual | finance.Transaction (due_date) |
| **Comparativo Anual** | Evolução ano a ano | finance.Transaction |
| **Por Categoria** | Breakdown por tipo (receita/despesa) | finance.Transaction + FinancialCategory |

### 5. 🏠 Relatórios de Fazendas/Setores

| Relatório | Descrição | Fontes de Dados |
|------------|-----------|-----------------|
| **Resumo por Fazenda** | Visão geral da fazenda | farms.Farm + todos módulos |
| **Ocupação de Setores** | Utilização de áreas | farms.Sector |
| **KPI da Fazenda** | Indicadores-chave | aggregação de todos módulos |

### 6. 📋 Relatórios de Tarefas/Atividades

| Relatório | Descrição | Fontes de Dados |
|------------|-----------|-----------------|
| **Tarefas Pendentes** | Atividades não concluídas | tasks.Task |
| **Conclusão por Período** | Taxa de conclusão | tasks.Task |
| **Custo de Mão de Obra** | Horas trabalhadas | tasks.Task + finance.Transaction |

### 7. 📊 Relatórios Gerenciais

| Relatório | Descrição |
|------------|-----------|
| **Dashboard Executivo** | Resumo de todos os KPIs |
| **Comparativo entre Fazendas** | Performance entre unidades |
| **Tendências** | Evolução histórica de indicadores |
| **Alertas** | Itens críticos (estoque, financeiros) |

---

## 🏗️ Arquitetura Técnica

### Backend (Django)

```
apps/reports/
├── models.py              # ReportConfig, ReportSchedule, GeneratedReport
├── serializers.py         # Serializers para API
├── views.py              # Endpoints de geração
├── urls.py               # Rotas da API
├── services.py           # Lógica de geração
├── tasks.py              # Tasks Celery
└── exporters.py          # Exportação (PDF, Excel, CSV)
```

### Frontend (Next.js)

```
src/
├── components/
│   ├── reports/
│   │   ├── ReportBuilder.tsx       # Construtor de relatórios
│   │   ├── ReportViewer.tsx       # Visualizador
│   │   ├── ReportList.tsx         # Lista de relatórios
│   │   └── ReportFilters.tsx      # Filtros
│   └── dashboard/
│       └── DashboardWidgets.tsx   # Widgets do dashboard
├── app/
│   └── home/reports/
│       └── page.tsx               # Página principal
├── services/
│   └── reportService.ts           # API calls
└── hooks/
    └── useReports.ts              # Hook
```

---

## 🛠️ Tecnologias

- **Backend**: Django REST Framework
- **Frontend**: Next.js, Recharts (gráficos), Tailwind
- **Exportação**: ReportLab (PDF), openpyxl (Excel), csv
- **Agendamento**: Celery + Django CELERY Beat
- **Cache**: Redis (opcional)

---

## 📅 Fases de Implementação

### Fase 1: Base e Modelos
- [ ] Model `ReportConfig` - Configuração de relatórios
- [ ] Model `ReportSchedule` - Agendamento
- [ ] Model `GeneratedReport` - Relatórios gerados
- [ ] Serializers e Viewsets básica

### Fase 2: Relatórios de Estoque
- [ ] Relatório geral de estoque
- [ ] Relatório de movimentações
- [ ] Relatório de estoque mínimo
- [ ] Exportação Excel/PDF

### Fase 3: Relatórios Financeiros
- [ ] Fluxo de caixa
- [ ] DRE simplificada
- [ ] Por categoria
- [ ] Comparativo

### Fase 4: Relatórios de Produção Animal
- [ ] Inventário de rebanho
- [ ] Movimentação
- [ ] Mortalidade

### Fase 5: Relatórios de Culturas
- [ ] Área plantada
- [ ] Produção/safra

### Fase 6: Dashboard e Visualização
- [ ] Página de relatórios
- [ ] Gráficos e visualizações
- [ ] Filtros dinâmicos
- [ ] Dashboard executivo

### Fase 7: Agendamento e Automação
- [ ] Relatórios agendados
- [ ] Envio por email
- [ ] Notificações

---

## 📝 Endpoints da API

```
GET    /api/v1/reports/                    # Lista configurações
POST   /api/v1/reports/generate/           # Gerar relatório
GET    /api/v1/reports/{id}/download/      # Download
GET    /api/v1/reports/scheduled/          # Relatórios agendados
POST   /api/v1/reports/schedule/            # Criar agendamento
GET    /api/v1/reports/dashboard/          # Dados do dashboard
GET    /api/v1/reports/kpis/               # Indicadores principais
```

---

## 📊 KPIs do Dashboard

| KPI | Cálculo |
|-----|---------|
| **Total Animais** | Soma de quantity por lote ativo |
| **Valor Estoque** | Soma de (quantidade × custo) |
| **Receita Mês** | Transações receita no mês |
| **Despesa Mês** | Transações despesa no mês |
| **Estoque Crítico** | Itens abaixo do mínimo |
| **Tarefas Pendentes** | Tarefas não concluídas |
| **Taxa Mortalidade** | (Mortos / Total) × 100 |

---

## 🔗 Integrações

| Módulo | Dado para Relatório |
|--------|---------------------|
| farms | Fazendas, setores |
| livestock | Animais, lotes |
| crops | Culturas, safras |
| inventory | Estoque, movimentações |
| finance | Transações |
| tasks | Tarefas |

---

## 📄 Formatos de Exportação

- **PDF**: Relatórios formais para impressão
- **Excel**: Planilhas para manipulação
- **CSV**: Dados para sistemas externos

---

## ⚙️ Configurações do Usuário

```json
{
  "default_report_format": "pdf",
  "email_reports": true,
  "report_schedule": "weekly",
  "dashboard_layout": "custom"
}
```

---

## 📌 Prioridade de Implementação Sugerida

1. **Fase 1** - Base (obrigatório)
2. **Fase 4** - Produção Animal (core do agronegócio)
3. **Fase 3** - Financeiro (gestão)
4. **Fase 2** - Estoque (operações)
5. **Fase 5** - Culturas (se aplicável)
6. **Fase 6** - Dashboard (visibilidade)
7. **Fase 7** - Automação (avançado)