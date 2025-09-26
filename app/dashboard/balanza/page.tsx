"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Search, Weight, RefreshCw, TrendingUp, Download, Link, Calculator } from "lucide-react"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { useAlert } from "@/components/AlertProvider"

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
}

interface Producto {
  id: string
  codigo: string
  nombre: string
  precio: number
  unidad_medida: string
}

export default function BalanzaPage() {
  const router = useRouter()
  const [lecturas, setLecturas] = useState<LecturaBalanza[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [selectedLectura, setSelectedLectura] = useState<LecturaBalanza | null>(null)
  const [selectedProducto, setSelectedProducto] = useState<string>('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const productSearchRef = useRef<HTMLInputElement | null>(null)
  const { showAlert } = useAlert()
  // Estado para compatibilidad con distintos nombres de tabla/columnas
  const [tablaLecturas, setTablaLecturas] = useState<string>('lecturas_balanza')
  const [columnaFecha, setColumnaFecha] = useState<string>('fecha_lectura')
  

  // Detectar tabla y columnas disponibles
  const detectarEstructura = async () => {
    const posiblesTablas = [
      'lecturas_balanza',
      'lectura_balanza',
      'lecturas_de_balanza',
      'lectura_de_balanza',
    ]
    for (const t of posiblesTablas) {
      const { data: testData, error: testError } = await supabase
        .from(t as any)
        .select('id')
        .limit(1)
      if (!testError) {
        // Detectar nombre de columna de fecha más común
        const candidatosFecha = ['fecha_lectura', 'fecha', 'created_at']
        let fechaElegida = 'fecha_lectura'
        for (const c of candidatosFecha) {
          const { error: eFecha } = await supabase
            .from(t as any)
            .select(`id, ${c}` as any)
            .limit(1)
          if (!eFecha) {
            fechaElegida = c
            break
          }
        }
        setTablaLecturas(t)
        setColumnaFecha(fechaElegida)
        return { tabla: t, fecha: fechaElegida }
      }
    }
    // Si no encontró ninguna, mantener valores por defecto
    return { tabla: 'lecturas_balanza', fecha: 'fecha_lectura' }
  }

  // Obtener la última lectura REAL desde BD (independiente del payload)
  const fetchUltimaLectura = async (): Promise<LecturaBalanza | null> => {
    const { tabla, fecha } = await detectarEstructura()
    const { data, error } = await supabase
      .from(tabla as any)
      .select(`id, ${fecha}, peso, producto_id` as any)
      .order(fecha, { ascending: false })
      .limit(1)
    if (error || !data || data.length === 0) return null
    const r: any = data[0]
    const fechaVal = r[fecha]
    return {
      id: String(r.id),
      fecha: new Date(fechaVal).toLocaleString('es-AR'),
      peso: Number(r.peso || 0),
      producto_id: r.producto_id || null,
      producto_nombre: undefined,
      producto_codigo: undefined,
      precio_por_unidad: undefined,
      unidad_medida: undefined,
      total_calculado: undefined,
      fecha_lectura: fechaVal,
    }
  }

  // Cargar datos de la base de datos
  const fetchLecturasFromDB = async () => {
    try {
      setIsLoading(true)
      // Asegurar detección de estructura primero
      const { tabla, fecha } = await detectarEstructura()

      // Si la tabla existe, hacer la consulta completa (intentar con producto_id)
      let lecturasData: any, lecturasError: any
      
      // Primero intentar con producto_id
      const columnsWithProduct = `id, ${fecha}, peso, producto_id`
      const queryWithProduct: any = await supabase
        .from(tabla as any)
        .select(columnsWithProduct as any)
        .order(fecha, { ascending: false })
        .limit(50)
      
      if (queryWithProduct.error && queryWithProduct.error.message.includes('producto_id')) {
        // Si falla, intentar sin producto_id
        const columnsWithoutProduct = `id, ${fecha}, peso`
        const queryWithoutProduct: any = await supabase
          .from(tabla as any)
          .select(columnsWithoutProduct as any)
          .order(fecha, { ascending: false })
          .limit(50)
        
        lecturasData = queryWithoutProduct.data
        lecturasError = queryWithoutProduct.error
        console.log('Columna producto_id no existe, usando consulta básica')
      } else {
        lecturasData = queryWithProduct.data
        lecturasError = queryWithProduct.error
      }

      if (lecturasError && (lecturasError as any).message) {
        console.error('Error al cargar lecturas:', lecturasError)
        showAlert(`Error al cargar lecturas: ${(lecturasError as any).message}`, 'error')
        return
      }

      // Si hay lecturas, intentar obtener información de productos asociados
      const lecturasConProductos = []
      const filas: any[] = Array.isArray(lecturasData) ? (lecturasData as any[]) : []
      for (const lecturaAny of filas) {
        let productoInfo = null
        
        // Solo buscar producto si la columna producto_id existe y tiene valor
        if (lecturaAny.producto_id) {
          const { data: productoData } = await supabase
            .from('productos')
            .select('id, codigo, nombre, precio, unidad_medida')
            .eq('id', lecturaAny.producto_id)
            .single()
          
          productoInfo = productoData
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
          fecha_lectura: lecturaAny[fecha]
        })
      }

      setLecturas(lecturasConProductos)
    } catch (error) {
      console.error('Error general:', error)
      showAlert('Error al cargar datos de balanza', 'error')
      // Mostrar datos de ejemplo en caso de error
      const ejemploLecturas: LecturaBalanza[] = [
        {
          id: '1',
          fecha: new Date().toLocaleString('es-AR'),
          peso: 0.5,
          fecha_lectura: new Date().toISOString()
        }
      ]
      setLecturas(ejemploLecturas)
    } finally {
      setIsLoading(false)
    }
  }

  // Crear columna producto_id si no existe y agregar datos de ejemplo
  const crearDatosEjemplo = async () => {
    try {
      // Primero intentar agregar la columna producto_id si no existe
      try {
        const { error: alterError } = await supabase.rpc('add_producto_id_column')
        if (alterError && !alterError.message.includes('already exists')) {
          console.log('Intentando crear columna producto_id manualmente...')
        }
      } catch (e) {
        // La columna puede ya existir, continuar
      }

      // Intentar insertar algunas lecturas de ejemplo
      const lecturasEjemplo = [
        {
          fecha_lectura: new Date().toISOString(),
          peso: 0.5,
          producto_id: null
        },
        {
          fecha_lectura: new Date(Date.now() - 3600000).toISOString(),
          peso: 1.2,
          producto_id: null
        },
        {
          fecha_lectura: new Date(Date.now() - 7200000).toISOString(),
          peso: 0.8,
          producto_id: null
        }
      ]

      const { error: insertError } = await supabase
        .from(tablaLecturas as any)
        .insert(lecturasEjemplo)

      if (!insertError) {
        showAlert('Datos de ejemplo creados exitosamente', 'success')
        await fetchLecturasFromDB()
      } else {
        console.error('Error al insertar:', insertError)
        showAlert('Error al crear datos de ejemplo. Puede que necesites agregar la columna producto_id manualmente.', 'error')
      }
    } catch (error) {
      console.error('Error al crear datos de ejemplo:', error)
    }
  }

  // Cargar productos disponibles
  const fetchProductos = async () => {
    try {
      const { data: productosData, error: productosError } = await supabase
        .from('productos')
        .select('id, codigo, nombre, precio, unidad_medida')
        .order('nombre', { ascending: true })

      if (productosError) {
        console.error('Error al cargar productos:', productosError)
        return
      }

      setProductos(productosData || [])
    } catch (error) {
      console.error('Error al cargar productos:', error)
    }
  }

  // Eliminado: conexión directa a localhost de la balanza. Solo usamos Supabase.

  // Función para asociar un producto con una lectura
  const handleAsociarProducto = async () => {
    if (!selectedLectura || !selectedProducto) return

    const producto = productos.find(p => p.id === selectedProducto)
    if (producto && producto.unidad_medida === 'unidad') {
      showAlert('No se puede asociar un producto cuya unidad de medida es "unidad".', 'error')
      return
    }

    try {
      // Intentar guardar la asociación en la base de datos
      const { error } = await supabase
        .from(tablaLecturas as any)
        .update({ producto_id: selectedProducto })
        .eq('id', selectedLectura.id)

      if (error) {
        console.error('Error al asociar producto:', error)
        // Si falla, mostrar solo el cálculo
        if (producto) {
          const pesoEnUnidadProducto = producto.unidad_medida === 'gramos' 
            ? selectedLectura.peso * 1000 
            : selectedLectura.peso
          const totalCalculado = pesoEnUnidadProducto * producto.precio
          showAlert(`Cálculo (no guardado): ${selectedLectura.peso}kg de ${producto.nombre} = $${totalCalculado.toFixed(2)}. Error: ${error.message}`, 'error')
        }
      } else {
        showAlert('Producto asociado correctamente', 'success')
        // Recargar las lecturas para mostrar los cambios
        await fetchLecturasFromDB()
      }
      setIsDialogOpen(false)
      setSelectedLectura(null)
      setSelectedProducto('')
      setProductSearchTerm('')
      setShowProductSuggestions(false)
      // Ir a realizar venta para continuar el flujo
      router.push('/dashboard/ventas/nueva')
    } catch (error) {
      console.error('Error:', error)
      showAlert('Error al procesar la solicitud', 'error')
    }
  }

  // Enfoque automático del input al abrir el diálogo
  useEffect(() => {
    if (isDialogOpen) {
      setTimeout(() => productSearchRef.current?.focus(), 0)
    }
  }, [isDialogOpen])

  // Atajo: Enter abre el diálogo para la última lectura sin producto asociado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isDialogOpen) {
        // Buscar la lectura más reciente sin producto asociado
        const sinProducto = [...lecturas]
          .filter(l => !l.producto_id)
          .sort((a, b) => new Date(b.fecha_lectura).getTime() - new Date(a.fecha_lectura).getTime())
        if (sinProducto.length > 0) {
          e.preventDefault()
          setSelectedLectura(sinProducto[0])
          setSelectedProducto('')
          setProductSearchTerm('')
          setIsDialogOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lecturas, isDialogOpen])

  // Carga inicial y suscripción realtime
  useEffect(() => {
    fetchLecturasFromDB()
    fetchProductos()

    // Suscripción realtime: inserciones se reflejan al instante y cambios disparan refresh
    const channel = supabase
      .channel('lecturas_balanza_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tablaLecturas as any }, async () => {
        // Siempre traer la última lectura real desde BD para evitar desfasajes
        const ultima = await fetchUltimaLectura()
        if (ultima) {
          setLecturas(prev => [ultima, ...prev.filter(l => l.id !== ultima.id)].slice(0, 50))
        } else {
          fetchLecturasFromDB()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: tablaLecturas as any }, async () => {
        const ultima = await fetchUltimaLectura()
        if (ultima) {
          setLecturas(prev => [ultima, ...prev.filter(l => l.id !== ultima.id)].slice(0, 50))
        } else {
          fetchLecturasFromDB()
        }
      })
      .subscribe()

    return () => { try { supabase.removeChannel(channel) } catch {} }
  }, [tablaLecturas, columnaFecha])

  // Polling muy liviano como respaldo solo cuando la pestaña está visible
  useEffect(() => {
    let interval: any
    const start = () => {
      if (interval) return
      interval = setInterval(() => { if (!document.hidden) fetchLecturasFromDB() }, 1500)
    }
    const stop = () => { if (interval) { clearInterval(interval); interval = null } }
    start()
    const onVis = () => { if (document.hidden) stop(); else start() }
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // Lecturas del día y del mes
  const hoy = new Date()
  const lecturasMes = lecturas.filter(l => {
    const fecha = new Date(l.fecha_lectura)
    return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear()
  })
  const lecturasHoy = lecturas.filter(l => {
    const fecha = new Date(l.fecha_lectura)
    return fecha.getDate() === hoy.getDate() && fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear()
  })

  const filteredLecturas = lecturas.filter((lectura) => {
    const matchesSearch =
      (lectura.producto_nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lectura.producto_codigo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      lectura.fecha.toLowerCase().includes(searchTerm.toLowerCase())

    return matchesSearch
  })

  // Filtrar productos para el diálogo
  const filteredProductos = productos.filter((producto) => {
    const matchesProductSearch =
      producto.nombre.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      producto.codigo.toLowerCase().includes(productSearchTerm.toLowerCase())

    return matchesProductSearch
  })

  const totalPeso = filteredLecturas.reduce((sum, lectura) => sum + lectura.peso, 0)
  const totalValor = filteredLecturas.reduce((sum, lectura) => sum + (lectura.total_calculado || 0), 0)

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Fiambrería San Agustín", href: "/dashboard" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Lecturas de Balanza" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lecturas de Balanza</h1>
          <p className="text-gray-600">Monitoreo en tiempo real de los datos enviados por la balanza</p>
        </div>
        <div className="flex items-center space-x-2">
        </div>
      </div>

      {/* Sin conexión directa a dispositivo: solo datos desde Supabase */}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Pesajes del Mes</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{lecturasMes.length}</div>
              <p className="text-xs text-gray-500 mt-1">Total del mes actual</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Pesajes Hoy</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{lecturasHoy.length}</div>
              <p className="text-xs text-gray-500 mt-1">Del día actual</p>
            </div>
            <Weight className="h-8 w-8 text-green-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Peso Total</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{totalPeso.toFixed(2)}kg</div>
              <p className="text-xs text-gray-500 mt-1">Peso acumulado</p>
            </div>
            <Weight className="h-8 w-8 text-purple-500" />
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Valor Total</CardTitle>
              <div className="text-2xl font-bold text-gray-900">${totalValor.toLocaleString()}</div>
              <p className="text-xs text-gray-500 mt-1">Valor acumulado</p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-500" />
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Historial de Lecturas
          </CardTitle>
          <CardDescription>Datos recibidos de la balanza en tiempo real</CardDescription>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por producto, código o fecha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Cargando lecturas...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Fecha</TableHead>
                    <TableHead className="min-w-[80px]">Peso (kg)</TableHead>
                    <TableHead className="min-w-[120px]">Producto</TableHead>
                    <TableHead className="hidden sm:table-cell">Código</TableHead>
                    <TableHead className="hidden md:table-cell">Precio/Unidad</TableHead>
                    <TableHead className="min-w-[100px]">Total</TableHead>
                    <TableHead className="min-w-[80px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {filteredLecturas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No hay lecturas de balanza registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLecturas.map((lectura) => (
                    <TableRow key={lectura.id}>
                      <TableCell className="font-mono text-xs sm:text-sm">{lectura.fecha}</TableCell>
                      <TableCell className="font-semibold">
                        {lectura.peso.toFixed(3)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="truncate max-w-[120px]">
                          {lectura.producto_nombre || (
                            <span className="text-gray-400 italic">Sin producto</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono hidden sm:table-cell">
                        {lectura.producto_codigo || '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {lectura.precio_por_unidad ? (
                          `$${lectura.precio_por_unidad.toLocaleString()}/${lectura.unidad_medida || 'kg'}`
                        ) : '-'}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {lectura.total_calculado ? (
                          `$${lectura.total_calculado.toFixed(2)}`
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedLectura(lectura)
                            setSelectedProducto(lectura.producto_id || '')
                            setIsDialogOpen(true)
                          }}
                          className="w-full sm:w-auto"
                        >
                          <Link className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">{lectura.producto_id ? 'Cambiar' : 'Asociar'}</span>
                          <span className="sm:hidden">+</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diálogo para asociar producto */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Asociar Producto con Lectura
            </DialogTitle>
            <DialogDescription>
              Selecciona un producto para calcular el valor total basado en el peso registrado.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLectura && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Datos de la Lectura</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><strong>Fecha:</strong> {selectedLectura.fecha}</div>
                  <div><strong>Peso:</strong> {selectedLectura.peso.toFixed(3)} kg</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="producto-search">Buscar y Seleccionar Producto</Label>
                
                {/* Campo de búsqueda con autocompletado */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="producto-search"
                    placeholder="Escribe el nombre o código del producto..."
                    value={productSearchTerm}
                    ref={productSearchRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // Intentar match exacto por código
                        const exact = productos.find(p => p.codigo.toLowerCase() === productSearchTerm.toLowerCase())
                        if (exact) {
                          setSelectedProducto(exact.id)
                          setProductSearchTerm(`${exact.nombre} (${exact.codigo})`)
                          setShowProductSuggestions(false)
                          // Asociar de inmediato
                          setTimeout(() => handleAsociarProducto(), 0)
                          return
                        }
                        // Si no hay exacto, tomar el primer sugerido si existe
                        if (filteredProductos.length > 0) {
                          const first = filteredProductos[0]
                          setSelectedProducto(first.id)
                          setProductSearchTerm(`${first.nombre} (${first.codigo})`)
                          setShowProductSuggestions(false)
                          setTimeout(() => handleAsociarProducto(), 0)
                        }
                      }
                    }}
                    onChange={(e) => {
                      setProductSearchTerm(e.target.value)
                      setShowProductSuggestions(e.target.value.length > 0)
                      if (e.target.value.length === 0) {
                        setSelectedProducto('')
                      }
                    }}
                    onFocus={() => setShowProductSuggestions(productSearchTerm.length > 0)}
                    className="pl-10"
                  />
                  
                  {/* Lista de sugerencias */}
                  {showProductSuggestions && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredProductos.length === 0 ? (
                        <div className="p-3 text-center text-gray-500 text-sm">
                          No se encontraron productos
                        </div>
                      ) : (
                        filteredProductos.map((producto) => (
                          <div
                            key={producto.id}
                            className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            onClick={() => {
                              setSelectedProducto(producto.id)
                              setProductSearchTerm(`${producto.nombre} (${producto.codigo})`)
                              setShowProductSuggestions(false)
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">{producto.nombre}</span>
                              <span className="text-sm text-gray-500">
                                {producto.codigo} - ${producto.precio.toLocaleString()}/{producto.unidad_medida}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                
                {productSearchTerm && !selectedProducto && (
                  <div className="text-xs text-gray-500">
                    {filteredProductos.length} producto{filteredProductos.length !== 1 ? 's' : ''} encontrado{filteredProductos.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {selectedProducto && (() => {
                const producto = productos.find(p => p.id === selectedProducto)
                if (!producto) return null
                
                const pesoEnUnidadProducto = producto.unidad_medida === 'gramos' 
                  ? selectedLectura.peso * 1000 
                  : selectedLectura.peso
                
                const totalCalculado = pesoEnUnidadProducto * producto.precio
                
                return (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 text-blue-800">Cálculo del Valor</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Producto:</span>
                        <span className="font-medium">{producto.nombre}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Código:</span>
                        <span className="font-mono">{producto.codigo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Peso:</span>
                        <span>{pesoEnUnidadProducto.toFixed(3)} {producto.unidad_medida}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Precio por {producto.unidad_medida}:</span>
                        <span>${producto.precio.toLocaleString()}</span>
                      </div>
                      <hr className="my-2" />
                      <div className="flex justify-between font-bold text-blue-800">
                        <span>Total:</span>
                        <span>${totalCalculado.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAsociarProducto}
              disabled={!selectedProducto}
            >
              Asociar Producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
