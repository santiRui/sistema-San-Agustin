"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, ShoppingCart, Calculator, Clock } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  const [mixtoEfectivo, setMixtoEfectivo] = useState<string>("");
  const [mixtoTransferencia, setMixtoTransferencia] = useState<string>("");
  const [items, setItems] = useState<VentaItem[]>([]);
  
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string | null>(null);
  const [unidadMedida, setUnidadMedida] = useState<'kg' | 'gramos' | 'unidades'>("unidades");
  const [cantidad, setCantidad] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [debouncedProductTerm, setDebouncedProductTerm] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const cantidadInputRef = useRef<HTMLInputElement | null>(null);
  const processBtnRef = useRef<HTMLButtonElement | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState<number>(-1);
  const productActiveElRef = useRef<HTMLDivElement | null>(null);
  const [isEditSaleInfoOpen, setIsEditSaleInfoOpen] = useState(false);
  const clienteSelectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const metodoSelectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isClienteSelectOpen, setIsClienteSelectOpen] = useState(false);
  const [isMetodoSelectOpen, setIsMetodoSelectOpen] = useState(false);
  const [editSaleField, setEditSaleField] = useState<'cliente' | 'metodo' | 'ambos'>('ambos');
  const [isProcessing, setIsProcessing] = useState(false);
  const hasBlockingOverlay = isEditSaleInfoOpen || isClienteSelectOpen || isMetodoSelectOpen;
  const ignoreNextEnterSpaceUntilRef = useRef<number>(0);

  const ensureClienteGeneral = async (): Promise<string> => {
    const vgLocal = clientes.find((c) => (
      (c.nombre || '').toLowerCase().includes('venta') && (c.apellido || '').toLowerCase().includes('general')
    ) || (c.nombre || '').toLowerCase().includes('venta general'));
    if (vgLocal) return vgLocal.id;

    const { data: found, error: findErr } = await supabase
      .from('clientes')
      .select('id, nombre, apellido')
      .ilike('nombre', '%venta%');
    if (!findErr && Array.isArray(found)) {
      const vgDb = found.find((c: any) => (
        (c.nombre || '').toLowerCase().includes('venta') && (c.apellido || '').toLowerCase().includes('general')
      ) || (c.nombre || '').toLowerCase().includes('venta general'));
      if (vgDb) return vgDb.id as string;
    }

    const nuevo = { nombre: 'Venta', apellido: 'General', numero_documento: '00000000' } as any;
    const { data: insertData, error: insertErr } = await supabase
      .from('clientes')
      .insert(nuevo)
      .select('id')
      .single();
    if (insertErr || !insertData) throw new Error(insertErr?.message || 'No se pudo crear cliente "Venta General"');
    setClientes((prev) => [...prev, { id: insertData.id, nombre: 'Venta', apellido: 'General', numero_documento: '00000000' }]);
    return insertData.id as string;
  };

  const selectedProduct = productos.find(p => p.id === productoSeleccionadoId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && now < (ignoreNextEnterSpaceUntilRef.current || 0)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (hasBlockingOverlay && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!hasBlockingOverlay) procesarVenta();
      }
      if (e.key === 'Escape') {
        setProductSearchTerm('');
        setCantidad('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasBlockingOverlay]);

  useEffect(() => {
    if (isEditSaleInfoOpen) {
      setTimeout(() => {
        if (editSaleField === 'cliente' || editSaleField === 'ambos') {
          clienteSelectTriggerRef.current?.focus();
        } else if (editSaleField === 'metodo') {
          metodoSelectTriggerRef.current?.focus();
        }
      }, 0);
    }
  }, [isEditSaleInfoOpen, editSaleField]);

  useEffect(() => {
    async function fetchData() {
      const { data: productosData, error: productosError } = await supabase.from('productos').select('*');
      if (productosError) showAlert('Error al cargar productos', 'error');
      else setProductos(productosData as Producto[] || []);

      const { data: clientesData, error: clientesError } = await supabase.from('clientes').select('*');
      if (clientesError) showAlert('Error al cargar clientes', 'error');
      else {
        setClientes(clientesData || []);
        if (!clienteId && Array.isArray(clientesData)) {
          const vg = clientesData.find((c: any) => (
            (c.nombre || '').toLowerCase().includes('venta') && (c.apellido || '').toLowerCase().includes('general')
          ) || (c.nombre || '').toLowerCase().includes('venta general'));
          if (vg) setClienteId(vg.id);
        }
      }
      if (!metodoPago) setMetodoPago('efectivo');
    }
    fetchData();
  }, []);

  useEffect(() => {
    setProductActiveIndex(-1);
  }, [productSearchTerm, showProductSuggestions]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductTerm(productSearchTerm), 120);
    return () => clearTimeout(t);
  }, [productSearchTerm]);

  const normalize = (v: any) => String(v ?? '').trim().toLowerCase();
  const bestMatchProducto = (term: string): Producto | undefined => {
    const t = normalize(term);
    if (!t) return undefined;
    const scored = productos.map((p) => {
      const code = normalize(p.codigo);
      const name = normalize(p.nombre);
      let score = -1;
      if (code === t) score = 100;
      else if (code.startsWith(t)) score = 80 - Math.max(0, code.length - t.length); // prefiera códigos más cortos
      else if (code.includes(t)) score = 60 - Math.max(0, code.indexOf(t)); // prefiera aparición más al inicio
      else if (name.includes(t)) score = 40 - Math.max(0, name.indexOf(t));
      return { p, score };
    }).filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.length > 0 ? scored[0].p : undefined;
  };

  // Sugerencias para 'Agregar Productos'
  const productSuggestions = (term: string): Producto[] => {
    const t = normalize(term);
    if (!t) return productos.slice(0, 8);
    const scored = productos.map((p) => {
      const code = normalize(p.codigo);
      const name = normalize(p.nombre);
      let score = -1;
      if (code === t) score = 100;
      else if (code.startsWith(t)) score = 80 - Math.max(0, code.length - t.length);
      else if (code.includes(t)) score = 60 - Math.max(0, code.indexOf(t));
      else if (name.includes(t)) score = 40 - Math.max(0, name.indexOf(t));
      return { p, score };
    }).filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.p);
    return scored.slice(0, 8);
  };

  useEffect(() => {
    if (selectedProduct) {
      const baseUnit = selectedProduct.unidad_medida;
      // Si la unidad base es para items no pesables, la unidad por defecto es 'unidades'
      if (['unidades', 'unidad'].includes(baseUnit)) {
        setUnidadMedida('unidades');
      } else { 
        setUnidadMedida('kg');
      }
      // No borrar la cantidad si el usuario ya escribió algo
      // Si está vacío, sugerir 1 para unidades; para peso, mantener vacío
      setCantidad((prev) => {
        if (prev && prev !== '0' && prev !== '0.00') return prev;
        return ['unidades', 'unidad'].includes(baseUnit) ? '1' : '';
      });
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
    // Enfocar botón de procesar para permitir cerrar con Enter inmediatamente
    setTimeout(() => processBtnRef.current?.focus(), 0);
  };

  const eliminarItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id))
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  // Atajos: Enter y Espacio SOLO para procesar venta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const isTyping = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.getAttribute('contenteditable') === 'true');
      if (!isTyping && !hasBlockingOverlay) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!isProcessing) {
            procesarVenta();
          }
        } else if (e.key === ' ') {
          if (!isProcessing) {
            e.preventDefault();
            procesarVenta();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasBlockingOverlay, isProcessing]);

  const procesarVenta = async () => {
    if (items.length === 0) {
      showAlert("No hay productos en la venta.", 'error');
      return;
    }

    try {
      setIsProcessing(true);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError || !userData?.user) {
        showAlert('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.', 'error');
        return;
      }
      const user = userData.user;

      // Asegurar cliente obligatorio
      const clienteParaVenta = clienteId || await ensureClienteGeneral();

      // Validación de método mixto
      let montoEfectivo = 0;
      let montoTransfer = 0;
      if ((metodoPago || 'efectivo') === 'mixto') {
        montoEfectivo = Number(mixtoEfectivo || 0);
        montoTransfer = Number(mixtoTransferencia || 0);
        if (montoEfectivo < 0 || montoTransfer < 0) {
          showAlert('Los montos de efectivo y transferencia no pueden ser negativos.', 'error');
          return;
        }
        const suma = Number((montoEfectivo + montoTransfer).toFixed(2));
        const totalRounded = Number(total.toFixed(2));
        if (suma !== totalRounded) {
          showAlert(`La suma de efectivo ($${montoEfectivo.toLocaleString()}) y transferencia ($${montoTransfer.toLocaleString()}) debe ser igual al total ($${totalRounded.toLocaleString()}).`, 'error');
          return;
        }
      }

      const vendedorNombre = ((user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name || '').toString();
      const vendedorEmail = (user as any)?.email || '';

      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert({
          id_cliente: clienteParaVenta,
          id_usuario: user.id,
          monto_total: total,
          metodo_pago: metodoPago || 'efectivo',
          estado: 'completada',
          monto_efectivo: (metodoPago || 'efectivo') === 'mixto' ? montoEfectivo : 0,
          monto_transferencia: (metodoPago || 'efectivo') === 'mixto' ? montoTransfer : 0,
          vendedor_nombre: vendedorNombre,
          vendedor_email: vendedorEmail,
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

      // Calcular decrementos por producto y actualizar en paralelo
      const decrementos: Record<string, number> = {};
      for (const item of items) {
        const producto = productos.find(p => p.id === item.producto_id);
        if (!producto) continue;
        let cant = item.cantidad;
        const baseUnitIsKg = ['kg', 'kilogramo'].includes(producto.unidad_medida);
        if (baseUnitIsKg && item.unidad_medida === 'gramos') cant = item.cantidad / 1000;
        else if (producto.unidad_medida === 'gramos' && item.unidad_medida === 'kg') cant = item.cantidad * 1000;
        decrementos[producto.id] = (decrementos[producto.id] || 0) + cant;
      }
      // Asegurar que tenemos el stock actual para todos los productos involucrados
      const productosMap: Record<string, { stock: number }> = {};
      for (const p of productos) productosMap[p.id] = { stock: p.stock } as any;
      const faltantes = Object.keys(decrementos).filter(id => productosMap[id] === undefined);
      if (faltantes.length > 0) {
        const { data: faltantesData, error: faltantesError } = await supabase
          .from('productos')
          .select('id, stock')
          .in('id', faltantes);
        if (faltantesError) throw faltantesError;
        (faltantesData || []).forEach((row: any) => {
          productosMap[row.id] = { stock: row.stock };
        });
      }
      const stockUpdates = Object.entries(decrementos).map(async ([productoId, dec]) => {
        const info = productosMap[productoId];
        const stockActual = info ? info.stock : 0;
        const nuevoStock = Math.max(0, stockActual - dec);
        const { error } = await supabase
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', productoId);
        if (error) throw error;
      });
      // --- Ejecutar en paralelo: actualizar stock y crear ticket ---
      const ts = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const numeroTicket = `TCK-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;

      const parallelResults = await Promise.allSettled([
        Promise.all(stockUpdates),
        supabase.from('tickets').insert({
          id_venta: ventaId,
          numero_ticket: numeroTicket,
          fecha_impresion: ts.toISOString(),
          estado: 'emitido',
        }),
      ]);

      // Log de errores no bloqueante
      parallelResults.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.error('Error en tarea paralela', idx, r.reason);
        } else if ('error' in (r.value as any) && (r.value as any).error) {
          console.error('Error en tarea paralela', idx, (r.value as any).error);
        }
      });

      // Resetear formulario para nueva venta
      setClienteId(null);
      setMetodoPago("");
      setMixtoEfectivo("");
      setMixtoTransferencia("");
      setItems([]);
      setProductoSeleccionadoId(null);
      setProductSearchTerm("");
      setUnidadMedida('unidades');
      setCantidad("");

      showAlert('Venta procesada exitosamente. Listo para iniciar una nueva venta.', 'success');

    } catch (error: any) {
      const msg = error?.message || error?.error_description || (typeof error === 'string' ? error : JSON.stringify(error));
      console.error('procesarVenta error:', error);
      showAlert(msg || 'Error al procesar la venta', 'error');
    } finally {
      setIsProcessing(false);
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

    {/* Resumen de Venta inmediatamente después del flujo rápido */}
    <Card className="mt-4">
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
              <button className="text-left underline decoration-dotted hover:decoration-solid" onClick={() => { setEditSaleField('cliente'); setIsEditSaleInfoOpen(true); }}>
                {selectedCliente ? `${selectedCliente?.nombre} ${selectedCliente?.apellido}` : "Venta General"}
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span>Método de pago:</span>
              <button className="text-left underline decoration-dotted hover:decoration-solid" onClick={() => { setEditSaleField('metodo'); setIsEditSaleInfoOpen(true); }}>
                {metodoPago || 'efectivo'}
              </button>
            </div>
            {metodoPago === 'mixto' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="mixto-efectivo">Efectivo</Label>
                  <Input
                    id="mixto-efectivo"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={mixtoEfectivo}
                    onChange={(e) => setMixtoEfectivo(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="mixto-transfer">Transferencia</Label>
                  <Input
                    id="mixto-transfer"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={mixtoTransferencia}
                    onChange={(e) => setMixtoTransferencia(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="sm:col-span-2 text-xs text-gray-600">
                  Suma: ${(Number(mixtoEfectivo||0)+Number(mixtoTransferencia||0)).toLocaleString()} / Total: ${total.toLocaleString()}
                </div>
              </div>
            )}
          </div>
          <Button
            ref={processBtnRef}
            onClick={(e) => {
              if (hasBlockingOverlay) { e.preventDefault(); return; }
              procesarVenta();
            }}
            onKeyDown={(e) => {
              if (hasBlockingOverlay) { e.preventDefault(); e.stopPropagation(); return; }
              if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                if (!isProcessing) procesarVenta();
              }
            }}
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={items.length === 0 || isProcessing}
            aria-busy={isProcessing}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Procesar Venta
          </Button>
        </CardContent>
      </Card>

      {/* Diálogo para editar Cliente y Método de pago */}
      <Dialog open={isEditSaleInfoOpen} onOpenChange={setIsEditSaleInfoOpen}>
        <DialogContent
          className="sm:max-w-[500px]"
          onKeyDown={(e) => {
            // No propagar a botones por detrás
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
              e.stopPropagation();
            }
            if (e.key === 'Enter' && !isClienteSelectOpen && !isMetodoSelectOpen) {
              e.preventDefault();
              // Validar mixto antes de cerrar
              if ((metodoPago || 'efectivo') === 'mixto') {
                const ef = Number(mixtoEfectivo || 0);
                const tr = Number(mixtoTransferencia || 0);
                const suma = Number((ef + tr).toFixed(2));
                const totalRounded = Number(total.toFixed(2));
                if (suma !== totalRounded) {
                  showAlert(`La suma de efectivo y transferencia debe ser igual al total ($${totalRounded.toLocaleString()}).`, 'error');
                  return;
                }
              }
              ignoreNextEnterSpaceUntilRef.current = Date.now() + 250;
              setIsEditSaleInfoOpen(false);
              setTimeout(() => processBtnRef.current?.focus(), 0);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editSaleField === 'cliente' ? 'Editar cliente' : editSaleField === 'metodo' ? 'Editar método de pago' : 'Editar datos de la venta'}
            </DialogTitle>
            <DialogDescription>
              {editSaleField === 'cliente' ? 'Seleccioná el cliente de la venta.' : editSaleField === 'metodo' ? 'Seleccioná el método de pago.' : 'Podés cambiar el cliente y el método de pago.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editSaleField !== 'metodo' && (
              <div>
                <Label>Cliente</Label>
                <Select
                  value={clienteId || ''}
                  onValueChange={setClienteId}
                  open={isClienteSelectOpen}
                  onOpenChange={setIsClienteSelectOpen}
                >
                  <SelectTrigger
                    ref={clienteSelectTriggerRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        setIsClienteSelectOpen(true);
                      }
                    }}
                  >
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editSaleField !== 'cliente' && (
              <div>
                <Label>Método de Pago</Label>
                <Select
                  value={metodoPago || 'efectivo'}
                  onValueChange={setMetodoPago}
                  open={isMetodoSelectOpen}
                  onOpenChange={setIsMetodoSelectOpen}
                >
                  <SelectTrigger
                    ref={metodoSelectTriggerRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        setIsMetodoSelectOpen(true);
                      }
                    }}
                  >
                    <SelectValue placeholder="Seleccionar método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta_debito">Tarjeta de Débito</SelectItem>
                    <SelectItem value="tarjeta_credito">Tarjeta de Crédito</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mixto">Mixto (Efectivo + Transferencia)</SelectItem>
                  </SelectContent>
                </Select>
                {metodoPago === 'mixto' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <Label htmlFor="mixto-efectivo-dialog">Efectivo</Label>
                      <Input
                        id="mixto-efectivo-dialog"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        value={mixtoEfectivo}
                        onChange={(e) => setMixtoEfectivo(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mixto-transfer-dialog">Transferencia</Label>
                      <Input
                        id="mixto-transfer-dialog"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        value={mixtoTransferencia}
                        onChange={(e) => setMixtoTransferencia(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="sm:col-span-2 text-xs text-gray-600">
                      Suma: ${(Number(mixtoEfectivo||0)+Number(mixtoTransferencia||0)).toLocaleString()} / Total: ${total.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                ignoreNextEnterSpaceUntilRef.current = Date.now() + 250;
                setIsEditSaleInfoOpen(false);
                setTimeout(() => processBtnRef.current?.focus(), 0);
              }}
            >Cerrar</Button>
            <Button
              onClick={() => {
                if ((metodoPago || 'efectivo') === 'mixto') {
                  const ef = Number(mixtoEfectivo || 0);
                  const tr = Number(mixtoTransferencia || 0);
                  const suma = Number((ef + tr).toFixed(2));
                  const totalRounded = Number(total.toFixed(2));
                  if (suma !== totalRounded) {
                    showAlert(`La suma de efectivo y transferencia debe ser igual al total ($${totalRounded.toLocaleString()}).`, 'error');
                    return;
                  }
                }
                ignoreNextEnterSpaceUntilRef.current = Date.now() + 250;
                setIsEditSaleInfoOpen(false);
                setTimeout(() => processBtnRef.current?.focus(), 0);
              }}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sección inferior: Agregar productos e Items */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 mt-4">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                        ref={productInputRef}
                        onKeyDown={(e) => {
                          const list = productSuggestions(debouncedProductTerm);
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setShowProductSuggestions(true);
                            setProductActiveIndex((prev) => Math.min(prev + 1, list.length - 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setProductActiveIndex((prev) => Math.max(prev - 1, -1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (productActiveIndex >= 0 && productActiveIndex < list.length) {
                              const chosen = list[productActiveIndex];
                              setProductoSeleccionadoId(chosen.id);
                              setProductSearchTerm(`${chosen.nombre} (${chosen.codigo})`);
                              setShowProductSuggestions(false);
                              setTimeout(() => {
                                if (chosen.unidad_medida && ['unidad', 'unidades'].includes(chosen.unidad_medida)) {
                                  setUnidadMedida('unidades');
                                  setCantidad((prev) => prev || '1');
                                }
                                cantidadInputRef.current?.focus();
                              }, 0);
                              return;
                            }
                            const match = bestMatchProducto(debouncedProductTerm) || list[0];
                            if (match) {
                              setProductoSeleccionadoId(match.id);
                              setProductSearchTerm(`${match.nombre} (${match.codigo})`);
                              setShowProductSuggestions(false);
                              // Pasar foco al campo de cantidad, con defaults si es por unidades
                              setTimeout(() => {
                                if (match.unidad_medida && ['unidad', 'unidades'].includes(match.unidad_medida)) {
                                  setUnidadMedida('unidades');
                                  setCantidad(prev => prev || '1');
                                }
                                cantidadInputRef.current?.focus();
                              }, 0);
                              return;
                            }
                            // Si ya hay producto seleccionado y cantidad, agregar
                            if (productoSeleccionadoId && cantidad) {
                              agregarItem();
                              setTimeout(() => processBtnRef.current?.focus(), 0);
                              return;
                            }
                            // Si hay producto pero sin cantidad -> foco a cantidad
                            if (productoSeleccionadoId && !cantidad) {
                              setTimeout(() => cantidadInputRef.current?.focus(), 0);
                            }
                          }
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setProductSearchTerm(value);
                          setShowProductSuggestions(value.length > 0);
                          if (value.length === 0) {
                            setProductoSeleccionadoId(null);
                            return;
                          }
                          // Si escribe código exacto, seleccionar automáticamente
                          const v = value.toLowerCase();
                          const porCodigo = productos.find(p => normalize(p.codigo) === v);
                          if (porCodigo) {
                            setProductoSeleccionadoId(porCodigo.id);
                            // Si hay lectura pendiente, precargar cantidad ya está hecho; mostrar hint
                          }
                        }}
                        onFocus={() => setShowProductSuggestions(productSearchTerm.length > 0)}
                      />
                      {/* Lista de sugerencias */}
                      {showProductSuggestions && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {productSuggestions(debouncedProductTerm).map((producto, idx) => (
                            <div
                              key={producto.id}
                              className={`p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${idx === productActiveIndex ? 'bg-gray-100' : ''}`}
                              onMouseEnter={() => setProductActiveIndex(idx)}
                              ref={idx === productActiveIndex ? (el) => { productActiveElRef.current = el } : undefined}
                              onClick={() => {
                                setProductoSeleccionadoId(producto.id);
                                setProductSearchTerm(`${producto.nombre} (${producto.codigo})`);
                                setShowProductSuggestions(false);
                                setTimeout(() => cantidadInputRef.current?.focus(), 0);
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{producto.nombre}</span>
                                <span className="text-sm text-gray-500">
                                  {producto.codigo} - ${producto.precio.toLocaleString()}/{producto.unidad_medida}
                                </span>
                              </div>
                            </div>
                          ))}
                          {productSuggestions(productSearchTerm).length === 0 && (
                            <div className="p-3 text-center text-gray-500 text-sm">No se encontraron productos</div>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedProduct && (
                      <p className="text-sm text-gray-500 mt-1">
                        Precio: ${(selectedProduct?.precio ?? 0).toLocaleString()} | Stock disponible: {selectedProduct?.stock ?? 0} {selectedProduct?.unidad_medida ?? ''}
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
                            disabled={!selectedProduct || !['unidades', 'unidad'].includes(selectedProduct?.unidad_medida as any)}
                          >
                            Unidades
                          </SelectItem>
                          <SelectItem 
                            value="kg" 
                            disabled={!selectedProduct || !['kg', 'gramos', 'kilogramo'].includes(selectedProduct?.unidad_medida as any)}
                          >
                            Kg
                          </SelectItem>
                          <SelectItem 
                            value="gramos" 
                            disabled={!selectedProduct || !['kg', 'gramos', 'kilogramo'].includes(selectedProduct?.unidad_medida as any)}
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
                        step={unidadMedida === 'unidades' ? 1 : 0.01}
                        min={unidadMedida === 'unidades' ? 1 : 0.01}
                        inputMode="numeric"
                        value={cantidad}
                        ref={cantidadInputRef}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (unidadMedida === 'unidades') {
                            // Solo enteros positivos
                            const soloEntero = v.replace(/[^0-9]/g, '');
                            setCantidad(soloEntero);
                          } else {
                            setCantidad(v);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (productoSeleccionadoId && cantidad) {
                              // Validar mínimo cuando es unidades
                              if (unidadMedida === 'unidades' && Number(cantidad) < 1) {
                                setCantidad('1');
                              }
                              agregarItem();
                              // Foco al botón procesar para cerrar con Enter
                              setTimeout(() => processBtnRef.current?.focus(), 0);
                            }
                            return;
                          }
                          // Evitar decimales cuando es unidades
                          if (unidadMedida === 'unidades' && (e.key === '.' || e.key === ',')) {
                            e.preventDefault();
                          }
                        }}
                        onFocus={(e) => {
                          // Seleccionar todo para sobreescribir rápìdo
                          e.currentTarget.select();
                        }}
                        placeholder={unidadMedida === 'unidades' ? '1' : '0.00'}
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
      </div>
    </div>
  )
}
