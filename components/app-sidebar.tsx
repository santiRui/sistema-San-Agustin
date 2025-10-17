"use client"

import { Scale, Home, Package, ShoppingCart, Receipt, Weight, LogOut, User, Users, Tag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { supabase } from "@/lib/supabaseClient";

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
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
    roles: ["administrador", "encargado", "empleado"],
  },
  {
    title: "Productos",
    url: "/dashboard/productos",
    icon: Package,
    roles: ["administrador", "encargado", "empleado"],
  },
  {
    title: "Categorías",
    url: "/dashboard/categorias",
    icon: Tag,
    roles: ["administrador", "encargado"],
  },
  {
    title: "Clientes",
    url: "/dashboard/clientes",
    icon: Users,
    roles: ["administrador", "encargado"],
  },
  {
    title: "Realizar Venta",
    url: "/dashboard/ventas/nueva",
    icon: ShoppingCart,
    roles: ["administrador", "encargado", "empleado"],
  },
  {
    title: "Ventas Hechas",
    url: "/dashboard/ventas",
    icon: Receipt,
    roles: ["administrador", "encargado", "empleado"],
  },
  {
    title: "Registrar Salida",
    url: "/dashboard/salidas/nueva",
    icon: Receipt,
    roles: ["administrador", "encargado", "empleado"],
  },
  {
    title: "Salidas",
    url: "/dashboard/salidas",
    icon: Receipt,
    roles: ["administrador", "encargado", "empleado"],
  },
  {
    title: "Tickets",
    url: "/dashboard/tickets",
    icon: Receipt,
    roles: ["administrador", "encargado"],
  },
  {
    title: "Lecturas Balanza",
    url: "/dashboard/balanza",
    icon: Weight,
    roles: ["administrador", "encargado", "empleado"],
  },
];


export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, user, isLoading } = useSession();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(role || "")
  );

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="bg-orange-100 p-2 rounded-lg">
            <Scale className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">San Agustín</h2>
            <p className="text-sm text-gray-500">Fiambrería</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
                            {isLoading ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : ( 
                filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full">
                  <User className="h-4 w-4" />
                  <span>{user?.email || "Usuario"}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width]">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Cerrar Sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
