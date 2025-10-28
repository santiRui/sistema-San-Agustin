"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useSession } from "@/components/SessionProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Search, ShoppingCart, Eye, CalendarIcon, FileText, Loader2, Trash2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useAlert } from "@/components/AlertProvider"
import { Checkbox } from "@/components/ui/checkbox"

// Interfaces para los datos
interface VentaProcesada {
    id: string;
    fecha: string;
    fechaDate: Date;
    cliente: string;
    items: number;
    total: number;
    estado: "completada" | "pendiente" | "cancelada";
    metodoPago: string; // texto para mostrar
    metodoPagoRaw: string; // valor crudo de BD (efectivo, transferencia, tarjeta_*, mixto)
    mixtoEfectivo?: number;
    mixtoTransferencia?: number;
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
  const { role } = useSession();
  const canDelete = role !== "empleado"; // administrador y encargado pueden eliminar

  const [searchTerm, setSearchTerm] = useState("")
  const [filterMedio, setFilterMedio] = useState<string>("todos")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined)
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const { showAlert } = useAlert();
  const [fromTime, setFromTime] = useState<string>("")
  const [toTime, setToTime] = useState<string>("")

  // Estados para el modal de detalles
  const [selectedVenta, setSelectedVenta] = useState<VentaProcesada | null>(null)
  const [detallesVenta, setDetallesVenta] = useState<DetalleVenta[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false)

  useEffect(() => {
    const fetchVentas = async () => {
      setLoading(true);
      try {
        // Intento 1: con columnas de mixto
        let data: any[] | null = null;
        let err1: any = null;
        const res1 = await supabase
          .from('ventas')
          .select(`
            id,
            created_at,
            monto_total,
            estado,
            metodo_pago,
            mixto_efectivo,
            mixto_transferencia,
            monto_efectivo,
            monto_transferencia,
            clientes ( nombre, apellido ),
            detalles_ventas ( id )
          `)
          .order('created_at', { ascending: false });
        data = res1.data as any[] | null;
        err1 = res1.error;

        if (err1) {
          // Intento 2: sin columnas mixto_* por compatibilidad
          const res2 = await supabase
            .from('ventas')
            .select(`
              id,
              created_at,
              monto_total,
              estado,
              metodo_pago,
              monto_efectivo,
              monto_transferencia,
              clientes ( nombre, apellido ),
              detalles_ventas ( id )
            `)
            .order('created_at', { ascending: false });
          data = res2.data as any[] | null;
          if (res2.error) {
            console.error('Error ventas (fallback):', res2.error);
            showAlert('Error al cargar las ventas (fallback)', 'error');
            setSales([]);
            setLoading(false);
            return;
          }
        }

        // Mapear resultados
        const ventasProcesadas: VentaProcesada[] = (data || []).map((venta: any) => {
          const raw = (venta.metodo_pago as string) || 'efectivo';
          const mixEf = Number(venta.mixto_efectivo ?? venta.monto_efectivo ?? 0);
          const mixTr = Number(venta.mixto_transferencia ?? venta.monto_transferencia ?? 0);
          const isMixtoByAmounts = mixEf > 0 || mixTr > 0;
          const rawNormalized = raw === 'mixto' ? 'mixto' : (isMixtoByAmounts ? 'mixto' : raw);
          const pretty = raw.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          const detalles = Array.isArray(venta.detalles_ventas)
            ? venta.detalles_ventas
            : (venta.detalles_ventas ? [venta.detalles_ventas] : []);
          return {
            id: venta.id,
            fecha: format(new Date(venta.created_at), "dd/MM/yyyy HH:mm", { locale: es }),
            fechaDate: new Date(venta.created_at),
            cliente: venta.clientes ? `${venta.clientes.nombre} ${venta.clientes.apellido}` : "Cliente no disponible",
            items: detalles.length,
            total: Number(venta.monto_total) || 0,
            estado: (venta.estado as any) || 'completada',
            metodoPago: rawNormalized.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
            metodoPagoRaw: rawNormalized,
            mixtoEfectivo: rawNormalized === 'mixto' ? mixEf : undefined,
            mixtoTransferencia: rawNormalized === 'mixto' ? mixTr : undefined,
          } as VentaProcesada;
        });
        setSales(ventasProcesadas);
      } catch (e: any) {
        console.error('Error ventas (fatal):', e?.message || e);
        showAlert(`Error al cargar las ventas: ${e?.message || 'desconocido'}`, 'error');
        setSales([]);
      } finally {
        setLoading(false);
      }
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

  const handleDeleteVenta = async (id: string) => {
    try {
      // Primero borrar detalles vinculados a la venta
      const { error: detErr } = await supabase.from('detalles_ventas').delete().eq('id_venta', id);
      if (detErr) throw detErr;

      // Luego borrar la venta
      const { error: ventaErr } = await supabase.from('ventas').delete().eq('id', id);
      if (ventaErr) throw ventaErr;

      // Actualizar estado local
      setSales((prev) => prev.filter((v) => v.id !== id));
      showAlert('Venta eliminada con éxito.', 'success');
    } catch (e: any) {
      console.error(e);
      showAlert('Error al eliminar la venta: ' + (e?.message || 'desconocido'), 'error');
    }
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const areAllFilteredSelected = (list: VentaProcesada[]) => {
    if (list.length === 0) return false;
    return list.every(s => selectedIds.has(s.id));
  };

  const toggleSelectAllFiltered = (list: VentaProcesada[], checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        list.forEach(s => next.add(s.id));
      } else {
        list.forEach(s => next.delete(s.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      // Borrar detalles de todas las ventas seleccionadas
      const { error: detErr } = await supabase
        .from('detalles_ventas')
        .delete()
        .in('id_venta', ids);
      if (detErr) throw detErr;

      // Borrar las ventas
      const { error: ventErr } = await supabase
        .from('ventas')
        .delete()
        .in('id', ids);
      if (ventErr) throw ventErr;

      // Actualizar estado local y limpiar selección
      setSales(prev => prev.filter(v => !selectedIds.has(v.id)));
      setSelectedIds(new Set());
      setIsBulkDialogOpen(false);
      showAlert(`Eliminadas ${ids.length} ventas.`, 'success');
    } catch (e: any) {
      console.error(e);
      showAlert('Error en borrado masivo: ' + (e?.message || 'desconocido'), 'error');
    }
  };

  const filteredSales = sales.filter((sale) => {
    const matchesSearch =
      sale.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.cliente.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter = filterMedio === "todos" || sale.metodoPagoRaw === filterMedio || (filterMedio === 'tarjeta' && sale.metodoPagoRaw?.startsWith('tarjeta'))

    const matchesDate =
      !selectedDate ||
      (sale.fechaDate.getDate() === selectedDate.getDate() &&
        sale.fechaDate.getMonth() === selectedDate.getMonth() &&
        sale.fechaDate.getFullYear() === selectedDate.getFullYear())

    // Filtro por rango horario dentro del día seleccionado
    let matchesTimeRange = true;
    if (selectedDate && (fromTime || toTime)) {
      const [fh, fm] = (fromTime || "00:00").split(":").map(Number);
      const [th, tm] = (toTime || "23:59").split(":").map(Number);
      const start = new Date(selectedDate);
      start.setHours(isNaN(fh) ? 0 : fh, isNaN(fm) ? 0 : fm, 0, 0);
      const end = new Date(selectedDate);
      end.setHours(isNaN(th) ? 23 : th, isNaN(tm) ? 59 : tm, 59, 999);
      // Si el rango es inválido, intercambiamos
      const startTime = start.getTime();
      const endTime = end.getTime();
      const sTime = sale.fechaDate.getTime();
      if (startTime <= endTime) {
        matchesTimeRange = sTime >= startTime && sTime <= endTime;
      } else {
        // Caso raro si desde > hasta: considerar que no coincide
        matchesTimeRange = false;
      }
    }

    return matchesSearch && matchesFilter && matchesDate && matchesTimeRange
  })

  // Fechas de referencia
  const now = new Date();
  const refDay = selectedDate ?? now;
  const monthRef = selectedMonth ?? now.getMonth();
  const yearRef = selectedYear ?? now.getFullYear();

  const esMismoDiaRef = (date: Date, ref: Date) =>
    date.getDate() === ref.getDate() &&
    date.getMonth() === ref.getMonth() &&
    date.getFullYear() === ref.getFullYear();

  const esMismoMesAnio = (date: Date, month: number, year: number) =>
    date.getMonth() === month && date.getFullYear() === year;

  // Ventas del día (solo completadas) respecto al día seleccionado u hoy
  const ventasDelDia = sales.filter(
    (sale) => sale.estado === "completada" && esMismoDiaRef(sale.fechaDate, refDay)
  );
  // Para el monto del día, si hay filtro horario activo, considerar solo ventas dentro del rango
  const estaDentroDelRangoHorario = (date: Date) => {
    if (!(selectedDate && (fromTime || toTime))) return true;
    const [fh, fm] = (fromTime || "00:00").split(":").map(Number);
    const [th, tm] = (toTime || "23:59").split(":").map(Number);
    const start = new Date(selectedDate);
    start.setHours(isNaN(fh) ? 0 : fh, isNaN(fm) ? 0 : fm, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(isNaN(th) ? 23 : th, isNaN(tm) ? 59 : tm, 59, 999);
    const startTime = start.getTime();
    const endTime = end.getTime();
    const t = date.getTime();
    if (startTime <= endTime) return t >= startTime && t <= endTime;
    return false;
  };
  const ventasDelDiaParaMonto = sales.filter(
    (sale) => sale.estado === "completada" && esMismoDiaRef(sale.fechaDate, refDay) && estaDentroDelRangoHorario(sale.fechaDate)
  );
  const montoVentasDelDia = ventasDelDiaParaMonto.reduce((sum, sale) => sum + sale.total, 0);
  const cantidadVentasDelDia = ventasDelDia.length;

  // Ventas del mes seleccionado (solo completadas)
  const ventasMesSeleccionado = sales.filter(
    (sale) => sale.estado === "completada" && esMismoMesAnio(sale.fechaDate, monthRef, yearRef)
  );
  const cantidadVentasDelMes = ventasMesSeleccionado.length;
  const montoVentasTotales = ventasMesSeleccionado.reduce((sum, sale) => sum + sale.total, 0);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    setIsCalendarOpen(false)
  }

  const clearDateFilter = () => {
    setSelectedDate(undefined)
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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

      {/* Barra de filtros superior: Día + Mes + Año + Limpiar mes */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-start sm:items-center">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full sm:w-auto min-w-[200px] justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? `Día: ${format(selectedDate, "dd/MM/yyyy", { locale: es })}` : `Día: ${format(now, "dd/MM/yyyy", { locale: es })}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} initialFocus locale={es} />
          </PopoverContent>
        </Popover>

        <Select value={String((selectedMonth ?? now.getMonth()))} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-auto min-w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Enero</SelectItem>
            <SelectItem value="1">Febrero</SelectItem>
            <SelectItem value="2">Marzo</SelectItem>
            <SelectItem value="3">Abril</SelectItem>
            <SelectItem value="4">Mayo</SelectItem>
            <SelectItem value="5">Junio</SelectItem>
            <SelectItem value="6">Julio</SelectItem>
            <SelectItem value="7">Agosto</SelectItem>
            <SelectItem value="8">Septiembre</SelectItem>
            <SelectItem value="9">Octubre</SelectItem>
            <SelectItem value="10">Noviembre</SelectItem>
            <SelectItem value="11">Diciembre</SelectItem>
          </SelectContent>
        </Select>

        <Select value={String((selectedYear ?? now.getFullYear()))} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-auto min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }).map((_, i) => {
              const y = now.getFullYear() - 2 + i;
              return (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setSelectedMonth(undefined); setSelectedYear(undefined); }}>
          Limpiar mes
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Azul: Monto ventas del día */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-blue-600">Ventas del Día</CardTitle>
              <div className="text-2xl font-bold text-gray-900">${montoVentasDelDia.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">Monto de ventas completadas {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: es }) : "hoy"}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-blue-500" />
          </CardHeader>
        </Card>

        {/* Verde: Monto ventas totales del mes seleccionado */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-green-600">Ventas Totales</CardTitle>
              <div className="text-2xl font-bold text-gray-900">${montoVentasTotales.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">Monto total del mes de {format(new Date(yearRef, monthRef, 1), "MMMM yyyy", { locale: es })}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-green-500" />
          </CardHeader>
        </Card>

        {/* Marrón: Cantidad ventas del día */}
        <Card className="border-l-4" style={{ borderLeftColor: '#a0522d' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium" style={{ color: '#a0522d' }}>Ventas Hoy</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{cantidadVentasDelDia}</div>
              <p className="text-xs text-gray-500 mt-1">Cantidad de ventas completadas {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: es }) : "hoy"}</p>
            </div>
            <Badge style={{ backgroundColor: '#f4e1d2', color: '#a0522d' }}>{cantidadVentasDelDia}</Badge>
          </CardHeader>
        </Card>

        {/* Morado: Cantidad ventas del mes seleccionado */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-purple-600">Ventas del Mes</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{cantidadVentasDelMes}</div>
              <p className="text-xs text-gray-500 mt-1">Ventas completadas en {format(new Date(yearRef, monthRef, 1), "MMMM yyyy", { locale: es })}</p>
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por ID o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:max-w-sm"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Select value={filterMedio} onValueChange={setFilterMedio}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filtrar por medio de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los medios</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mixto">Mixto</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Input
                type="time"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
                className="w-full sm:w-[140px]"
                placeholder="Desde"
              />
              <Input
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
                className="w-full sm:w-[140px]"
                placeholder="Hasta"
              />
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setFromTime(""); setToTime(""); }}>
                Limpiar horas
              </Button>
            </div>
            {canDelete && selectedIds.size > 0 && (
              <div className="sm:ml-auto">
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={() => setIsBulkDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Eliminar seleccionadas ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canDelete && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={areAllFilteredSelected(filteredSales)}
                        onCheckedChange={(v) => toggleSelectAllFiltered(filteredSales, Boolean(v))}
                        aria-label="Seleccionar todo"
                      />
                    </TableHead>
                  )}
                  <TableHead className="min-w-[100px]">ID Venta</TableHead>
                  <TableHead className="min-w-[120px]">Fecha</TableHead>
                  <TableHead className="min-w-[120px]">Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Items</TableHead>
                  <TableHead className="min-w-[100px]">Total</TableHead>
                  <TableHead className="hidden md:table-cell">Método Pago</TableHead>
                  <TableHead className="min-w-[80px]">Estado</TableHead>
                  <TableHead className="min-w-[120px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 9 : 8} className="text-center py-8 text-gray-500">
                    Cargando ventas...
                  </TableCell>
                </TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canDelete ? 9 : 8} className="text-center py-8 text-gray-500">
                    {selectedDate
                      ? `No hay ventas para la fecha ${format(selectedDate, "dd/MM/yyyy", { locale: es })}`
                      : "No se encontraron ventas con los filtros aplicados"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    {canDelete && (
                      <TableCell className="w-[40px]">
                        <Checkbox
                          checked={selectedIds.has(sale.id)}
                          onCheckedChange={(v) => toggleSelectOne(sale.id, Boolean(v))}
                          aria-label={`Seleccionar venta ${sale.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono font-medium text-xs sm:text-sm">{sale.id.substring(0, 8)}...</TableCell>
                    <TableCell className="text-xs sm:text-sm">{sale.fecha}</TableCell>
                    <TableCell className="truncate max-w-[120px]">{sale.cliente}</TableCell>
                    <TableCell className="hidden sm:table-cell">{sale.items} items</TableCell>
                    <TableCell className="font-semibold">${sale.total.toLocaleString()}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {sale.metodoPagoRaw === 'mixto' ? (
                        <div>
                          <div className="font-medium">Mixto</div>
                          <div className="text-xs text-gray-600">
                            ${ (sale.mixtoEfectivo ?? 0).toLocaleString() } efectivo + ${ (sale.mixtoTransferencia ?? 0).toLocaleString() } transferencia
                          </div>
                        </div>
                      ) : (
                        sale.metodoPago
                      )}
                    </TableCell>
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
                        <span className="hidden sm:inline">{sale.estado}</span>
                        <span className="sm:hidden">{sale.estado.charAt(0).toUpperCase()}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(sale)} className="w-full sm:w-auto">
                          <Eye className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">Ver</span>
                        </Button>
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="w-full sm:w-auto text-red-600 border-red-200 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" />
                                <span className="hidden sm:inline ml-1">Eliminar</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar venta</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción eliminará permanentemente la venta seleccionada y sus detalles asociados. No se puede deshacer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteVenta(sale.id)} className="bg-red-600 hover:bg-red-700">
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {canDelete && (
        <AlertDialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar ventas seleccionadas</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminarán {selectedIds.size} ventas y sus detalles asociados. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                Eliminar todo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Modal de Detalles de Venta */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Detalles de la Venta</DialogTitle>
            <DialogDescription className="text-sm">
              Información completa de la venta y los productos incluidos.
            </DialogDescription>
          </DialogHeader>
          {loadingDetails ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : selectedVenta && (
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4 text-sm">
                    <div className="font-semibold">ID Venta:</div>
                    <div className="sm:col-span-3 font-mono text-xs sm:text-sm break-all">{selectedVenta.id}</div>
                    
                    <div className="font-semibold">Cliente:</div>
                    <div className="sm:col-span-3 break-words">{selectedVenta.cliente}</div>

                    <div className="font-semibold">Fecha:</div>
                    <div className="sm:col-span-3">{selectedVenta.fecha}</div>

                    <div className="font-semibold">Método de Pago:</div>
                    <div className="sm:col-span-3">
                      {selectedVenta.metodoPagoRaw === 'mixto' ? (
                        <div>
                          <div className="font-medium">Mixto</div>
                          <div className="text-xs text-gray-600">
                            ${ (selectedVenta.mixtoEfectivo ?? 0).toLocaleString() } efectivo + ${ (selectedVenta.mixtoTransferencia ?? 0).toLocaleString() } transferencia
                          </div>
                        </div>
                      ) : (
                        selectedVenta.metodoPago
                      )}
                    </div>
                </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Producto</TableHead>
                      <TableHead className="text-right min-w-[80px]">Cantidad</TableHead>
                      <TableHead className="hidden sm:table-cell">Unidad</TableHead>
                      <TableHead className="text-right min-w-[100px]">Precio Unit.</TableHead>
                      <TableHead className="text-right min-w-[100px]">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detallesVenta.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="truncate max-w-[120px]">{item.nombre_producto}</TableCell>
                        <TableCell className="text-right">{item.cantidad}</TableCell>
                        <TableCell className="hidden sm:table-cell">{item.unidad_medida}</TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">
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
              </div>
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
