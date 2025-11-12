"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Search, Receipt, Eye, Download, Printer, CalendarIcon, FileText } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"

interface Ticket {
  id: string
  numero: string
  fecha: string
  fechaDate: Date
  cliente: string
  ventaId: string
  total: number
  estado: "emitido" | "impreso" | "enviado"
  items: {
    producto: string
    cantidad: number
    precio: number
    subtotal: number
  }[]
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterEstado, setFilterEstado] = useState<string>("todos")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)

  useEffect(() => {
    const fetchTickets = async () => {
      const { data: ticketsData, error } = await supabase
        .from('tickets')
        .select(`*, venta:ventas(*, cliente:clientes(*), detalles_ventas(*, producto:productos(*)))`)
        .order('fecha_impresion', { ascending: false });
      if (!error && ticketsData) {
        const mappedTickets = ticketsData.map((ticket: any) => ({
          id: ticket.id,
          numero: ticket.numero_ticket ?? '',
          fecha: ticket.fecha_impresion ?? '',
          fechaDate: ticket.fecha_impresion ? new Date(ticket.fecha_impresion) : new Date(),
          cliente: ticket.venta?.cliente?.nombre
            ? `${ticket.venta.cliente.nombre} ${ticket.venta.cliente.apellido ?? ''}`.trim()
            : '',
          ventaId: ticket.id_venta ?? '',
          total: ticket.venta?.monto_total ?? 0,
          estado: ticket.estado,
          items: Array.isArray(ticket.venta?.detalles_ventas)
            ? ticket.venta.detalles_ventas.map((item: any) => ({
                producto: item.producto?.nombre ?? '',
                cantidad: item.cantidad ?? 0,
                precio: item.precio_unitario ?? 0,
                subtotal: item.subtotal ?? 0,
              }))
            : [],
        }));
        setTickets(mappedTickets);
      } else {
        setTickets([]);
        console.error('Error al obtener tickets:', error);
      }
    };
    fetchTickets();
  }, []);

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      (ticket.numero?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
      (ticket.cliente?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
      (ticket.ventaId?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())

    const matchesFilter = filterEstado === "todos" || ticket.estado === filterEstado

    const matchesDate =
      !selectedDate ||
      (ticket.fechaDate?.getDate() === selectedDate.getDate() &&
        ticket.fechaDate?.getMonth() === selectedDate.getMonth() &&
        ticket.fechaDate?.getFullYear() === selectedDate.getFullYear())

    return matchesSearch && matchesFilter && matchesDate
  })

  const ticketsEmitidos = filteredTickets.filter((t) => t.estado === "emitido").length
  const ticketsImpresos = filteredTickets.filter((t) => t.estado === "impreso").length
  const ticketsEnviados = filteredTickets.filter((t) => t.estado === "enviado").length
  const totalTickets = filteredTickets.length

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    setIsCalendarOpen(false)
  }

  const clearDateFilter = () => {
    setSelectedDate(undefined)
  }

  // Función para descargar ticket como archivo de texto plano
  const handleDownloadTicket = (ticket: Ticket) => {
    const ticketText = `Ticket N°: ${ticket.numero}\nFecha: ${ticket.fecha}\nCliente: ${ticket.cliente}\nEstado: ${ticket.estado}\n-------------------------\n${ticket.items.map(item => `${item.producto}  x${item.cantidad}  $${item.precio.toFixed(2)}  Subtotal: $${item.subtotal.toFixed(2)}`).join('\n')}\n-------------------------\nTOTAL: $${ticket.total.toFixed(2)}\n`;
    const blob = new Blob([ticketText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket_${ticket.numero}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Función para imprimir ticket en ticketera térmica (impresión web)
  const handlePrintTicket = (ticket: Ticket) => {
    const ticketText = `Ticket N°: ${ticket.numero}\nFecha: ${ticket.fecha}\nCliente: ${ticket.cliente}\nEstado: ${ticket.estado}\n-------------------------\n${ticket.items.map(item => `${item.producto}  x${item.cantidad}  $${item.precio.toFixed(2)}  Subtotal: $${item.subtotal.toFixed(2)}`).join('\n')}\n-------------------------\nTOTAL: $${ticket.total.toFixed(2)}\n`;
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(`<pre style='font-size:14px;'>${ticketText}</pre>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    } else {
      alert('No se pudo abrir la ventana de impresión. Por favor, desbloquee los pop-ups en su navegador.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Fiambrería San Agustín", href: "/dashboard" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Tickets" },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tickets</h1>
        <p className="text-gray-600">Gestión de tickets y comprobantes de venta</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Total Tickets</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{totalTickets}</div>
              <p className="text-xs text-gray-500 mt-1">
                {selectedDate ? "Del día seleccionado" : "Tickets generados"}
              </p>
            </div>
            <Receipt className="h-8 w-8 text-blue-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Emitidos</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{ticketsEmitidos}</div>
              <p className="text-xs text-gray-500 mt-1">Pendientes de impresión</p>
            </div>
            <Badge className="bg-yellow-100 text-yellow-800">{ticketsEmitidos}</Badge>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Impresos</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{ticketsImpresos}</div>
              <p className="text-xs text-gray-500 mt-1">Tickets impresos</p>
            </div>
            <Badge className="bg-blue-100 text-blue-800">{ticketsImpresos}</Badge>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Enviados</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{ticketsEnviados}</div>
              <p className="text-xs text-gray-500 mt-1">Tickets entregados</p>
            </div>
            <Badge className="bg-green-100 text-green-800">{ticketsEnviados}</Badge>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Lista de Tickets
          </CardTitle>
          <CardDescription>
            Historial de todos los tickets generados
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
                placeholder="Buscar tickets..."
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
                <SelectItem value="emitido">Emitidos</SelectItem>
                <SelectItem value="impreso">Impresos</SelectItem>
                <SelectItem value="enviado">Enviados</SelectItem>
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
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                    {selectedDate
                      ? `No hay tickets para la fecha ${format(selectedDate, "dd/MM/yyyy", { locale: es })}`
                      : "No se encontraron tickets con los filtros aplicados"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono font-medium">{ticket.numero}</TableCell>
                    <TableCell>{ticket.fecha}</TableCell>
                    <TableCell>{ticket.cliente}</TableCell>
                    <TableCell className="font-mono">{ticket.ventaId}</TableCell>
                    <TableCell className="font-semibold">${ticket.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ticket.estado === "enviado"
                            ? "default"
                            : ticket.estado === "impreso"
                              ? "secondary"
                              : "outline"
                        }
                        className={
                          ticket.estado === "enviado"
                            ? "bg-green-500 text-white"
                            : ticket.estado === "impreso"
                              ? "bg-blue-500 text-white"
                              : "bg-yellow-500 text-white"
                        }
                      >
                        {ticket.estado}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => setSelectedTicket(ticket)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Ticket {selectedTicket?.numero}</DialogTitle>
                              <DialogDescription>Detalle del comprobante de venta</DialogDescription>
                            </DialogHeader>
                            {selectedTicket && (
                              <div className="space-y-4">
                                <div className="text-center border-b pb-4">
                                  <h3 className="font-bold text-lg">Fiambrería San Agustín</h3>
                                  <p className="text-sm text-gray-600">Ticket: {selectedTicket.numero}</p>
                                  <p className="text-sm text-gray-600">{selectedTicket.fecha}</p>
                                </div>

                                <div>
                                  <p className="font-medium">Cliente: {selectedTicket.cliente}</p>
                                  <p className="text-sm text-gray-600">Venta: {selectedTicket.ventaId}</p>
                                </div>

                                <div className="space-y-2">
                                  <h4 className="font-medium">Productos:</h4>
                                  {selectedTicket.items.map((item, index) => (
                                    <div key={index} className="flex justify-between text-sm">
                                      <div>
                                        <p>{item.producto}</p>
                                        <p className="text-gray-600">
                                          {item.cantidad}kg x ${item.precio}
                                        </p>
                                      </div>
                                      <p className="font-medium">${item.subtotal.toLocaleString()}</p>
                                    </div>
                                  ))}
                                </div>

                                <div className="border-t pt-4">
                                  <div className="flex justify-between font-bold text-lg">
                                    <span>Total:</span>
                                    <span>${selectedTicket.total.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handlePrintTicket(ticket)}
                          disabled={ticket.estado === "impreso"}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>

                        <Button variant="outline" size="icon" onClick={() => handleDownloadTicket(ticket)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
