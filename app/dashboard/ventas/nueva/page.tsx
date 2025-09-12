"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, ShoppingCart, Calculator, Weight, Clock } from "lucide-react"
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
  // ID de lectura de balanza si proviene de un pesaje
  lectura_id?: string
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

interface LecturaBalanza {
  id: string
  fecha: string
  peso: number
  producto_id?: string
  producto_nombre?: string
  producto_codigo?: string
  precio_por_unidad?: number
  unidad_medida?: string
  total_calculado?: number
  fecha_lectura: string
  // Campos opcionales para marcar uso
  usado?: boolean
  id_venta?: string | number | null
}

export default function RealizarVentaPage() {
  const router = useRouter();
  const { showAlert } = useAlert();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [lecturasBalanza, setLecturasBalanza] = useState<LecturaBalanza[]>([]);
  const [lecturasProductoSeleccionado, setLecturasProductoSeleccionado] = useState<LecturaBalanza[]>([]);
  
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState("");
  const [items, setItems] = useState<VentaItem[]>([]);
  
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string | null>(null);
  const [unidadMedida, setUnidadMedida] = useState<'kg' | 'gramos' | 'unidades'>("unidades");
  const [cantidad, setCantidad] = useState("");
  // Búsqueda de productos
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  const selectedProduct = productos.find(p => p.id === productoSeleccionadoId);
  // Detección de tabla y columna de fecha para lecturas de balanza
  const detectarEstructuraLecturas = async () => {
    const posiblesTablas = ['lecturas_balanza', 'lectura_balanza', 'lecturas_de_balanza', 'lectura_de_balanza'];
    for (const t of posiblesTablas) {
      const { error } = await supabase.from(t as any).select('id').limit(1);
      if (!error) {
        const candidatosFecha = ['fecha_lectura', 'fecha', 'created_at'];
        for (const c of candidatosFecha) {
          const { error: eFecha } = await supabase.from(t as any).select(`id, ${c}` as any).limit(1);
          if (!eFecha) return { tabla: t, fecha: c };
        }
        return { tabla: t, fecha: 'fecha_lectura' };
      }
    }
    return { tabla: 'lecturas_balanza', fecha: 'fecha_lectura' };
  }

  // Función para cargar datos de pesaje
  const fetchLecturasBalanza = async () => {
    try {
      const { tabla, fecha } = await detectarEstructuraLecturas();
      const colsBase = `id, ${fecha}, peso, producto_id`;
      const colsExtras = `usado, id_venta`;
      // Intentar con columnas extra y filtros (solo pesajes disponibles)
      let lecturasData: any, lecturasError: any;
      try {
        const q = supabase
          .from(tabla as any)
          .select(`${colsBase}, ${colsExtras}` as any)
          .eq('usado', false)
          .is('id_venta', null)
          .order(fecha, { ascending: false })
          .limit(100) as any;
        const res = await q;
        lecturasData = res.data;
        lecturasError = res.error;
      } catch (e) {
        lecturasData = null; lecturasError = e as any;
      }
      // Si falla por columnas no existentes, reintentar sin filtros/columnas extra
      if (lecturasError && (lecturasError.message?.includes('usado') || lecturasError.message?.includes('id_venta'))) {
        const retry = await supabase
          .from(tabla as any)
          .select(colsBase as any)
          .order(fecha, { ascending: false })
          .limit(100);
        lecturasData = retry.data;
        lecturasError = retry.error;
      }
      // Solo tratar como error si hay message
      if (lecturasError && lecturasError.message) {
        console.error('Error al cargar lecturas:', lecturasError);
        return;
      }

      // Procesar lecturas con información de productos
      const lecturasConProductos = [];
      const filas: any[] = Array.isArray(lecturasData) ? (lecturasData as any[]) : [];
      for (const lecturaAny of filas) {
        let productoInfo = null;
        
        if (lecturaAny.producto_id) {
          const { data: productoData } = await supabase
            .from('productos')
            .select('id, codigo, nombre, precio, unidad_medida')
            .eq('id', lecturaAny.producto_id)
            .single();
          
          productoInfo = productoData;
        }

        lecturasConProductos.push({
          id: String(lecturaAny.id),
          fecha: new Date(lecturaAny[fecha]).toLocaleString('es-AR'),
          peso: lecturaAny.peso,
          producto_id: lecturaAny.producto_id || null,
          producto_nombre: productoInfo?.nombre,
          producto_codigo: productoInfo?.codigo,
          precio_por_unidad: productoInfo?.precio,
          unidad_medida: productoInfo?.unidad_medida,
          total_calculado: productoInfo?.precio ? (lecturaAny.peso * productoInfo.precio) : 0,
          fecha_lectura: lecturaAny[fecha],
          usado: lecturaAny.usado ?? undefined,
          id_venta: lecturaAny.id_venta ?? null,
        });
      }

      setLecturasBalanza(lecturasConProductos);
    } catch (error) {
      console.error('Error al cargar datos de pesaje:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: productosData, error: productosError } = await supabase.from('productos').select('*');
      if (productosError) showAlert('Error al cargar productos', 'error');
      else setProductos(productosData as Producto[] || []);

      const { data: clientesData, error: clientesError } = await supabase.from('clientes').select('*');
      if (clientesError) showAlert('Error al cargar clientes', 'error');
      else setClientes(clientesData || []);

      // Cargar datos de pesaje
      await fetchLecturasBalanza();
    }
    fetchData();
  }, []);

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
      
      // Filtrar lecturas de pesaje para el producto seleccionado
      const lecturasFiltradas = lecturasBalanza.filter(lectura => 
        lectura.producto_id === selectedProduct.id
      );
      setLecturasProductoSeleccionado(lecturasFiltradas);
    } else {
      setLecturasProductoSeleccionado([]);
    }
  }, [selectedProduct, lecturasBalanza]);

  // Función para agregar item desde datos de pesaje
  const agregarItemDesdePesaje = (lectura: LecturaBalanza) => {
    // Evitar reutilizar lecturas marcadas
    if (lectura.usado || lectura.id_venta) {
      showAlert('Este pesaje ya fue utilizado en una venta y no puede reutilizarse.', 'error');
      return;
    }
    // Evitar duplicar el mismo pesaje en el carrito
    if (items.some(i => i.lectura_id === lectura.id)) {
      showAlert('Este pesaje ya está en el carrito.', 'error');
      return;
    }
    if (!lectura.producto_id || !lectura.precio_por_unidad) {
      showAlert('Esta lectura no tiene un producto asociado válido.', 'error');
      return;
    }

    const producto = productos.find(p => p.id === lectura.producto_id);
    if (!producto) {
      showAlert('Producto no encontrado.', 'error');
      return;
    }

    // Verificar si ya existe en el carrito
    const itemExistente = items.find(item => 
      item.producto_id === lectura.producto_id && 
      item.cantidad === lectura.peso &&
      item.unidad_medida === 'kg'
    );

    if (itemExistente) {
      showAlert('Este pesaje ya está agregado al carrito.', 'error');
      return;
    }

    const nuevoItem: VentaItem = {
      id: `pesaje-${lectura.id}-${Date.now()}`,
      producto_id: lectura.producto_id,
      nombre: lectura.producto_nombre || producto.nombre,
      precio: lectura.precio_por_unidad,
      cantidad: lectura.peso,
      unidad_medida: 'kg',
      subtotal: lectura.total_calculado || 0,
      lectura_id: lectura.id,
    };

    setItems([...items, nuevoItem]);
    showAlert(`${lectura.producto_nombre} agregado al carrito (${lectura.peso}kg)`, 'success');
  };

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

      // --- MARCAR PESAJES COMO USADOS ---
      const itemsConPesaje = items.filter(i => i.lectura_id);
      for (const item of itemsConPesaje) {
        try {
          // Intentar setear ambos campos si existen
          let updatePayload: any = { usado: true, id_venta: ventaId };
          let { error: updError } = await supabase
            .from('lecturas_balanza')
            .update(updatePayload)
            .eq('id', item.lectura_id);
          if (updError) {
            // Reintentar con cada uno por separado por si alguna columna no existe
            const { error: updUsado } = await supabase
              .from('lecturas_balanza')
              .update({ usado: true } as any)
              .eq('id', item.lectura_id);
            const { error: updVenta } = await supabase
              .from('lecturas_balanza')
              .update({ id_venta: ventaId } as any)
              .eq('id', item.lectura_id);
            if (updUsado && updVenta) {
              console.warn('No fue posible marcar el pesaje como usado. Considera agregar columna usado:boolean o id_venta.');
            }
          }
        } catch (e) {
          console.error('Error marcando pesaje usado:', e);
        }
      }

      // Optimista: marcar en estado local como usados
      if (itemsConPesaje.length > 0) {
        setLecturasBalanza(prev => prev.map(l =>
          itemsConPesaje.some(i => i.lectura_id === l.id)
            ? { ...l, usado: true, id_venta: ventaId }
            : l
        ));
      }

      // Refrescar lecturas desde DB (por si existen columnas y quedaron persistidas)
      await fetchLecturasBalanza();

      // Resetear formulario para nueva venta
      setClienteId(null);
      setMetodoPago("");
      setItems([]);
      setProductoSeleccionadoId(null);
      setProductSearchTerm("");
      setUnidadMedida('unidades');
      setCantidad("");

      showAlert('Venta procesada exitosamente. Listo para iniciar una nueva venta.', 'success');
      // Permanecer en la pantalla actual como solicitaste

    } catch (error: any) {
      showAlert(error.message || 'Ocurrió un error al procesar la venta.', 'error');
    }
  };

  const selectedCliente = clientes.find(c => c.id === clienteId);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Información de la Venta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel de Agregar Productos */}
            <Card>
              <CardHeader>
                <CardTitle>Agregar Productos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="producto">Producto</Label>
                    {/* Campo de búsqueda con autocompletado */}
                    <div className="relative">
                      <Input
                        id="producto"
                        placeholder="Escribe nombre o código..."
                        value={productSearchTerm}
                        onChange={(e) => {
                          setProductSearchTerm(e.target.value)
                          setShowProductSuggestions(e.target.value.length > 0)
                          if (e.target.value.length === 0) {
                            setProductoSeleccionadoId(null)
                          }
                        }}
                        onFocus={() => setShowProductSuggestions(productSearchTerm.length > 0)}
                      />
                      {/* Lista de sugerencias */}
                      {showProductSuggestions && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {productos.filter(p => (
                            p.nombre.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                            p.codigo.toLowerCase().includes(productSearchTerm.toLowerCase())
                          )).map((p) => (
                            <div
                              key={p.id}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                              onClick={() => {
                                setProductoSeleccionadoId(p.id)
                                setProductSearchTerm(`${p.nombre} (${p.codigo})`)
                                setShowProductSuggestions(false)
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{p.nombre}</span>
                                <span className="text-sm text-gray-500">
                                  {p.codigo} - ${p.precio.toLocaleString()}/{p.unidad_medida}
                                </span>
                              </div>
                            </div>
                          ))}
                          {productos.filter(p => (
                            p.nombre.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                            p.codigo.toLowerCase().includes(productSearchTerm.toLowerCase())
                          )).length === 0 && (
                            <div className="p-3 text-center text-gray-500 text-sm">No se encontraron productos</div>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedProduct && (
                      <p className="text-sm text-gray-500 mt-1">
                        Precio: ${(selectedProduct.precio ?? 0).toLocaleString()} | Stock disponible: {selectedProduct.stock} {selectedProduct.unidad_medida}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  </div>
                  <Button onClick={agregarItem} className="w-full bg-orange-600 hover:bg-orange-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Producto
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Panel de Datos de Pesaje */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Weight className="h-5 w-5" />
                  Datos de Pesaje
                </CardTitle>
                <CardDescription>
                  Todos los pesajes disponibles con productos asociados
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lecturasBalanza.filter(lectura => lectura.producto_id && lectura.precio_por_unidad && !(lectura.usado || lectura.id_venta)).length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <Weight className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No hay pesajes disponibles</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {lecturasBalanza
                      .filter(lectura => lectura.producto_id && lectura.precio_por_unidad && !(lectura.usado || lectura.id_venta))
                      .map((lectura) => (
                        <div key={lectura.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Weight className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                <span className="font-semibold text-base">{lectura.peso.toFixed(3)} kg</span>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="font-medium text-gray-900 truncate">
                                  {lectura.producto_nombre}
                                </div>
                                <div className="text-sm text-gray-600">
                                  ${lectura.precio_por_unidad?.toLocaleString()}/{lectura.unidad_medida || 'kg'}
                                </div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{lectura.fecha}</span>
                                </div>
                                {lectura.total_calculado && (
                                  <div className="font-semibold text-green-600 text-sm">
                                    Total: ${lectura.total_calculado.toFixed(2)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => agregarItemDesdePesaje(lectura)}
                              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto flex-shrink-0"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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
