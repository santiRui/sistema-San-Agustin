"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, ShoppingCart, Calculator } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { supabase } from "@/lib/supabaseClient"
import { useAlert } from "@/components/AlertProvider"

interface VentaItem {
  id: string
  producto_id: string
  nombre: string
  precio: number
  cantidad: number
  unidad_medida: string
  subtotal: number
}

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  codigo: string;
  stock: number;
  unidad_medida: 'kg' | 'gramos' | 'unidades';
}

interface Cliente {
  id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export default function RealizarVentaPage() {
  const router = useRouter();
  const { showAlert } = useAlert();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState("");
  const [items, setItems] = useState<VentaItem[]>([]);
  
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string | null>(null);
  const [unidadMedida, setUnidadMedida] = useState<'kg' | 'gramos' | 'unidades'>("unidades");
  const [cantidad, setCantidad] = useState("");

  const selectedProduct = productos.find(p => p.id === productoSeleccionadoId);

  useEffect(() => {
    const fetchData = async () => {
      const { data: productosData, error: productosError } = await supabase.from('productos').select('*');
      if (productosError) showAlert('Error al cargar productos', 'error');
      else setProductos(productosData as Producto[] || []);

      const { data: clientesData, error: clientesError } = await supabase.from('clientes').select('*');
      if (clientesError) showAlert('Error al cargar clientes', 'error');
      else setClientes(clientesData || []);
    }
    fetchData();
  }, [showAlert]);

  useEffect(() => {
    if (selectedProduct) {
      const baseUnit = selectedProduct.unidad_medida;
      // Si la unidad base es para items no pesables, la unidad por defecto es 'unidades'
      if (['unidades', 'unidad'].includes(baseUnit)) {
        setUnidadMedida('unidades');
      } else { 
        setUnidadMedida('kg');
      }
      setCantidad("");
    }
  }, [selectedProduct]);

  const agregarItem = () => {
    if (!productoSeleccionadoId || !cantidad || !unidadMedida || !selectedProduct) {
      showAlert('Por favor, complete todos los campos del producto.', 'error');
      return;
    }

    const producto = selectedProduct;
    const cantidadNum = Number.parseFloat(cantidad);

    if (cantidadNum <= 0) {
        showAlert('La cantidad debe ser mayor que cero.', 'error');
        return;
    }

    const baseUnitIsKg = ['kg', 'kilogramo'].includes(producto.unidad_medida);

    let cantidadEnUnidadBase = cantidadNum;
    if (baseUnitIsKg && unidadMedida === 'gramos') {
      cantidadEnUnidadBase = cantidadNum / 1000;
    } else if (producto.unidad_medida === 'gramos' && unidadMedida === 'kg') {
      cantidadEnUnidadBase = cantidadNum * 1000;
    }

    const cantidadEnCarrito = items
      .filter(item => item.producto_id === producto.id)
      .reduce((acc, item) => {
        if (baseUnitIsKg && item.unidad_medida === 'gramos') {
          return acc + (item.cantidad / 1000);
        } else if (producto.unidad_medida === 'gramos' && item.unidad_medida === 'kg') {
            return acc + (item.cantidad * 1000);
        }
        return acc + item.cantidad;
      }, 0);

    if (cantidadEnUnidadBase + cantidadEnCarrito > producto.stock) {
      showAlert(`Stock insuficiente. Disponible: ${producto.stock} ${producto.unidad_medida}. En carrito: ${cantidadEnCarrito} ${producto.unidad_medida}`, 'error');
      return;
    }

    let precioCalculado = producto.precio;
    if (baseUnitIsKg && unidadMedida === 'gramos') {
      precioCalculado = producto.precio / 1000;
    } else if (producto.unidad_medida === 'gramos' && unidadMedida === 'kg') {
      precioCalculado = producto.precio * 1000;
    }

    const subtotal = precioCalculado * cantidadNum;

    const nuevoItem: VentaItem = {
      id: Date.now().toString(), 
      producto_id: producto.id,
      nombre: producto.nombre,
      precio: precioCalculado,
      cantidad: cantidadNum,
      unidad_medida: unidadMedida,
      subtotal: subtotal,
    };

    setItems([...items, nuevoItem]);
    setProductoSeleccionadoId(null);
    setUnidadMedida('unidades');
    setCantidad('');
  };

  const eliminarItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id))
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  const procesarVenta = async () => {
    if (!clienteId || !metodoPago || items.length === 0) {
      showAlert("Por favor completa todos los campos requeridos", 'error');
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError || !userData?.user) {
        showAlert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.', 'error');
        return;
      }
      const user = userData.user;

      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert({
          id_cliente: clienteId,
          id_usuario: user.id,
          monto_total: total,
          metodo_pago: metodoPago,
          estado: 'completada',
        })
        .select('id')
        .single();

      if (ventaError) throw ventaError;
      if (!ventaData) throw new Error("No se pudo crear la venta.");
      const ventaId = ventaData.id;

      if (items.some(item => item.cantidad <= 0)) {
        throw new Error("No se puede procesar una venta con productos de cantidad cero o negativa.");
      }

      const detallesVenta = items.map(item => {
        let unidad = item.unidad_medida;
        if (unidad === 'kilogramo') {
          unidad = 'kg';
        } else if (unidad !== 'kg' && unidad !== 'gramos') {
          unidad = 'unidades';
        }

        return {
          id_venta: ventaId,
          id_producto: item.producto_id,
          cantidad: item.cantidad,
          unidad_medida: unidad,
          precio_unitario: item.precio,
          subtotal: item.subtotal,
        };
      });

      const { error: detallesError } = await supabase.from('detalles_ventas').insert(detallesVenta);

      if (detallesError) {
        await supabase.from('ventas').delete().eq('id', ventaId); 
        throw detallesError;
      }

      for (const item of items) {
        const producto = productos.find(p => p.id === item.producto_id);
        if (!producto) continue;

        let cantidadVendidaEnUnidadBase = item.cantidad;
        const baseUnitIsKg = ['kg', 'kilogramo'].includes(producto.unidad_medida);
        if (baseUnitIsKg && item.unidad_medida === 'gramos') {
          cantidadVendidaEnUnidadBase = item.cantidad / 1000;
        } else if (producto.unidad_medida === 'gramos' && item.unidad_medida === 'kg') {
          cantidadVendidaEnUnidadBase = item.cantidad * 1000;
        }

        const nuevoStock = producto.stock - cantidadVendidaEnUnidadBase;
        const { error: stockError } = await supabase
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', item.producto_id);

        if (stockError) {
            showAlert(`Error al actualizar el stock para ${item.nombre}. La venta se registró pero el stock puede ser inconsistente.`, 'error');
        }
      }

      // --- CREAR TICKET AUTOMÁTICO ---
      console.log('ventaId:', ventaId);
      // Asegurarse que id_venta es int8 (número), no string/uuid
      // Buscar el id numérico de la venta recién creada
      const { data: ventaBuscada, error: ventaBuscaError } = await supabase
        .from('ventas')
        .select('id')
        .eq('id', ventaId)
        .single();
      let idVentaTicket = ventaId;
      if (ventaBuscada && ventaBuscada.id) {
        idVentaTicket = ventaBuscada.id;
      }
      // Obtener el número de ticket correlativo
      const { data: maxTicket, error: maxTicketError } = await supabase
        .from('tickets')
        .select('numero_ticket')
        .order('numero_ticket', { ascending: false })
        .limit(1)
        .single();
      let nuevoNumeroTicket = 1;
      if (maxTicket && maxTicket.numero_ticket) {
        nuevoNumeroTicket = Number(maxTicket.numero_ticket) + 1;
      }
      console.log('Insertando ticket:', {
        id_venta: idVentaTicket,
        numero_ticket: nuevoNumeroTicket,
        fecha_impresion: new Date().toISOString(),
        id_usuario: user.id,
        estado: 'emitido',
      });
      // Usar valor correcto para el enum de estado
      const estadoTicket = 'emitido'; // Cambia aquí si el enum es diferente
      // Insertar ticket
      const { error: ticketError } = await supabase.from('tickets').insert({
        id_venta: idVentaTicket,
        numero_ticket: nuevoNumeroTicket,
        fecha_impresion: new Date().toISOString(),
        id_usuario: user.id,
        estado: estadoTicket,
      });
      if (ticketError) {
        showAlert('Error al generar el ticket: ' + ticketError.message, 'error');
        console.error('Error al insertar ticket:', ticketError);
      }

      showAlert('Venta procesada exitosamente', 'success');
      router.push('/dashboard/ventas');

    } catch (error: any) {
      showAlert(error.message || 'Ocurrió un error al procesar la venta.', 'error');
    }
  };

  const selectedCliente = clientes.find(c => c.id === clienteId);

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Ventas", href: "/dashboard/ventas" },
          { label: "Nueva Venta" },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Realizar Venta</h1>
        <p className="text-gray-600">Crear una nueva transacción de venta</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información de la Venta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cliente">Cliente</Label>
                  <Select value={clienteId || ''} onValueChange={setClienteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((clienteItem) => (
                        <SelectItem key={clienteItem.id} value={clienteItem.id}>
                          {clienteItem.nombre} {clienteItem.apellido}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="metodoPago">Método de Pago</Label>
                  <Select value={metodoPago} onValueChange={setMetodoPago}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="tarjeta_debito">Tarjeta de Débito</SelectItem>
                      <SelectItem value="tarjeta_credito">Tarjeta de Crédito</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agregar Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div className="md:col-span-4">
                  <Label htmlFor="producto">Producto</Label>
                  <Select value={productoSeleccionadoId || ''} onValueChange={setProductoSeleccionadoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {productos.map((producto) => (
                        <SelectItem key={producto.id} value={producto.id}>
                          {producto.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProduct && (
                    <p className="text-sm text-gray-500 mt-1">
                      Precio: ${(selectedProduct.precio ?? 0).toLocaleString()} | Stock disponible: {selectedProduct.stock} {selectedProduct.unidad_medida}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="unidadMedida">Unidad</Label>
                  <Select 
                    value={unidadMedida} 
                    onValueChange={(value: 'kg' | 'gramos' | 'unidades') => setUnidadMedida(value)}
                    disabled={!selectedProduct}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem 
                        value="unidades" 
                        disabled={!selectedProduct || !['unidades', 'unidad'].includes(selectedProduct.unidad_medida)}
                      >
                        Unidades
                      </SelectItem>
                      <SelectItem 
                        value="kg" 
                        disabled={!selectedProduct || !['kg', 'gramos', 'kilogramo'].includes(selectedProduct.unidad_medida)}
                      >
                        Kg
                      </SelectItem>
                      <SelectItem 
                        value="gramos" 
                        disabled={!selectedProduct || !['kg', 'gramos', 'kilogramo'].includes(selectedProduct.unidad_medida)}
                      >
                        Gramos
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="cantidad">Cantidad</Label>
                  <Input
                    id="cantidad"
                    type="number"
                    step="0.01"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <Button onClick={agregarItem} className="bg-orange-600 hover:bg-orange-700 md:col-start-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items de la Venta</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No hay productos agregados</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.nombre}</TableCell>
                        <TableCell className="text-right">${item.precio.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{item.cantidad}</TableCell>
                        <TableCell>{item.unidad_medida}</TableCell>
                        <TableCell className="font-semibold text-right">${item.subtotal.toLocaleString()}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="icon" onClick={() => eliminarItem(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Resumen de Venta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total:</span>
                  <span>${total.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Cliente:</span>
                  <span>{selectedCliente ? `${selectedCliente.nombre} ${selectedCliente.apellido}` : "Sin especificar"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Método de pago:</span>
                  <span>{metodoPago || "Sin especificar"}</span>
                </div>
              </div>

              <Button
                onClick={procesarVenta}
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={!clienteId || !metodoPago || items.length === 0}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Procesar Venta
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
