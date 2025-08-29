"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Search, ShoppingCart, Eye, CalendarIcon, FileText, Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useAlert } from "@/components/AlertProvider"

// Interfaces para los datos
interface VentaProcesada {
    id: string;
    fecha: string;
    fechaDate: Date;
    cliente: string;
    items: number;
    total: number;
    estado: "completada" | "pendiente" | "cancelada";
    metodoPago: string;
}

interface DetalleVenta {
    nombre_producto: string;
    cantidad: number;
    unidad_medida: string; // La unidad en que se vendió
    precio_unitario: number; // El precio para la unidad en que se vendió
    subtotal: number;
    // Datos del producto original para referencia
    precio_base_producto: number;
    unidad_base_producto: string;
}

export default function VentasHechasPage() {
  const [sales, setSales] = useState<VentaProcesada[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterEstado, setFilterEstado] = useState<string>("todos")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const { showAlert } = useAlert();

  // Estados para el modal de detalles
  const [selectedVenta, setSelectedVenta] = useState<VentaProcesada | null>(null)
  const [detallesVenta, setDetallesVenta] = useState<DetalleVenta[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  useEffect(() => {
    const fetchVentas = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          id,
          created_at,
          monto_total,
          estado,
          metodo_pago,
          clientes ( nombre, apellido ),
          detalles_ventas ( id )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        showAlert('Error al cargar las ventas', 'error');
        console.error(error);
      } else {
        const ventasProcesadas: VentaProcesada[] = data.map((venta: any) => ({
            id: venta.id,
            fecha: format(new Date(venta.created_at), "dd/MM/yyyy HH:mm", { locale: es }),
            fechaDate: new Date(venta.created_at),
            cliente: venta.clientes ? `${venta.clientes.nombre} ${venta.clientes.apellido}` : "Cliente no disponible",
            items: venta.detalles_ventas.length,
            total: venta.monto_total,
            estado: venta.estado,
            metodoPago: venta.metodo_pago.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        }));
        setSales(ventasProcesadas);
      }
      setLoading(false);
    };

    fetchVentas();
  }, [showAlert]);

  // Efecto para cargar los detalles cuando se selecciona una venta
  useEffect(() => {
    const fetchDetallesVenta = async () => {
        if (!selectedVenta) return;

        setLoadingDetails(true);
        const { data, error } = await supabase
            .from('detalles_ventas')
            .select(`
                cantidad,
                unidad_medida,
                precio_unitario,
                subtotal,
                productos ( nombre, precio, unidad_medida )
            `)
            .eq('id_venta', selectedVenta.id);

        if (error) {
            showAlert('Error al cargar los detalles de la venta', 'error');
            console.error(error);
            setDetallesVenta([]);
        } else {
            const detallesProcesados: DetalleVenta[] = data.map((detalle: any) => ({
                nombre_producto: detalle.productos.nombre,
                cantidad: detalle.cantidad,
                unidad_medida: detalle.unidad_medida,
                precio_unitario: detalle.precio_unitario,
                subtotal: detalle.subtotal,
                precio_base_producto: detalle.productos.precio,
                unidad_base_producto: detalle.productos.unidad_medida,
            }));
            setDetallesVenta(detallesProcesados);
        }
        setLoadingDetails(false);
    };

    if (isDetailModalOpen) {
        fetchDetallesVenta();
    }
  }, [selectedVenta, isDetailModalOpen, showAlert]);

  const handleViewDetails = (venta: VentaProcesada) => {
    setSelectedVenta(venta);
    setIsDetailModalOpen(true);
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.cliente.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter = filterEstado === "todos" || sale.estado === filterEstado

    const matchesDate =
      !selectedDate ||
      (sale.fechaDate.getDate() === selectedDate.getDate() &&
        sale.fechaDate.getMonth() === selectedDate.getMonth() &&
        sale.fechaDate.getFullYear() === selectedDate.getFullYear())

    return matchesSearch && matchesFilter && matchesDate
  })

  const totalVentas = filteredSales.reduce((sum, sale) => sum + sale.total, 0)
  const ventasCompletadas = filteredSales.filter((sale) => sale.estado === "completada").length
  const ventasPendientes = filteredSales.filter((sale) => sale.estado === "pendiente").length

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    setIsCalendarOpen(false)
  }

  const clearDateFilter = () => {
    setSelectedDate(undefined)
  }

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Fiambrería San Agustín", href: "/dashboard" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Ventas Hechas" },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Ventas Hechas</h1>
        <p className="text-gray-600">Historial completo de todas las ventas realizadas</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Total Ventas</CardTitle>
              <div className="text-2xl font-bold text-gray-900">${totalVentas.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">{selectedDate ? "Del día seleccionado" : "Ingresos totales"}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-green-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Completadas</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{ventasCompletadas}</div>
              <p className="text-xs text-gray-500 mt-1">Ventas finalizadas</p>
            </div>
            <Badge className="bg-green-100 text-green-800">{ventasCompletadas}</Badge>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Pendientes</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{ventasPendientes}</div>
              <p className="text-xs text-gray-500 mt-1">Por completar</p>
            </div>
            <Badge className="bg-yellow-100 text-yellow-800">{ventasPendientes}</Badge>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Promedio</CardTitle>
              <div className="text-2xl font-bold text-gray-900">
                ${filteredSales.length > 0 ? Math.round(totalVentas / filteredSales.length).toLocaleString() : "0"}
              </div>
              <p className="text-xs text-gray-500 mt-1">Por venta</p>
            </div>
            <CalendarIcon className="h-8 w-8 text-purple-500" />
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Historial de Ventas
          </CardTitle>
          <CardDescription>
            Lista de todas las ventas realizadas
            {selectedDate && (
              <span className="ml-2 text-blue-600">
                - Filtrado por: {format(selectedDate, "dd/MM/yyyy", { locale: es })}
              </span>
            )}
          </CardDescription>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por ID o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="completada">Completadas</SelectItem>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="cancelada">Canceladas</SelectItem>
              </SelectContent>
            </Select>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: es }) : "Filtrar por fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} initialFocus locale={es} />
                {selectedDate && (
                  <div className="p-3 border-t">
                    <Button variant="outline" size="sm" onClick={clearDateFilter} className="w-full bg-transparent">
                      Limpiar filtro
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID Venta</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Método Pago</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    Cargando ventas...
                  </TableCell>
                </TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    {selectedDate
                      ? `No hay ventas para la fecha ${format(selectedDate, "dd/MM/yyyy", { locale: es })}`
                      : "No se encontraron ventas con los filtros aplicados"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono font-medium">{sale.id.substring(0, 8)}...</TableCell>
                    <TableCell>{sale.fecha}</TableCell>
                    <TableCell>{sale.cliente}</TableCell>
                    <TableCell>{sale.items} items</TableCell>
                    <TableCell className="font-semibold">${sale.total.toLocaleString()}</TableCell>
                    <TableCell>{sale.metodoPago}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          sale.estado === "completada"
                            ? "default"
                            : sale.estado === "pendiente"
                              ? "secondary"
                              : "destructive"
                        }
                        className={
                          sale.estado === "completada"
                            ? "bg-green-500 text-white"
                            : sale.estado === "pendiente"
                              ? "bg-yellow-500 text-white"
                              : "bg-red-500 text-white"
                        }
                      >
                        {sale.estado}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="icon" onClick={() => handleViewDetails(sale)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Detalles de Venta */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalles de la Venta</DialogTitle>
            <DialogDescription>
              Información completa de la venta y los productos incluidos.
            </DialogDescription>
          </DialogHeader>
          {loadingDetails ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : selectedVenta && (
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4 text-sm">
                    <div className="font-semibold col-span-1">ID Venta:</div>
                    <div className="col-span-3 font-mono">{selectedVenta.id}</div>
                    
                    <div className="font-semibold col-span-1">Cliente:</div>
                    <div className="col-span-3">{selectedVenta.cliente}</div>

                    <div className="font-semibold col-span-1">Fecha:</div>
                    <div className="col-span-3">{selectedVenta.fecha}</div>

                    <div className="font-semibold col-span-1">Método de Pago:</div>
                    <div className="col-span-3">{selectedVenta.metodoPago}</div>
                </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detallesVenta.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.nombre_producto}</TableCell>
                      <TableCell className="text-right">{item.cantidad}</TableCell>
                      <TableCell>{item.unidad_medida}</TableCell>
                      <TableCell className="text-right">
                        {
                          item.unidad_medida === 'gramos' 
                          ? `$${item.precio_base_producto.toLocaleString()} (kg)`
                          : `$${item.precio_unitario.toLocaleString()}`
                        }
                      </TableCell>
                      <TableCell className="text-right font-semibold">${item.subtotal.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end items-center pt-4 border-t mt-4">
                  <div className="text-xl font-bold">Total: ${selectedVenta.total.toLocaleString()}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
