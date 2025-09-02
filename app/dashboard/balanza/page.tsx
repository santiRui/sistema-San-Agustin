"use client"

import { useState, useEffect } from "react"
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
  const [lecturas, setLecturas] = useState<LecturaBalanza[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [pesoActual, setPesoActual] = useState(0.0)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedLectura, setSelectedLectura] = useState<LecturaBalanza | null>(null)
  const [selectedProducto, setSelectedProducto] = useState<string>('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [showProductSuggestions, setShowProductSuggestions] = useState(false)
  const { showAlert } = useAlert()

  // Cargar datos de la base de datos
  const fetchLecturasFromDB = async () => {
    try {
      setIsLoading(true)
      
      // Primero intentar una consulta simple para verificar si la tabla existe
      const { data: testData, error: testError } = await supabase
        .from('lecturas_balanza')
        .select('id')
        .limit(1)

      if (testError) {
        console.error('Error al acceder a lecturas_balanza:', testError)
        // Si la tabla no existe, crear datos de ejemplo
        const ejemploLecturas: LecturaBalanza[] = [
          {
            id: '1',
            fecha: new Date().toLocaleString('es-AR'),
            peso: 0.5,
            fecha_lectura: new Date().toISOString()
          },
          {
            id: '2', 
            fecha: new Date(Date.now() - 3600000).toLocaleString('es-AR'),
            peso: 1.2,
            fecha_lectura: new Date(Date.now() - 3600000).toISOString()
          }
        ]
        setLecturas(ejemploLecturas)
        showAlert('Tabla lecturas_balanza no encontrada. Mostrando datos de ejemplo.', 'error')
        return
      }

      // Si la tabla existe, hacer la consulta completa (intentar con producto_id)
      let lecturasData, lecturasError
      
      // Primero intentar con producto_id
      const queryWithProduct = await supabase
        .from('lecturas_balanza')
        .select(`
          id,
          fecha_lectura,
          peso,
          producto_id
        `)
        .order('fecha_lectura', { ascending: false })
        .limit(50)
      
      if (queryWithProduct.error && queryWithProduct.error.message.includes('producto_id')) {
        // Si falla, intentar sin producto_id
        const queryWithoutProduct = await supabase
          .from('lecturas_balanza')
          .select(`
            id,
            fecha_lectura,
            peso
          `)
          .order('fecha_lectura', { ascending: false })
          .limit(50)
        
        lecturasData = queryWithoutProduct.data
        lecturasError = queryWithoutProduct.error
        console.log('Columna producto_id no existe, usando consulta básica')
      } else {
        lecturasData = queryWithProduct.data
        lecturasError = queryWithProduct.error
      }

      if (lecturasError) {
        console.error('Error al cargar lecturas:', lecturasError)
        showAlert(`Error al cargar lecturas: ${lecturasError.message}`, 'error')
        return
      }

      // Si hay lecturas, intentar obtener información de productos asociados
      const lecturasConProductos = []
      for (const lectura of lecturasData || []) {
        let productoInfo = null
        
        // Solo buscar producto si la columna producto_id existe y tiene valor
        if ((lectura as any).producto_id) {
          const { data: productoData } = await supabase
            .from('productos')
            .select('id, codigo, nombre, precio, unidad_medida')
            .eq('id', (lectura as any).producto_id)
            .single()
          
          productoInfo = productoData
        }

        lecturasConProductos.push({
          id: lectura.id.toString(),
          fecha: new Date(lectura.fecha_lectura).toLocaleString('es-AR'),
          peso: lectura.peso,
          producto_id: (lectura as any).producto_id || null,
          producto_nombre: productoInfo?.nombre,
          producto_codigo: productoInfo?.codigo,
          precio_por_unidad: productoInfo?.precio,
          unidad_medida: productoInfo?.unidad_medida,
          total_calculado: productoInfo?.precio ? (lectura.peso * productoInfo.precio) : 0,
          fecha_lectura: lectura.fecha_lectura
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
        .from('lecturas_balanza')
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

  // Función para conectar con la balanza en tiempo real (opcional)
  const fetchBalanzaData = async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch("http://localhost:3000/lectura", {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        if (typeof data.peso === "number") {
          setPesoActual(data.peso)
          setIsConnected(true)
        }
      }
    } catch (error) {
      setIsConnected(false)
    }
  }

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
        .from('lecturas_balanza')
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
    } catch (error) {
      console.error('Error:', error)
      showAlert('Error al procesar la solicitud', 'error')
    }
  }

  useEffect(() => {
    fetchLecturasFromDB()
    fetchProductos()
    
    // Intentar conectar con la balanza
    fetchBalanzaData()
    const interval = setInterval(fetchBalanzaData, 3000)
    
    return () => clearInterval(interval)
  }, [])

  // Lecturas del día actual
  const hoy = new Date()
  const lecturasHoy = lecturas.filter(l => {
    const fecha = new Date(l.fecha_lectura)
    return fecha.getDate() === hoy.getDate() && fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear()
  })
  // Lecturas del mes actual
  const lecturasMes = lecturas.filter(l => {
    const fecha = new Date(l.fecha_lectura)
    return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear()
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

      {/* Banner de conexión */}
      {isConnected ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium text-green-800">Balanza Conectada</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            Recibiendo datos... Peso actual: <strong>{pesoActual.toFixed(3)} kg</strong>
          </p>
        </div>
      ) : null}

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
