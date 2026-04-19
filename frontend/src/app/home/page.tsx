"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, Button } from "@/components/ui";
import { apiClient } from "@/services/api";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      router.push("/login");
      return;
    }

    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      apiClient
        .get("/auth/me/")
        .then((res) => {
          setUser(res.data);
          localStorage.setItem("user", JSON.stringify(res.data));
        })
        .catch(() => {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          router.push("/login");
        })
        .finally(() => setLoading(false));
    }
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    router.push("/logout");
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-md-3 col-lg-2 sidebar">
          <div className="d-flex flex-column min-vh-100">
            <div className="p-3 bg-success text-white">
              <h4 className="mb-0">AgroManage</h4>
            </div>
            <nav className="nav flex-column p-3">
              <a className="nav-link active" href="#">
                Início
              </a>
              <a className="nav-link" href="#">
                Fazendas
              </a>
              <a className="nav-link" href="#">
                Pecuária
              </a>
              <a className="nav-link" href="#">
                Lavoura
              </a>
              <a className="nav-link" href="#">
                Estoque
              </a>
              <a className="nav-link" href="#">
                Financeiro
              </a>
              <a className="nav-link" href="#">
                Relatórios
              </a>
            </nav>
          </div>
        </div>
        <div className="col-md-9 col-lg-10">
          <header className="d-flex justify-content-between align-items-center p-3 bg-light border-bottom">
            <h5 className="mb-0">Dashboard</h5>
            <div className="d-flex align-items-center gap-3">
              <span className="text-muted">{user?.full_name}</span>
              <Button variant="outline-danger" size="sm" onClick={handleLogout}>
                Sair
              </Button>
            </div>
          </header>
          <main className="p-4">
            <div className="row g-4">
              <div className="col-md-4">
                <Card>
                  <CardTitle>Fazendas</CardTitle>
                  <p className="card-text text-muted">Gerencie suas propriedades rurais</p>
                  <Button variant="agro" size="sm">
                    Ver fazendas
                  </Button>
                </Card>
              </div>
              <div className="col-md-4">
                <Card>
                  <CardTitle>Pecuária</CardTitle>
                  <p className="card-text text-muted">Controle de rebanhos e lotes</p>
                  <Button variant="agro" size="sm">
                    Ver rebanhos
                  </Button>
                </Card>
              </div>
              <div className="col-md-4">
                <Card>
                  <CardTitle>Lavoura</CardTitle>
                  <p className="card-text text-muted">Talhões e ciclos de plantio</p>
                  <Button variant="agro" size="sm">
                    Ver lavouras
                  </Button>
                </Card>
              </div>
              <div className="col-md-4">
                <Card>
                  <CardTitle>Estoque</CardTitle>
                  <p className="card-text text-muted">Insumos e movimentações</p>
                  <Button variant="agro" size="sm">
                    Ver estoque
                  </Button>
                </Card>
              </div>
              <div className="col-md-4">
                <Card>
                  <CardTitle>Financeiro</CardTitle>
                  <p className="card-text text-muted">Receitas e despesas</p>
                  <Button variant="agro" size="sm">
                    Ver financeiro
                  </Button>
                </Card>
              </div>
              <div className="col-md-4">
                <Card>
                  <CardTitle>Relatórios</CardTitle>
                  <p className="card-text text-muted">Dashboards e análises</p>
                  <Button variant="agro" size="sm">
                    Ver relatórios
                  </Button>
                </Card>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}