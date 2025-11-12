"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { Search, CalendarIcon, ShoppingCart, Trash2 } from "lucide-react"
import { useSession } from "@/components/SessionProvider"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useAlert } from "@/components/AlertProvider"

interface SalidaProcesada {
  id: string;
  fecha: string;
  fechaDate: Date;
  proveedor: string;
  numero_factura: string;
  items: number;
  total: number; // monto positivo en BD, se muestra como negativo en UI
}

export default function SalidasPage() {
  const [salidas, setSalidas] = useState<SalidaProcesada[]>([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined)
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const { showAlert } = useAlert()
  const { role } = useSession()
  const canDelete = role === 'administrador'

  useEffect(() => {
    const fetchSalidas = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('salidas')
        .select(`
          id,
          created_at,
          numero_factura,
          total,
          proveedores ( nombre ),
          detalles_salidas ( id )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error(error)
        showAlert('Error al cargar salidas', 'error')
      } else {
        const procesadas: SalidaProcesada[] = (data as any[]).map((s) => ({
          id: s.id,
          fecha: format(new Date(s.created_at), "dd/MM/yyyy HH:mm", { locale: es }),
          fechaDate: new Date(s.created_at),
          proveedor: s.proveedores?.nombre || 'Proveedor',
          numero_factura: s.numero_factura,
          items: s.detalles_salidas?.length || 0,
          total: s.total || 0,
        }))
        setSalidas(procesadas)
      }
      setLoading(false)
    }
    fetchSalidas()
  }, [showAlert])

  const handleDeleteSalida = async (id: string) => {
    try {
      // Revertir stock de cada detalle
      const { data: detalles, error: detFetchErr } = await supabase
        .from('detalles_salidas')
        .select('id_producto,cantidad')
        .eq('id_salida', id)
      if (detFetchErr) throw detFetchErr
      if (Array.isArray(detalles)) {
        for (const d of detalles as any[]) {
          const prodId = d.id_producto
          const cant = Number(d.cantidad) || 0
          // leer stock actual y restar cantidad
          const { data: prod, error: prodErr } = await supabase.from('productos').select('stock').eq('id', prodId).single()
          if (prodErr) throw prodErr
          const newStock = (Number(prod?.stock) || 0) - cant
          const { error: updErr } = await supabase.from('productos').update({ stock: newStock }).eq('id', prodId)
          if (updErr) throw updErr
        }
      }

      const { error: detErr } = await supabase.from('detalles_salidas').delete().eq('id_salida', id)
      if (detErr) throw detErr
      const { error: salErr } = await supabase.from('salidas').delete().eq('id', id)
      if (salErr) throw salErr
      setSalidas(prev => prev.filter(s => s.id !== id))
      showAlert('Salida eliminada con éxito.', 'success')
    } catch (e: any) {
      console.error(e)
      showAlert('Error al eliminar la salida: ' + (e?.message || 'desconocido'), 'error')
    }
  }

  // Filtro tabla por día
  const filtered = salidas.filter((s) => {
    const matchesSearch =
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.proveedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.numero_factura || '').toLowerCase().includes(searchTerm.toLowerCase())

    const matchesDate =
      !selectedDate ||
      (s.fechaDate.getDate() === selectedDate.getDate() &&
        s.fechaDate.getMonth() === selectedDate.getMonth() &&
        s.fechaDate.getFullYear() === selectedDate.getFullYear())

    return matchesSearch && matchesDate
  })

  // Fechas de referencia (KPIs)
  const now = new Date()
  const refDay = selectedDate ?? now
  const monthRef = selectedMonth ?? now.getMonth()
  const yearRef = selectedYear ?? now.getFullYear()

  const esMismoDiaRef = (date: Date, ref: Date) =>
    date.getDate() === ref.getDate() &&
    date.getMonth() === ref.getMonth() &&
    date.getFullYear() === ref.getFullYear()
  const esMismoMesAnio = (date: Date, m: number, y: number) =>
    date.getMonth() === m && date.getFullYear() === y

  // KPIs (monto mostrado como negativo)
  const salidasDelDia = salidas.filter(s => esMismoDiaRef(s.fechaDate, refDay))
  const montoSalidasDelDia = salidasDelDia.reduce((sum, s) => sum + s.total, 0)
  const cantidadSalidasDelDia = salidasDelDia.length

  const salidasDelMes = salidas.filter(s => esMismoMesAnio(s.fechaDate, monthRef, yearRef))
  const cantidadSalidasDelMes = salidasDelMes.length
  const montoSalidasDelMes = salidasDelMes.reduce((sum, s) => sum + s.total, 0)

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    setIsCalendarOpen(false)
  }

  const currencyNeg = (n: number) => `-$${Math.abs(n).toLocaleString()}`

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <BreadcrumbNav
        items={[{ label: 'Fiambrería San Agustín', href: '/dashboard' }, { label: 'Dashboard', href: '/dashboard' }, { label: 'Salidas' }]}
      />

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Salidas</h1>
        <p className="text-gray-600">Facturas de proveedores y egresos</p>
      </div>

      {/* Barra superior */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-start sm:items-center">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full sm:w-auto min-w-[200px] justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}> 
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? `Día: ${format(selectedDate, 'dd/MM/yyyy', { locale: es })}` : `Día: ${format(now, 'dd/MM/yyyy', { locale: es })}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} initialFocus locale={es} />
          </PopoverContent>
        </Popover>

        <Select value={String(monthRef)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-auto min-w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
              <SelectItem key={i} value={String(i)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(yearRef)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-auto min-w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }).map((_, i) => {
              const y = now.getFullYear() - 2 + i
              return <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            })}
          </SelectContent>
        </Select>

        <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setSelectedMonth(undefined); setSelectedYear(undefined); }}>Limpiar mes</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-blue-600">Salidas del Día</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{currencyNeg(montoSalidasDelDia)}</div>
              <p className="text-xs text-gray-500 mt-1">Monto de salidas {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: es }) : 'hoy'}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-blue-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-green-600">Salidas Totales</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{currencyNeg(montoSalidasDelMes)}</div>
              <p className="text-xs text-gray-500 mt-1">Monto total de {format(new Date(yearRef, monthRef, 1), 'MMMM yyyy', { locale: es })}</p>
            </div>
            <ShoppingCart className="h-8 w-8 text-green-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4" style={{ borderLeftColor: '#a0522d' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium" style={{ color: '#a0522d' }}>Salidas Hoy</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{cantidadSalidasDelDia}</div>
              <p className="text-xs text-gray-500 mt-1">Cantidad de salidas {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: es }) : 'hoy'}</p>
            </div>
            <Badge style={{ backgroundColor: '#f4e1d2', color: '#a0522d' }}>{cantidadSalidasDelDia}</Badge>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-purple-600">Salidas del Mes</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{cantidadSalidasDelMes}</div>
              <p className="text-xs text-gray-500 mt-1">Salidas en {format(new Date(yearRef, monthRef, 1), 'MMMM yyyy', { locale: es })}</p>
            </div>
            <CalendarIcon className="h-8 w-8 text-purple-500" />
          </CardHeader>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Historial de Salidas</CardTitle>
          <CardDescription>
            Lista de facturas de proveedores
            {selectedDate && (
              <span className="ml-2 text-blue-600">- Filtrado por: {format(selectedDate, 'dd/MM/yyyy', { locale: es })}</span>
            )}
          </CardDescription>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Search className="h-4 w-4 text-gray-400" />
              <Input placeholder="Buscar por ID, proveedor o factura..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:max-w-sm" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">ID</TableHead>
                  <TableHead className="min-w-[120px]">Fecha</TableHead>
                  <TableHead className="min-w-[140px]">Proveedor</TableHead>
                  <TableHead className="min-w-[120px]">Nro Factura</TableHead>
                  <TableHead className="hidden sm:table-cell">Items</TableHead>
                  <TableHead className="min-w-[100px]">Total</TableHead>
                  {canDelete && (<TableHead className="min-w-[120px]">Acciones</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">Cargando salidas...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                      {selectedDate ? `No hay salidas para la fecha ${format(selectedDate, 'dd/MM/yyyy', { locale: es })}` : 'No se encontraron salidas con los filtros aplicados'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">{s.id.substring(0, 8)}...</TableCell>
                      <TableCell className="text-xs sm:text-sm">{s.fecha}</TableCell>
                      <TableCell className="truncate max-w-[160px]">{s.proveedor}</TableCell>
                      <TableCell className="font-mono">{s.numero_factura}</TableCell>
                      <TableCell className="hidden sm:table-cell">{s.items}</TableCell>
                      <TableCell className="font-semibold">{currencyNeg(s.total)}</TableCell>
                      {canDelete && (
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                                <Trash2 className="h-4 w-4" />
                                <span className="hidden sm:inline ml-1">Eliminar</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar salida</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción eliminará permanentemente la salida y sus detalles asociados. No se puede deshacer.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSalida(s.id)} className="bg-red-600 hover:bg-red-700">
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
