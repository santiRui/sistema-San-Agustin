"use client"

import { useState, useEffect } from "react"
import { useSession } from "@/components/SessionProvider"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit, Trash2, Search, Package, FileText } from "lucide-react"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { useAlert } from "@/components/AlertProvider"

interface Producto {
  id?: string;
  codigo?: string;
  nombre?: string;
  id_categoria?: string;
  precio?: number;
  stock?: number;
  unidad_medida?: string;
  stock_minimo?: number;
  descripcion?: string;
}

interface Categoria {
  id: string;
  nombre: string;
}

export default function ProductosPage() {
  const { role } = useSession();
  const canManageProducts = role === "administrador" || role === "encargado";

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [formData, setFormData] = useState<Partial<Producto>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const { showAlert } = useAlert();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{ ventaId: string; fecha: string; ts: number; cantidad: number; unidad: string; precio: number; subtotal: number }>>([]);
  const [historyProduct, setHistoryProduct] = useState<Producto | null>(null);
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");
  const [filterFromTime, setFilterFromTime] = useState<string>("");
  const [filterToTime, setFilterToTime] = useState<string>("");
  

  const fetchProductos = async () => {
    setIsLoading(true);
    // Cargar productos
    const { data: productsData, error: productsError } = await supabase.from("productos").select("*").order('nombre', { ascending: true });
    if (productsData) setProductos(productsData);

    setIsLoading(false);
  };

  const fetchCategorias = async () => {
    const { data, error } = await supabase.from('categorias').select('id, nombre').order('nombre');
    if (error) {
      showAlert('Error al cargar categorías: ' + error.message, 'error');
    } else {
      setCategorias(data || []);
    }
  };

  useEffect(() => {
    fetchProductos();
    fetchCategorias();
  }, []);

  const normalize = (v: any) => (v ?? "").toString().toLowerCase().trim();
  const term = normalize(searchTerm);

  const score = (p: Producto) => {
    const n = normalize(p.nombre);
    const c = normalize(p.codigo);
    let s = 0;
    if (c === term) s += 4; // coincidencia exacta por código
    if (n === term) s += 3; // coincidencia exacta por nombre
    if (c.startsWith(term)) s += 2; // prefijo por código
    if (n.startsWith(term)) s += 1; // prefijo por nombre
    return -s; // menor primero al ordenar
  };

  const priorityByStock = (p: Producto) => {
    const stock = p.stock || 0;
    const min = p.stock_minimo || 0;
    if (stock < min) return 0; // bajo stock (rojo)
    if (stock === min) return 1; // en mínimo (amarillo)
    return 2; // resto
  };

  const openHistory = async (product: Producto) => {
    if (!product?.id) return;
    setHistoryProduct(product);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    // Reset filtros al abrir
    setFilterFromDate("");
    setFilterToDate("");
    setFilterFromTime("");
    setFilterToTime("");
    try {
      const { data, error } = await supabase
        .from('detalles_ventas')
        .select(`cantidad, unidad_medida, precio_unitario, subtotal, ventas ( id, created_at )` as any)
        .eq('id_producto', product.id)
        .order('id', { ascending: false });
      if (error) {
        showAlert('Error al cargar historial: ' + error.message, 'error');
        setHistoryItems([]);
      } else {
        const items = (data || []).map((row: any) => {
          const created = Array.isArray(row.ventas) ? row.ventas[0]?.created_at : row.ventas?.created_at;
          const ts = created ? new Date(created).getTime() : 0;
          return {
            ventaId: (Array.isArray(row.ventas) ? row.ventas[0]?.id : row.ventas?.id) || '',
            fecha: created ? new Date(created).toLocaleString('es-AR') : '',
            ts,
            cantidad: Number(row.cantidad || 0),
            unidad: String(row.unidad_medida || ''),
            precio: Number(row.precio_unitario || 0),
            subtotal: Number(row.subtotal || 0),
          };
        });
        items.sort((a: any, b: any) => b.ts - a.ts);
        setHistoryItems(items);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredHistoryItems = (() => {
    if (historyItems.length === 0) return [] as typeof historyItems;
    let fromTs: number | null = null;
    let toTs: number | null = null;
    if (filterFromDate) {
      const [y, m, d] = filterFromDate.split('-').map(Number);
      const [hh = 0, mm = 0] = (filterFromTime || '00:00').split(':').map(Number);
      fromTs = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0).getTime();
    }
    if (filterToDate) {
      const [y, m, d] = filterToDate.split('-').map(Number);
      const [hh = 23, mm = 59] = (filterToTime || '23:59').split(':').map(Number);
      toTs = new Date(y, (m || 1) - 1, d || 1, hh, mm, 59).getTime();
    }
    return historyItems.filter(it => {
      if (fromTs !== null && it.ts < fromTs) return false;
      if (toTs !== null && it.ts > toTs) return false;
      return true;
    });
  })();

  const filteredProducts = productos
    .filter((product) => {
      const nombre = normalize(product.nombre);
      const codigo = normalize(product.codigo);
      const descripcion = normalize(product.descripcion);
      const categoria = normalize(categorias.find((c) => c.id === product.id_categoria)?.nombre);

      if (!term) return true;

      return (
        codigo.includes(term) ||
        nombre.includes(term) ||
        descripcion.includes(term) ||
        categoria.includes(term)
      );
    })
    .sort((a, b) => {
      if (lowStockFilter) {
        const prioDiff = priorityByStock(a) - priorityByStock(b);
        if (prioDiff !== 0) return prioDiff;
      }
      return score(a) - score(b);
    });

  const handleOpenDialog = (product?: Producto) => {
    if (product) {
      setEditingProducto(product);
      setFormData(product);
    } else {
      setEditingProducto(null);
      setFormData({
        codigo: "",
        nombre: "",
        id_categoria: "",
        precio: 0,
        stock: 0,
        unidad_medida: "unidad",
        stock_minimo: 0,
        descripcion: "",
      });
    }
    setIsDialogOpen(true);
  };

      const handleSaveProduct = async () => {
    if (!formData.nombre || !formData.id_categoria) {
      showAlert('Nombre y categoría son campos obligatorios.', 'error');
      return;
    }

    const { id, ...productData } = formData;

    try {
      let successMessage = '';
      if (editingProducto) {
        const { error } = await supabase.from("productos").update(productData).eq("id", editingProducto.id);
        if (error) throw error;
        successMessage = 'Producto actualizado con éxito.';
      } else {
        const { error } = await supabase.from("productos").insert(productData);
        if (error) throw error;
        successMessage = 'Producto creado con éxito.';
      }
      
      await fetchProductos();
      showAlert(successMessage, 'success');
      setIsDialogOpen(false);
      setFormData({});
      setEditingProducto(null);
    } catch (error: any) {
      showAlert(`Error al guardar el producto: ${error.message}`, 'error');
    }
  };

    const handleDeleteProduct = async (id: string | undefined) => {
    if (!id) {
      showAlert('No se puede eliminar un producto sin ID.', 'error');
      return;
    }

    try {
      const { error } = await supabase.from("productos").delete().eq("id", id);
      if (error) throw error;

      await fetchProductos();
      showAlert('Producto eliminado con éxito.', 'success');
    } catch (error: any) {
      showAlert(`Error al eliminar el producto: ${error.message}`, 'error');
    }
  };

  const handleFormChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Fiambrería San Agustín", href: "/dashboard" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Productos" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-600">Gestiona el inventario de productos de la fiambrería</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} disabled={!canManageProducts} className="bg-gray-900 hover:bg-gray-800">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProducto ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
              <DialogDescription>
                {editingProducto
                  ? "Modifica los datos del producto seleccionado"
                  : "Completa los datos del nuevo producto"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="codigo">Código</Label>
                <Input id="codigo" name="codigo" value={formData.codigo || ''} onChange={handleFormChange} placeholder="PROD-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" value={formData.nombre || ''} onChange={handleFormChange} placeholder="Jamón Crudo" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="id_categoria">Categoría</Label>
                <Select name="id_categoria" value={formData.id_categoria || ''} onValueChange={(value) => handleFormChange({ target: { name: 'id_categoria', value } } as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="precio">Precio</Label>
                <Input id="precio" name="precio" type="number" value={formData.precio || ''} onChange={handleFormChange} placeholder="5700" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stock">Stock</Label>
                <Input id="stock" name="stock" type="number" value={formData.stock || ''} onChange={handleFormChange} placeholder="15" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unidad_medida">Unidad de Medida</Label>
                <Select name="unidad_medida" value={formData.unidad_medida || ''} onValueChange={(value) => handleFormChange({ target: { name: 'unidad_medida', value } } as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione una unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kilogramo">Kilogramo</SelectItem>
                    <SelectItem value="gramo">Gramo</SelectItem>
                    <SelectItem value="unidad">Unidad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stock_minimo">Stock Mínimo</Label>
                <Input id="stock_minimo" name="stock_minimo" type="number" value={formData.stock_minimo || ''} onChange={handleFormChange} placeholder="5" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea id="descripcion" name="descripcion" value={formData.descripcion || ''} onChange={handleFormChange} placeholder="Jamón crudo premium importado" />
              </div>
            </div>
            <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveProduct} className="bg-gray-900 hover:bg-gray-800">
                {editingProducto ? "Actualizar Producto" : "Crear Producto"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lista de Productos
          </CardTitle>
          <CardDescription>Total de productos: {productos.length}</CardDescription>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por código o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Button
              onClick={() => setLowStockFilter((v) => !v)}
              className={lowStockFilter ? "bg-red-600 hover:bg-red-700" : "border border-red-600 text-red-600 hover:bg-red-50"}
              variant={lowStockFilter ? "default" : "outline"}
            >
              Filtrar por bajo stock
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Unidad de Medida</TableHead>
                <TableHead>Stock Mínimo</TableHead>
                {canManageProducts && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((producto) => (
                <TableRow key={producto.id}>
                  <TableCell>{producto.codigo || 'N/A'}</TableCell>
                  <TableCell className="font-medium">{producto.nombre || 'N/A'}</TableCell>
                  <TableCell>{categorias.find(c => c.id === producto.id_categoria)?.nombre || 'N/A'}</TableCell>
                  <TableCell>${(producto.precio || 0).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const stock = producto.stock || 0;
                        const min = producto.stock_minimo || 0;
                        const isLow = stock < min;
                        const isAtMin = stock === min;
                        const textClass = isLow
                          ? "text-red-600 font-semibold"
                          : isAtMin
                          ? "text-yellow-600 font-semibold"
                          : "";
                        return (
                          <>
                            <span className={textClass}>{stock}</span>
                            {isLow && (
                              <Badge variant="destructive" className="bg-red-500 text-white text-xs">Bajo</Badge>
                            )}
                            {isAtMin && (
                              <Badge className="bg-yellow-400 text-black text-xs">Mínimo</Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>{producto.unidad_medida || 'N/A'}</TableCell>
                  <TableCell>{producto.stock_minimo || 0}</TableCell>
                  {canManageProducts && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => openHistory(producto)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleOpenDialog(producto)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Está seguro que desea eliminar este producto?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción eliminará permanentemente el producto{" "}
                                <span className="font-semibold">"{producto.nombre || 'Sin Nombre'}"</span> con código{" "}
                                <span className="font-mono font-semibold">{producto.id || 'N/A'}</span>. Esta acción no se puede
                                deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteProduct(producto.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Eliminar Producto
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historial de ventas — {historyProduct?.nombre || ''}</DialogTitle>
            <DialogDescription>Listado de cantidades vendidas con fecha y hora</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div>
                <Label>Desde (fecha)</Label>
                <Input type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)} />
              </div>
              <div>
                <Label>Desde (hora)</Label>
                <Input type="time" value={filterFromTime} onChange={(e) => setFilterFromTime(e.target.value)} />
              </div>
              <div>
                <Label>Hasta (fecha)</Label>
                <Input type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)} />
              </div>
              <div>
                <Label>Hasta (hora)</Label>
                <Input type="time" value={filterToTime} onChange={(e) => setFilterToTime(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setFilterFromDate(""); setFilterFromTime(""); setFilterToDate(""); setFilterToTime(""); }}>Limpiar filtros</Button>
            </div>
            {historyLoading ? (
              <div className="py-8 text-center text-gray-500">Cargando...</div>
            ) : filteredHistoryItems.length === 0 ? (
              <div className="py-8 text-center text-gray-500">Sin registros de ventas</div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha y hora</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead>Venta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistoryItems.map((it, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{it.fecha}</TableCell>
                        <TableCell className="text-right">{it.cantidad}</TableCell>
                        <TableCell>{it.unidad}</TableCell>
                        <TableCell className="text-right">${it.precio.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${it.subtotal.toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{it.ventaId || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
