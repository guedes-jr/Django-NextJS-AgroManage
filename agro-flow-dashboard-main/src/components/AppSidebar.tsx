import { Link, useLocation } from "@tanstack/react-router";
import {
  Sprout,
  LayoutDashboard,
  Beef,
  Wheat,
  Wallet,
  Package,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, color: "from-blue-500 to-cyan-400" },
  { title: "Rebanho", url: "/dashboard/rebanho", icon: Beef, color: "from-orange-500 to-red-400" },
  { title: "Lavoura", url: "/dashboard/lavoura", icon: Wheat, color: "from-green-500 to-emerald-400" },
  { title: "Financeiro", url: "/dashboard/financeiro", icon: Wallet, color: "from-yellow-500 to-amber-400" },
  { title: "Estoque", url: "/dashboard/estoque", icon: Package, color: "from-purple-500 to-pink-400" },
  { title: "Usuários", url: "/dashboard/usuarios", icon: Users, color: "from-indigo-500 to-violet-400" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const isActive = (url: string) =>
    url === "/dashboard" ? pathname === url : pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-gradient-to-b from-sidebar to-sidebar/95">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-gold shadow-glow hover:shadow-glow-lg hover:scale-105 transition-all duration-300">
            <Sprout className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="truncate text-sm font-bold text-sidebar-foreground animate-fade-in">
                Gestão Agro
              </div>
              <div className="truncate text-xs text-sidebar-foreground/60">
                Fazenda São João
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className={`relative group overflow-hidden rounded-lg mx-2 mb-1 transition-all duration-300 hover:scale-[1.02] ${
                      isActive(item.url) 
                        ? `bg-gradient-to-r ${item.color} text-white shadow-lg` 
                        : "hover:bg-sidebar-accent/80"
                    }`}
                  >
                    <Link to={item.url} className="flex items-center gap-3 py-2.5 px-3">
                      <div className={`relative p-1.5 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors duration-300`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className={`font-medium transition-all duration-300 ${isActive(item.url) ? "opacity-100" : "group-hover:translate-x-1"}`}>
                        {item.title}
                      </span>
                      {isActive(item.url) && (
                        <div className="absolute inset-0 bg-white/10 animate-pulse rounded-lg" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              tooltip="Configurações"
              className="mx-2 mb-1 rounded-lg hover:bg-sidebar-accent/80 hover:scale-[1.02] transition-all duration-300"
            >
              <div className="p-1.5 rounded-lg bg-sidebar-accent/50 group-hover:bg-sidebar-accent transition-colors duration-300">
                <Settings className="h-4 w-4" />
              </div>
              <span className="group-hover:translate-x-1 transition-transform duration-300">Configurações</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              asChild 
              tooltip="Sair"
              className="mx-2 mb-1 rounded-lg hover:bg-red-500/20 hover:scale-[1.02] transition-all duration-300 hover:text-red-400"
            >
              <Link to="/login" className="flex items-center gap-3 py-2.5 px-3">
                <div className="p-1.5 rounded-lg bg-sidebar-accent/50 group-hover:bg-red-500/30 transition-colors duration-300">
                  <LogOut className="h-4 w-4" />
                </div>
                <span className="group-hover:translate-x-1 transition-transform duration-300">Sair</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
