"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Check, ChevronsUpDown } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { Plus, Trash2, Save } from "lucide-react"
import { useAlert } from "@/components/AlertProvider"
import { cn } from "@/lib/utils"

interface Proveedor { id: string; nombre: string }
interface Producto { id: number; codigo?: string | null; nombre: string; precio: number; unidad_medida: string; stock: number }

interface ItemSalida {
  productoId: number
  nombre?: string
  unidad?: string
  precioUnit: number
  cantidad: number
  subtotal: number
}

export default function RegistrarSalidaPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedorNombre, setProveedorNombre] = useState<string>("")
  const [numeroFactura, setNumeroFactura] = useState<string>("")
  const [fecha, setFecha] = useState<string>(new Date().toISOString().slice(0,10))
  const [items, setItems] = useState<ItemSalida[]>([])
  const [saving, setSaving] = useState(false)
  const { showAlert } = useAlert()
  const [openRow, setOpenRow] = useState<number | null>(null)

  // unidades permitidas según la unidad base del producto en BD
  const allowedUnitsFor = (base: string | null | undefined): string[] => {
    const b = (base || '').toLowerCase()
    if (b === 'unidad' || b === 'u' || b === 'unidades') return ['unidad']
    if (b === 'kg' || b === 'kilo' || b === 'kilogramo') return ['kg', 'g']
    if (b === 'g' || b === 'gramo' || b === 'gramos') return ['g']
    // fallback: restringir a unidad
    return ['unidad']
  }
  const unitLabel = (u: string) => (u === 'kg' ? 'Kg' : u === 'g' ? 'Gr' : 'Unidad')

  useEffect(() => {
    const load = async () => {
      const [{ data: provs }, { data: prods }] = await Promise.all([
        supabase.from('proveedores').select('id,nombre').order('nombre'),
        supabase.from('productos').select('id,codigo,nombre,precio,unidad_medida,stock').order('nombre')
      ])
      setProveedores((provs || []) as any)
      setProductos((prods || []) as any)
      setItems([{ productoId: 0, precioUnit: 0, cantidad: 1, subtotal: 0 }])
    }
    load()
  }, [])

  const throwIfError = (err: any, ctx: string) => {
    if (err) {
      const msg = err?.message || err?.hint || err?.details || JSON.stringify(err)
      throw new Error(`${ctx}: ${msg}`)
    }
  }

  const total = useMemo(() => items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0), [items])

  const setItem = (idx: number, patch: Partial<ItemSalida>) => {
    setItems((prev) => {
      const next = [...prev]
      const cur = { ...next[idx], ...patch }
      const precioUnit = Number(cur.precioUnit) || 0
      const cantidad = Number(cur.cantidad) || 0
      cur.subtotal = +(precioUnit * cantidad)
      // actualizar nombre desde catálogo
      if (patch.productoId !== undefined) {
        const p = productos.find(p => p.id === (patch.productoId as number))
        cur.nombre = p?.nombre
        // set unidad por defecto según producto si viene vacía o incompatible
        if (p) {
          const allowed = allowedUnitsFor(p.unidad_medida)
          if (!cur.unidad || !allowed.includes(cur.unidad)) {
            cur.unidad = allowed[0]
          }
          if (!cur.precioUnit || cur.precioUnit === 0) cur.precioUnit = p.precio || 0
        }
      }
      // si se cambia la unidad manualmente, validar contra producto
      if (patch.unidad !== undefined && cur.productoId) {
        const p = productos.find(p => p.id === cur.productoId)
        if (p) {
          const allowed = allowedUnitsFor(p.unidad_medida)
          if (!allowed.includes(patch.unidad!)) {
            // si no es permitida, forzar a primera permitida
            cur.unidad = allowed[0]
          }
        }
      }
      next[idx] = cur
      return next
    })
  }

  const addItem = () => setItems((prev) => [...prev, { productoId: 0, precioUnit: 0, cantidad: 1, subtotal: 0 }])
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const canSave = proveedorNombre.trim() && numeroFactura && items.length > 0 && items.every(i => i.productoId > 0 && i.cantidad > 0)

  const handleSave = async () => {
    if (!canSave) { showAlert('Complete proveedor, número de factura y al menos un ítem válido.', 'error'); return }
    try {
      setSaving(true)
      // buscar o crear proveedor por nombre
      const nombreProv = proveedorNombre.trim()
      let proveedorId: string | null = null
      if (nombreProv) {
        const { data: provFound, error: provErr } = await supabase
          .from('proveedores')
          .select('id')
          .ilike('nombre', nombreProv)
          .limit(1)
          .maybeSingle()
        if (provErr && provErr.code !== 'PGRST116') throwIfError(provErr, 'Buscar proveedor')
        if (provFound && (provFound as any).id) {
          proveedorId = (provFound as any).id
        } else {
          const { data: provNew, error: provNewErr } = await supabase
            .from('proveedores')
            .insert({ nombre: nombreProv })
            .select('id')
            .single()
          throwIfError(provNewErr, 'Crear proveedor')
          proveedorId = (provNew as any).id
        }
      }

      // crear salida
      // Validar duplicado proveedor + número de factura
      if (proveedorId) {
        const { data: dup, error: dupErr } = await supabase
          .from('salidas')
          .select('id')
          .eq('proveedor_id', proveedorId)
          .eq('numero_factura', numeroFactura)
          .limit(1)
          .maybeSingle()
        if (!dupErr && dup) {
          showAlert('Ya existe una factura con ese proveedor y número. Cambie proveedor o número de factura.', 'error')
          setSaving(false)
          return
        }
        if (dupErr && dupErr.code !== 'PGRST116') {
          throwIfError(dupErr, 'Verificar duplicado')
        }
      }

      const { data: salida, error: errSalida } = await supabase.from('salidas').insert({
        proveedor_id: proveedorId,
        numero_factura: numeroFactura,
        fecha: fecha,
        total: total,
      }).select('id').single()
      throwIfError(errSalida, 'Crear salida')

      if (!salida) {
        throw new Error('Crear salida: respuesta vacía')
      }
      const salidaId = (salida as { id: string }).id

      // crear detalles y actualizar stock
      for (const it of items) {
        const p = productos.find(p => p.id === it.productoId)
        const precio = Number(it.precioUnit) || 0
        const cantidad = Number(it.cantidad) || 0
        const subtotal = Number(it.subtotal) || 0

        const { error: detErr } = await supabase.from('detalles_salidas').insert({
          id_salida: salidaId,
          id_producto: it.productoId,
          unidad_medida: it.unidad || (p?.unidad_medida ?? 'unidad'),
          precio_unitario: precio,
          cantidad,
          subtotal,
        })
        throwIfError(detErr, 'Crear detalle de salida')

        // actualizar stock (ingreso de mercadería: suma)
        const { error: stockErr } = await supabase.from('productos').update({
          stock: (p?.stock || 0) + cantidad
        }).eq('id', it.productoId)
        throwIfError(stockErr, 'Actualizar stock')
      }

      showAlert('Salida registrada y stock actualizado.', 'success')
      // reset
      setProveedorNombre("")
      setNumeroFactura("")
      setItems([{ productoId: 0, precioUnit: 0, cantidad: 1, subtotal: 0 }])
    } catch (e: any) {
      console.error(e)
      const msg = e?.message || JSON.stringify(e) || 'desconocido'
      showAlert('Error al registrar la salida: ' + msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <BreadcrumbNav items={[{ label: 'Fiambrería San Agustín', href: '/dashboard' }, { label: 'Dashboard', href: '/dashboard' }, { label: 'Registrar Salida' }]} />

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Registrar Salida</h1>
        <p className="text-gray-600">Cargar factura de proveedor y actualizar stock</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la Factura</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Proveedor</Label>
              <Input
                value={proveedorNombre}
                onChange={(e) => setProveedorNombre(e.target.value)}
                placeholder="Escriba el nombre del proveedor"
              />
            </div>
            <div className="grid gap-2">
              <Label>Número de Factura</Label>
              <Input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} placeholder="A-0001-00001234" />
            </div>
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Productos</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4" />Agregar</Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Producto</TableHead>
                    <TableHead className="min-w-[120px]">Unidad</TableHead>
                    <TableHead className="min-w-[120px]">Precio Unit.</TableHead>
                    <TableHead className="min-w-[120px]">Cantidad</TableHead>
                    <TableHead className="min-w-[120px]">Subtotal</TableHead>
                    <TableHead className="min-w-[80px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Popover open={openRow === idx} onOpenChange={(o) => setOpenRow(o ? idx : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("w-full justify-between", !it.productoId && "text-muted-foreground")}
                            >
                              {it.productoId ? (
                                (() => {
                                  const p = productos.find(p => p.id === it.productoId)
                                  return p ? `${p.codigo ? p.codigo + " - " : ""}${p.nombre}` : "Seleccione producto"
                                })()
                              ) : (
                                "Seleccione producto"
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0 max-h-72 overflow-auto" align="start" side="bottom" sideOffset={4} avoidCollisions={false}>
                            <Command>
                              <CommandInput placeholder="Buscar por código o nombre..." autoFocus />
                              <CommandEmpty>No se encontraron productos.</CommandEmpty>
                              <CommandGroup>
                                {productos.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={`${p.codigo ?? ''} ${p.nombre}`}
                                    onSelect={() => { setItem(idx, { productoId: p.id, nombre: p.nombre, precioUnit: it.precioUnit > 0 ? it.precioUnit : (p.precio || 0) }); setOpenRow(null); }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", it.productoId === p.id ? "opacity-100" : "opacity-0")} />
                                    {p.codigo ? `${p.codigo} - ${p.nombre}` : p.nombre}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const p = productos.find(p => p.id === it.productoId)
                          const opts = allowedUnitsFor(p?.unidad_medida)
                          return (
                            <Select value={it.unidad || (opts[0] || 'unidad')} onValueChange={(v) => setItem(idx, { unidad: v })}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {opts.map(u => (
                                  <SelectItem key={u} value={u}>{unitLabel(u)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={it.precioUnit} onChange={(e) => setItem(idx, { precioUnit: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={it.cantidad} onChange={(e) => setItem(idx, { cantidad: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell className="font-semibold">${(it.subtotal || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button type="button" variant="outline" size="icon" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t">
            <div className="text-lg">Total: <span className="font-bold">${total.toLocaleString()}</span></div>
            <Button disabled={!canSave || saving} onClick={handleSave} className="bg-gray-900 hover:bg-gray-800">
              <Save className="h-4 w-4 mr-1" /> Cerrar factura
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
