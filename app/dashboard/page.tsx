"use client"

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, Receipt, TrendingUp, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { supabase } from "@/lib/supabaseClient";

interface Product {
  id: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  precio: number;
  unidad_medida: string;
}

interface RecentSale {
  id: string;
  monto_total: number;
  created_at: string;
  clientes: { nombre: string } | null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ 
    totalProducts: 0,
    inventoryValue: 0,
    ventasHoy: 0, 
    ticketsHoy: 0, 
    lecturasBalanza: 0 
  });
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);

      // Solución definitiva para la zona horaria: calcular el día en el cliente
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      // Obtener todas las consultas en paralelo
      const [productsResponse, ventasHoyResponse, ticketsResponse, balanzaResponse, recentSalesResponse] = await Promise.all([
        supabase.from('productos').select('id, nombre, stock, stock_minimo, precio, unidad_medida'),
        supabase.from('ventas').select('monto_total').gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString()),
        supabase.from('tickets').select('id', { count: 'exact' }).gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString()),
        supabase.from('lecturas_balanza').select('id', { count: 'exact' }),
        supabase.from('ventas').select('id, monto_total, created_at, clientes ( nombre )').order('created_at', { ascending: false }).limit(5)
      ]);

      const { data: productsData, error: productsError } = productsResponse;
      const { data: ventasData, error: ventasError } = ventasHoyResponse;
      const { data: ticketsData, error: ticketsError } = ticketsResponse;
      const { data: balanzaData, error: balanzaError } = balanzaResponse;
      const { data: recentSalesData, error: recentSalesError } = recentSalesResponse;

      // Procesar datos de productos
      if (productsData) {
        const totalProducts = productsData.length;
        const inventoryValue = productsData.reduce((sum, p) => sum + (p.stock * p.precio), 0);
        setStats(prev => ({ ...prev, totalProducts, inventoryValue }));
        setLowStockProducts(productsData.filter(p => p.stock < p.stock_minimo));
      }

      // Procesar ventas de hoy
      if (ventasData) {
        const ventasHoy = ventasData.reduce((sum, v) => sum + v.monto_total, 0);
        setStats(prev => ({ ...prev, ventasHoy }));
      }

      // Procesar tickets de hoy
      if (ticketsData) {
        setStats(prev => ({ ...prev, ticketsHoy: ticketsError ? 0 : ticketsData.length }));
      }

      // Procesar lecturas de balanza
      if (balanzaData) {
        setStats(prev => ({ ...prev, lecturasBalanza: balanzaError ? 0 : balanzaData.length }));
      }

      // Procesar ventas recientes
      if (recentSalesData) {
        const processedSales = recentSalesData.map((sale: any) => ({
          ...sale,
          clientes: Array.isArray(sale.clientes) ? sale.clientes[0] ?? null : sale.clientes,
        }));
        setRecentSales(processedSales as RecentSale[]);
      }

      setIsLoading(false);
    };

    fetchDashboardData();
  }, []);

  const formatUnitText = (unit: string, value: number) => {
    if (!unit) return '';
    const baseUnit = unit.charAt(0).toUpperCase() + unit.slice(1);
    if (value !== 1) {
      return `${baseUnit}s`;
    }
    return baseUnit;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <BreadcrumbNav items={[{ label: "Fiambrería San Agustín", href: "/dashboard" }, { label: "Dashboard" }]} />

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Resumen general del sistema de la Fiambrería San Agustín</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        <Card className="border-l-4 border-l-cyan-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Total de Productos</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{isLoading ? '...' : stats.totalProducts}</div>
              <p className="text-xs text-gray-500 mt-1">Tipos de productos únicos</p>
            </div>
            <Package className="h-8 w-8 text-cyan-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Valor del Inventario</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{isLoading ? '...' : `$${stats.inventoryValue.toLocaleString()}`}</div>
              <p className="text-xs text-gray-500 mt-1">Costo total del stock</p>
            </div>
            <TrendingUp className="h-8 w-8 text-yellow-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Ventas Hoy</CardTitle>
                            <div className="text-2xl font-bold text-gray-900">{isLoading ? '...' : `$${stats.ventasHoy.toLocaleString()}`}</div>
              <p className="text-xs text-gray-500 mt-1">Ingresos del día actual</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-green-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Tickets Generados</CardTitle>
                            <div className="text-2xl font-bold text-gray-900">{isLoading ? '...' : stats.ticketsHoy}</div>
              <p className="text-xs text-gray-500 mt-1">Tickets emitidos hoy</p>
            </div>
            <Receipt className="h-8 w-8 text-purple-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Lecturas Balanza</CardTitle>
                            <div className="text-2xl font-bold text-gray-900">{isLoading ? '...' : stats.lecturasBalanza}</div>
              <p className="text-xs text-gray-500 mt-1">Pesajes registrados</p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-500" />
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Actividad Reciente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Actividad Reciente
            </CardTitle>
            <CardDescription>Últimas transacciones y movimientos del sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                            {isLoading ? (
                <p className="text-sm text-gray-500">Cargando actividad...</p>
              ) : recentSales.length > 0 ? (
                recentSales.map(sale => (
                  <div key={sale.id} className="flex items-center">
                    <div className="flex-shrink-0 bg-green-100 rounded-full p-2">
                      <ShoppingCart className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="ml-4 flex-grow">
                      <p className="text-sm font-medium text-gray-900">
                        Venta a {sale.clientes?.nombre ?? 'Cliente General'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(sale.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        +${sale.monto_total.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No hay ventas recientes.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stock Bajo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Stock Bajo
            </CardTitle>
            <CardDescription>Productos que requieren reposición</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
                            {isLoading ? (
                <p className="text-sm text-gray-500">Cargando productos...</p>
              ) : lowStockProducts.length > 0 ? (
                lowStockProducts.map(product => (
                  <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                    <div>
                      <p className="font-medium text-gray-900">{product.nombre}</p>
                      <p className="text-sm text-red-600">Mínimo: {product.stock_minimo} {formatUnitText(product.unidad_medida, product.stock_minimo)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-700">{product.stock}</p>
                      <p className="text-xs text-red-600">{formatUnitText(product.unidad_medida, product.stock)} disponibles</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No hay productos con bajo stock.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
