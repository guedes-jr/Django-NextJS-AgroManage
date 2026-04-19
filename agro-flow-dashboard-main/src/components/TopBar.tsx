import { Bell, Search, Sun } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger />
      <div className="hidden flex-col md:flex">
        <h1 className="text-lg font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar animal, talhão, lote..."
            className="h-9 w-72 rounded-full pl-9"
          />
        </div>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Sun className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1 pr-3 shadow-soft">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">
              JS
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left text-xs leading-tight md:block">
            <div className="font-semibold">João Silva</div>
            <div className="text-muted-foreground">Administrador</div>
          </div>
        </div>
      </div>
    </header>
  );
}
