"use client"

import { useState, useEffect } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit, Trash2, Search, Tag } from "lucide-react"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { supabase } from "@/lib/supabaseClient"
import { useAlert } from "@/components/AlertProvider"

interface Categoria {
  id?: string;
  nombre?: string;
  descripcion?: string;
  productos: { count: number }[];
}

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
    const [formData, setFormData] = useState<Partial<Categoria>>({});
  const { showAlert } = useAlert();

  const fetchCategorias = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("categorias")
      .select("*, productos(count)")
      .order("nombre");

    if (error) {
      showAlert("Error al cargar categorías: " + error.message, 'error');
    } else {
      setCategorias(data as Categoria[] || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCategorias();
  }, []);

  const filteredCategorias = categorias.filter((categoria) =>
    categoria.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    categoria.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (categoria?: Categoria) => {
    if (categoria) {
      setEditingCategoria(categoria)
      setFormData(categoria)
    } else {
      setEditingCategoria(null)
      setFormData({
        nombre: "",
        descripcion: "",
      });
    }
    setIsDialogOpen(true)
  }

        const handleSaveCategoria = async () => {
    try {
      const categoriaData = { ...formData };

      if (editingCategoria) {
        const { productos, id, ...updateData } = categoriaData;
        const { error } = await supabase.from("categorias").update(updateData).eq("id", editingCategoria.id);
        if (error) throw error;
        showAlert('Categoría actualizada con éxito', 'success');
      } else {
        const { id, ...newCategoriaData } = categoriaData;
        const { error } = await supabase.from("categorias").insert(newCategoriaData as any);
        if (error) throw error;
        showAlert('Categoría creada con éxito', 'success');
      }

      await fetchCategorias();
      setIsDialogOpen(false);
      setFormData({});
      setEditingCategoria(null);

    } catch (error: any) {
      showAlert(error.message || 'Ocurrió un error inesperado al guardar.', 'error');
    }
  };

    const handleDeleteCategoria = async (id: string | undefined) => {
    if (!id) {
      showAlert('No se puede eliminar una categoría sin ID.', 'error');
      return;
    }
        const { error } = await supabase.from("categorias").delete().eq("id", id);
    if (error) {
      showAlert(`Error al eliminar: ${error.message}`, 'error');
    } else {
      showAlert('Categoría eliminada con éxito', 'success');
      await fetchCategorias();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Fiambrería San Agustín", href: "/dashboard" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Categorías" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Categorías</h1>
          <p className="text-gray-600">Gestiona las categorías de productos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="bg-gray-900 hover:bg-gray-800">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Categoría
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCategoria ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
              <DialogDescription>
                {editingCategoria
                  ? "Modifica los datos de la categoría seleccionada"
                  : "Completa los datos de la nueva categoría"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={formData.nombre || ""}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Fiambres"
                />
              </div>
              <div>
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea
                  id="descripcion"
                  value={formData.descripcion || ""}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  placeholder="Productos de fiambrería tradicional"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
                            <Button onClick={() => { console.log('Botón Guardar presionado'); handleSaveCategoria(); }} className="bg-gray-900 hover:bg-gray-800">
                {editingCategoria ? "Actualizar Categoría" : "Crear Categoría"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-gray-600">Total Categorías</CardTitle>
              <div className="text-2xl font-bold text-gray-900">{categorias.length}</div>
              <p className="text-xs text-gray-500 mt-1">Categorías creadas</p>
            </div>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Lista de Categorías
          </CardTitle>
          <CardDescription>Total de categorías: {categorias.length}</CardDescription>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar categorías..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategorias.map((categoria) => (
                <TableRow key={categoria.id}>
                  <TableCell className="font-medium">{categoria.nombre}</TableCell>
                  <TableCell>{categoria.descripcion}</TableCell>
                  <TableCell>{categoria.productos[0]?.count ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => handleOpenDialog(categoria)}>
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
                            <AlertDialogTitle>¿Está seguro que desea eliminar esta categoría?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción eliminará permanentemente la categoría{" "}
                              <span className="font-semibold">"{categoria.nombre}"</span>. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteCategoria(categoria.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Eliminar Categoría
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
