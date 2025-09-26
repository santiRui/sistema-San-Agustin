"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, ShoppingCart, Calculator, Weight, Clock } from "lucide-react"
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
  // Referencias y estado para flujo con teclado y pesaje
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const cantidadInputRef = useRef<HTMLInputElement | null>(null);
  const [lecturaPendiente, setLecturaPendiente] = useState<LecturaBalanza | null>(null);
  const ultimaLecturaIdRef = useRef<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Asociación rápida desde esta pantalla
  const [isAssocDialogOpen, setIsAssocDialogOpen] = useState(false);
  const [assocSearchTerm, setAssocSearchTerm] = useState('');
  const assocInputRef = useRef<HTMLInputElement | null>(null);
  const [lecturaParaAsociar, setLecturaParaAsociar] = useState<LecturaBalanza | null>(null);
  // CTA dinámico: 'associate' cuando hay pesaje sin producto, 'process' cuando todo listo
  const [ctaMode, setCtaMode] = useState<'associate'|'process'>('associate');
  const associateBtnRef = useRef<HTMLButtonElement | null>(null);
  const processBtnRef = useRef<HTMLButtonElement | null>(null);
  // Editar datos de venta
  const [isEditSaleInfoOpen, setIsEditSaleInfoOpen] = useState(false);
  // Estado de procesamiento de venta
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedProduct = productos.find(p => p.id === productoSeleccionadoId);
  // Asegurar cliente por defecto "Venta General"
  const ensureClienteGeneral = async (): Promise<string> => {
    // Buscar en estado primero
    const vgLocal = clientes.find((c) => (
      (c.nombre || '').toLowerCase().includes('venta') && (c.apellido || '').toLowerCase().includes('general')
    ) || (c.nombre || '').toLowerCase().includes('venta general'));
    if (vgLocal) return vgLocal.id;

    // Buscar en BD por si no está en estado
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

    // Crear si no existe
    const nuevo = { nombre: 'Venta', apellido: 'General', numero_documento: '00000000' } as any;
    const { data: insertData, error: insertErr } = await supabase
      .from('clientes')
      .insert(nuevo)
      .select('id')
      .single();
    if (insertErr || !insertData) throw new Error(insertErr?.message || 'No se pudo crear cliente "Venta General"');
    // Actualizar estado local
    setClientes((prev) => [...prev, { id: insertData.id, nombre: 'Venta', apellido: 'General', numero_documento: '00000000' }]);
    return insertData.id as string;
  };
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
      // Evitar trabajo extra mientras se procesa una venta
      if (isProcessing) return;
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

      // Guardar únicamente la ÚLTIMA lectura disponible sin producto asignado
      const soloDisponibles = lecturasConProductos.filter(l => !l.producto_id);
      setLecturasBalanza(soloDisponibles.slice(0, 1));
    } catch (error) {
      console.error('Error al cargar datos de pesaje:', error);
    }
  };

  // Atajos de teclado globales: Ctrl+Enter finaliza venta, Escape limpia estado de entrada
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        procesarVenta();
      }
      if (e.key === 'Escape') {
        setLecturaPendiente(null);
        setProductoSeleccionadoId(null);
        setProductSearchTerm('');
        setCantidad('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Suscripción realtime a nuevas lecturas para actualización inmediata
  useEffect(() => {
    const posiblesTablas = ['lecturas_balanza', 'lectura_balanza', 'lecturas_de_balanza', 'lectura_de_balanza'];
    // Helper: obtener última lectura real desde BD
    const fetchUltimaLecturaVentas = async () => {
      const { tabla, fecha } = await detectarEstructuraLecturas();
      const { data, error } = await supabase
        .from(tabla as any)
        .select(`id, ${fecha}, peso, producto_id` as any)
        .order(fecha, { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return null;
      const r: any = data[0];
      return {
        id: String(r.id),
        fecha: new Date(r[fecha]).toLocaleString('es-AR'),
        peso: Number(r.peso || 0),
        producto_id: r.producto_id || null,
        fecha_lectura: r[fecha],
      } as any;
    };

    const channels = posiblesTablas.map((t) => {
      return supabase
        .channel(`rt_${t}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: t as any }, async () => {
          const ultima = await fetchUltimaLecturaVentas();
          if (ultima && !ultima.producto_id) {
            setLecturasBalanza([ultima]);
          } else {
            fetchLecturasBalanza();
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: t as any }, () => {
          fetchLecturasBalanza();
        })
        .subscribe();
    });

    return () => {
      channels.forEach((ch) => {
        try { supabase.removeChannel(ch) } catch {}
      });
    };
  }, []);

  // Enfoque del diálogo de asociación
  useEffect(() => {
    if (isAssocDialogOpen) {
      setTimeout(() => assocInputRef.current?.focus(), 0);
    }
  }, [isAssocDialogOpen]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: productosData, error: productosError } = await supabase.from('productos').select('*');
      if (productosError) showAlert('Error al cargar productos', 'error');
      else setProductos(productosData as Producto[] || []);

      const { data: clientesData, error: clientesError } = await supabase.from('clientes').select('*');
      if (clientesError) showAlert('Error al cargar clientes', 'error');
      else {
        setClientes(clientesData || []);
        // Default cliente: Venta General (si existe) y método de pago: efectivo
        if (!clienteId && Array.isArray(clientesData)) {
          const vg = clientesData.find((c: any) => (
            (c.nombre || '').toLowerCase().includes('venta') && (c.apellido || '').toLowerCase().includes('general')
          ) || (c.nombre || '').toLowerCase().includes('venta general'));
          if (vg) setClienteId(vg.id);
        }
      }
      if (!metodoPago) setMetodoPago('efectivo');

      // Cargar datos de pesaje
      await fetchLecturasBalanza();
    }
    fetchData();
  }, []);

  // Polling continuo para detectar nuevos pesajes disponibles
  useEffect(() => {
    const startPolling = () => {
      if (pollingRef.current) return;
      pollingRef.current = setInterval(async () => {
        await fetchLecturasBalanza();
      }, 80); // consulta cada 80ms para detectar aún más rápido
    };
    const stopPolling = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    // Pausar cuando la pestaña no está visible
    const handleVisibility = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopPolling();
    };
  }, []);

  // Cuando cambian las lecturas, buscar la más reciente disponible y activar modo pesaje
  useEffect(() => {
    const disponibles = lecturasBalanza.filter(l => l.precio_por_unidad && !(l.usado || l.id_venta));
    if (disponibles.length === 0) return;
    // Ordenar por fecha_lectura descendente (ya viene ordenado, pero por seguridad)
    const masReciente = disponibles[0];
    if (masReciente && masReciente.id !== ultimaLecturaIdRef.current) {
      // Nueva lectura detectada
      ultimaLecturaIdRef.current = masReciente.id;
      setLecturaPendiente(masReciente);
      // No prellenar unidad ni cantidad en el panel de 'Agregar Productos'
      // No enfocar el input de producto; dejamos el foco en el CTA superior
    }
  }, [lecturasBalanza]);

  const lecturasDisponibles = lecturasBalanza.filter(l => !(l.usado || l.id_venta) && !items.some(i => i.lectura_id === l.id));
  const latestLectura = lecturasDisponibles.length > 0 ? lecturasDisponibles[0] : null;
  const hasUnassociated = lecturasDisponibles.some(l => !l.producto_id);

  // Determinar CTA según estado actual
  useEffect(() => {
    if (hasUnassociated) setCtaMode('associate');
    else if (items.length > 0) setCtaMode('process');
    else setCtaMode('associate');
  }, [hasUnassociated, items.length]);

  // Si la última lectura no tiene producto, forzar CTA a 'associate' y devolver el foco arriba
  useEffect(() => {
    if (latestLectura && !latestLectura.producto_id) {
      setCtaMode('associate');
      setTimeout(() => associateBtnRef.current?.focus(), 0);
    }
  }, [latestLectura?.id, latestLectura?.producto_id]);

  // Enfocar automáticamente el botón según el modo actual
  useEffect(() => {
    if (ctaMode === 'associate') {
      setTimeout(() => associateBtnRef.current?.focus(), 0);
    } else if (ctaMode === 'process') {
      setTimeout(() => processBtnRef.current?.focus(), 0);
    }
  }, [ctaMode]);

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

  const assocSuggestions = (term: string): Producto[] => {
    const t = term.trim().toLowerCase();
    if (!t) return productos.slice(0, 8);
    const starts = productos.filter(p => p.codigo?.toLowerCase().startsWith(t));
    const codeIncludes = productos.filter(p => p.codigo?.toLowerCase().includes(t) && !starts.includes(p));
    const nameIncludes = productos.filter(p => p.nombre?.toLowerCase().includes(t) && !starts.includes(p) && !codeIncludes.includes(p));
    return [...starts, ...codeIncludes, ...nameIncludes].slice(0, 8);
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

  const asociarProductoEnDB = async (lecturaId: string, productoId: string) => {
    try {
      const { tabla } = await detectarEstructuraLecturas();
      const { error } = await supabase
        .from(tabla as any)
        .update({ producto_id: productoId })
        .eq('id', lecturaId);
      if (error) throw error;
    } catch (e: any) {
      showAlert('No se pudo asociar el producto en la base de datos: ' + (e.message || e), 'error');
      throw e;
    }
  };

  const handleOpenAssociateDialog = (lectura: LecturaBalanza | null) => {
    if (!lectura) return;
    setLecturaParaAsociar(lectura);
    setAssocSearchTerm('');
    setIsAssocDialogOpen(true);
  };

  const handleConfirmAssociate = async () => {
    if (!lecturaParaAsociar) return;
    const match = bestMatchProducto(assocSearchTerm);
    if (!match) {
      showAlert('No se encontró un producto para ese código.', 'error');
      return;
    }
    // Validar stock suficiente antes de agregar desde pesaje
    try {
      const producto = productos.find(p => p.id === match.id);
      if (!producto) throw new Error('Producto no encontrado.');
      // lectura.peso está en kg; convertir a unidad base del producto
      let requeridoEnBase = lecturaParaAsociar.peso;
      if (producto.unidad_medida === 'gramos') requeridoEnBase = lecturaParaAsociar.peso * 1000;
      if (requeridoEnBase > producto.stock) {
        showAlert(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock} ${producto.unidad_medida}.`, 'error');
        return;
      }
    } catch (e) {
      console.error(e);
    }
    await asociarProductoEnDB(lecturaParaAsociar.id, match.id);
    // Agregar directamente el item usando el match
    const nuevoItem: VentaItem = {
      id: `pesaje-${lecturaParaAsociar.id}-${Date.now()}`,
      producto_id: match.id,
      nombre: match.nombre,
      precio: match.precio,
      cantidad: lecturaParaAsociar.peso,
      unidad_medida: 'kg',
      subtotal: (match.precio ?? 0) * lecturaParaAsociar.peso,
      lectura_id: lecturaParaAsociar.id,
    };
    setItems(prev => [...prev, nuevoItem]);
    setIsAssocDialogOpen(false);
    setLecturaParaAsociar(null);
    setAssocSearchTerm('');
    // Refrescar lecturas para que figure como asociada
    await fetchLecturasBalanza();
    // Cambiar CTA a procesar si no quedan sin asociar
    if (!hasUnassociated) setCtaMode('process');
    // Enfocar botón de procesar para que Enter cierre la venta
    setTimeout(() => processBtnRef.current?.focus(), 0);
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
    } else {
      setLecturasProductoSeleccionado([]);
    }
  }, [selectedProduct, lecturasBalanza]);

  // Función para agregar item desde datos de pesaje
  const agregarItemDesdePesaje = (lectura: LecturaBalanza) => {
    // Regla: solo un producto por peso/lectura en la venta
    if (items.some(i => i.unidad_medida !== 'unidades')) {
      showAlert('Solo se permite un producto por peso en la venta. Procese la venta o elimine el ítem pesado antes de agregar otro.', 'error');
      return;
    }
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

    // Validar stock suficiente según unidad base del producto
    let requeridoEnBase = lectura.peso; // kg
    if (producto.unidad_medida === 'gramos') requeridoEnBase = lectura.peso * 1000; // convertir a gramos
    if (requeridoEnBase > producto.stock) {
      showAlert(`Stock insuficiente. Disponible: ${producto.stock} ${producto.unidad_medida}.`, 'error');
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
    // Salir de modo lectura pendiente
    setLecturaPendiente(null);
  };

  const agregarItem = () => {
    if (!productoSeleccionadoId || !cantidad || !unidadMedida || !selectedProduct) {
      showAlert('Por favor, complete todos los campos del producto.', 'error');
      return;
    }

    const producto = selectedProduct;
    // Regla: solo un producto por peso (kg/gramos)
    if (unidadMedida !== 'unidades' && items.some(i => i.unidad_medida !== 'unidades')) {
      showAlert('Ya hay un producto por peso en la venta. Procese la venta o elimine el ítem pesado antes de agregar otro.', 'error');
      return;
    }
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
    setLecturaPendiente(null);
    // Enfocar botón de procesar para permitir cerrar con Enter inmediatamente
    setTimeout(() => processBtnRef.current?.focus(), 0);
  };

  const eliminarItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id))
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0)

  // Atajos: Enter (según CTA) y Espacio SOLO para procesar venta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const isTyping = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.getAttribute('contenteditable') === 'true');
      if (!isAssocDialogOpen && !isTyping) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (ctaMode === 'associate') {
            if (latestLectura) handleOpenAssociateDialog(latestLectura);
          } else if (ctaMode === 'process' && !isProcessing) {
            procesarVenta();
          }
        } else if (e.key === ' ') {
          // Espacio solo procesa venta, nunca asocia
          if (ctaMode === 'process' && !isProcessing) {
            e.preventDefault();
            procesarVenta();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAssocDialogOpen, latestLectura, ctaMode, isProcessing]);

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

      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert({
          id_cliente: clienteParaVenta,
          id_usuario: user.id,
          monto_total: total,
          metodo_pago: metodoPago || 'efectivo',
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
      // --- Ejecutar en paralelo: actualizar stock, crear ticket, marcar pesajes como usados ---
      const ts = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const numeroTicket = `TCK-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;

      const itemsConPesaje = items.filter(i => i.lectura_id);
      const { tabla } = await detectarEstructuraLecturas();

      const parallelResults = await Promise.allSettled([
        Promise.all(stockUpdates),
        supabase.from('tickets').insert({
          id_venta: ventaId,
          numero_ticket: numeroTicket,
          fecha_impresion: ts.toISOString(),
          estado: 'emitido',
        }),
        itemsConPesaje.length > 0
          ? supabase.from(tabla as any)
              .update({ usado: true, id_venta: ventaId })
              .in('id', itemsConPesaje.map(i => i.lectura_id))
          : Promise.resolve({}) as any,
      ]);

      // Log de errores no bloqueante
      parallelResults.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.error('Error en tarea paralela', idx, r.reason);
        } else if ('error' in (r.value as any) && (r.value as any).error) {
          console.error('Error en tarea paralela', idx, (r.value as any).error);
        }
      });

      // Optimista: marcar en estado local como usados
      if (itemsConPesaje.length > 0) {
        setLecturasBalanza(prev => prev.map(l =>
          itemsConPesaje.some(i => i.lectura_id === l.id)
            ? { ...l, usado: true, id_venta: ventaId }
            : l
        ));
      }

      // Resetear formulario para nueva venta
      setClienteId(null);
      setMetodoPago("");
      setItems([]);
      setProductoSeleccionadoId(null);
      setProductSearchTerm("");
      setUnidadMedida('unidades');
      setCantidad("");

      showAlert('Venta procesada exitosamente. Listo para iniciar una nueva venta.', 'success');
      // Refrescar lecturas sin bloquear la UI
      setTimeout(() => { fetchLecturasBalanza().catch(() => {}) }, 0);

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

      {/* Sección superior mínima: botón de acción según estado */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Weight className="h-5 w-5" /> Flujo rápido de venta
          </CardTitle>
          <CardDescription>
            Presioná Enter para {ctaMode === 'associate' ? 'asociar el último pesaje' : 'procesar la venta'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="text-sm text-gray-600 truncate">
                {hasUnassociated ? 'Hay un pesaje sin producto asociado' : items.length > 0 ? 'Listo para procesar' : 'Esperando pesaje...'}
              </div>
              {latestLectura && (
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">Último pesaje: {latestLectura.peso.toFixed(3)} kg</span>
                  <span className="text-gray-500">· {latestLectura.producto_nombre ? `Producto: ${latestLectura.producto_nombre}` : 'Sin producto'}</span>
                  {latestLectura.precio_por_unidad ? (
                    <span className="font-semibold text-green-700">Valor: ${((latestLectura.precio_por_unidad || 0) * (latestLectura.peso || 0)).toFixed(2)}</span>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex-shrink-0">
              {ctaMode === 'associate' ? (
                <Button ref={associateBtnRef} className="bg-blue-600 hover:bg-blue-700" onClick={() => latestLectura && handleOpenAssociateDialog(latestLectura)}>
                  Escribir nombre del producto (Enter)
                </Button>
              ) : (
                <Button ref={processBtnRef} className="bg-green-600 hover:bg-green-700" onClick={procesarVenta} disabled={items.length === 0}>
                  Procesar venta (Enter)
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diálogo rápido para asociar producto a la lectura actual */}
      <Dialog open={isAssocDialogOpen} onOpenChange={setIsAssocDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Asociar producto a pesaje</DialogTitle>
            <DialogDescription>
              Escribí el código o nombre del producto y presioná Enter para asociar el más coincidente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {lecturaParaAsociar && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <div><strong>Peso:</strong> {lecturaParaAsociar.peso.toFixed(3)} kg</div>
                <div className="text-gray-500">Fecha: {new Date(lecturaParaAsociar.fecha_lectura).toLocaleString('es-AR')}</div>
              </div>
            )}
            <div>
              <Label htmlFor="assoc-code">Código o nombre</Label>
              <Input
                id="assoc-code"
                ref={assocInputRef}
                value={assocSearchTerm}
                onChange={(e) => setAssocSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmAssociate();
                  }
                }}
                placeholder="Ej: JAMON01"
              />
              <p className="text-xs text-gray-500 mt-1">Enter asocia el producto que coincida exactamente con el código o el más similar.</p>
              {/* Sugerencias en vivo */}
              <div className="mt-2 border rounded-md max-h-56 overflow-y-auto divide-y">
                {assocSuggestions(assocSearchTerm).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                    onClick={() => {
                      setAssocSearchTerm(p.codigo);
                      // confirmar inmediatamente
                      setTimeout(() => handleConfirmAssociate(), 0);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900">{p.nombre}</div>
                        <div className="text-xs text-gray-500 font-mono">{p.codigo}</div>
                      </div>
                      <div className="text-sm text-gray-700">${(p.precio ?? 0).toLocaleString()}</div>
                    </div>
                  </button>
                ))}
                {assocSuggestions(assocSearchTerm).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Sin sugerencias</div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmAssociate}>Asociar y agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <button className="text-left underline decoration-dotted hover:decoration-solid" onClick={() => setIsEditSaleInfoOpen(true)}>
                {selectedCliente ? `${selectedCliente.nombre} ${selectedCliente.apellido}` : "Venta General"}
              </button>
            </div>
            <div className="flex justify-between">
              <span>Método de pago:</span>
              <button className="text-left underline decoration-dotted hover:decoration-solid" onClick={() => setIsEditSaleInfoOpen(true)}>
                {metodoPago || 'efectivo'}
              </button>
            </div>
          </div>
          <Button
            ref={processBtnRef}
            onClick={procesarVenta}
            onKeyDown={(e) => {
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar datos de la venta</DialogTitle>
            <DialogDescription>Podés cambiar el cliente y el método de pago predeterminados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={clienteId || ''} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método de Pago</Label>
              <Select value={metodoPago || 'efectivo'} onValueChange={setMetodoPago}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditSaleInfoOpen(false)}>Cerrar</Button>
            <Button onClick={() => setIsEditSaleInfoOpen(false)}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sección inferior: Agregar productos e Items */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 mt-4">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
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
                        ref={productInputRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // Elegir siempre la mejor coincidencia (o primera sugerencia si el dropdown está abierto)
                            const match = bestMatchProducto(productSearchTerm) || productSuggestions(productSearchTerm)[0];
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
                          {productSuggestions(productSearchTerm).map((producto) => (
                            <div
                              key={producto.id}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
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

            {/* Panel de Datos de Pesaje eliminado por nuevo flujo */}
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
