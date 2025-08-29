"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { Plus, Edit, Trash2, Search, User } from "lucide-react"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { supabase } from "@/lib/supabaseClient"
import { useAlert } from "@/components/AlertProvider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface Cliente {
  id?: string;
  nombre?: string;
  apellido?: string;
  tipo_documento?: string;
  numero_documento?: string;
  telefono?: string;
  correo_electronico?: string;
  direccion?: string;
  tipo_cliente?: 'minorista' | 'mayorista';
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState<Partial<Cliente>>({});
  const { showAlert } = useAlert();

  const fetchClientes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from("clientes").select("*").order("apellido");
    if (error) {
      showAlert("Error al cargar clientes: " + error.message, 'error');
    } else {
      setClientes(data as Cliente[] || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const filteredClientes = clientes.filter((cliente) =>
    cliente.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.apellido?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.correo_electronico?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.numero_documento?.includes(searchTerm)
  );

  const handleOpenDialog = (cliente?: Cliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      setFormData(cliente);
    } else {
      setEditingCliente(null);
      setFormData({
        nombre: "",
        apellido: "",
        tipo_documento: "DNI",
        numero_documento: "",
        telefono: "",
        correo_electronico: "",
        direccion: "",
        tipo_cliente: "minorista",
      });
    }
    setIsDialogOpen(true);
  }

  const handleSaveCliente = async () => {
    try {
      const { id, ...updateData } = formData;

      if (editingCliente) {
        const { error } = await supabase.from("clientes").update(updateData).eq("id", editingCliente.id);
        if (error) throw error;
        showAlert('Cliente actualizado con éxito', 'success');
      } else {
        const { error } = await supabase.from("clientes").insert(updateData);
        if (error) throw error;
        showAlert('Cliente creado con éxito', 'success');
      }
      await fetchClientes();
      setIsDialogOpen(false);
    } catch (error: any) {
      showAlert(error.message || 'Ocurrió un error inesperado.', 'error');
    }
  };

  const handleDeleteCliente = async (id: string | undefined) => {
    if (!id) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      showAlert(`Error al eliminar: ${error.message}`, 'error');
    } else {
      showAlert('Cliente eliminado con éxito', 'success');
      await fetchClientes();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Clientes" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-gray-600">Gestiona los clientes del negocio.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}><Plus className="h-4 w-4 mr-2" />Nuevo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCliente ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Nombre</Label><Input value={formData.nombre || ""} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} /></div>
                <div><Label>Apellido</Label><Input value={formData.apellido || ""} onChange={(e) => setFormData({ ...formData, apellido: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Tipo Documento</Label><Input value={formData.tipo_documento || ""} onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value })} /></div>
                <div><Label>N° Documento</Label><Input value={formData.numero_documento || ""} onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={formData.correo_electronico || ""} onChange={(e) => setFormData({ ...formData, correo_electronico: e.target.value })} /></div>
              <div><Label>Teléfono</Label><Input value={formData.telefono || ""} onChange={(e) => setFormData({ ...formData, telefono: e.target.value })} /></div>
              <div><Label>Dirección</Label><Textarea value={formData.direccion || ""} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} /></div>
              <div>
                <Label>Tipo de Cliente</Label>
                <Select value={formData.tipo_cliente || 'minorista'} onValueChange={(value) => setFormData({ ...formData, tipo_cliente: value as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minorista">Minorista</SelectItem>
                    <SelectItem value="mayorista">Mayorista</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveCliente}>{editingCliente ? "Actualizar" : "Crear"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User />Lista de Clientes</CardTitle>
          <div className="flex items-center space-x-2 pt-4">
            <Search className="h-5 w-5 text-gray-400" />
            <Input placeholder="Buscar por nombre, documento, email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre Completo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center">Cargando...</TableCell></TableRow>
              ) : filteredClientes.length > 0 ? (
                filteredClientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{cliente.apellido}, {cliente.nombre}</TableCell>
                    <TableCell>{cliente.numero_documento}</TableCell>
                    <TableCell>{cliente.correo_electronico}</TableCell>
                    <TableCell><Badge variant={cliente.tipo_cliente === 'mayorista' ? 'default' : 'secondary'}>{cliente.tipo_cliente}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={() => handleOpenDialog(cliente)}><Edit className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle></AlertDialogHeader>
                            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteCliente(cliente.id)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="text-center">No se encontraron clientes.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
