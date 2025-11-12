"use client"

import { useEffect, useState } from "react"
import { useSession } from "@/components/SessionProvider"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"

interface Producto {
  id?: string
  nombre?: string
  precio?: number
  stock?: number
  stock_minimo?: number
}

export default function ListaComprasPage() {
  const { role } = useSession()
  const [productos, setProductos] = useState<Producto[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchProductos = async () => {
      setIsLoading(true)
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, precio, stock, stock_minimo")
        .order("nombre", { ascending: true })
      setProductos(data || [])
      setIsLoading(false)
    }
    fetchProductos()
  }, [])

  // Ordenar por diferencia (stock - stock_minimo) ascendente
  const items = [...productos].sort((a, b) => {
    const da = (a.stock ?? 0) - (a.stock_minimo ?? 0)
    const db = (b.stock ?? 0) - (b.stock_minimo ?? 0)
    return da - db
  })

  return (
    <div className="p-6 space-y-6">
      <BreadcrumbNav
        items={[
          { label: "Fiambrería San Agustín", href: "/dashboard" },
          { label: "Dashboard", href: "/dashboard" },
          { label: "Lista de compras" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lista de compras</h1>
          <p className="text-gray-600">Productos con sus mínimos y diferencia hacia el mínimo</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
          <CardDescription>Total: {productos.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Stock mínimo</TableHead>
                <TableHead>Diferencia</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500">Cargando...</TableCell>
                </TableRow>
              ) : (
                items.map((p) => {
                  const stock = p.stock ?? 0
                  const minimo = p.stock_minimo ?? 0
                  const diferencia = stock - minimo
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="font-medium">{p.nombre || "-"}</TableCell>
                      <TableCell className="text-red-600 font-semibold">{minimo}</TableCell>
                      <TableCell className="text-orange-600 font-semibold">{diferencia}</TableCell>
                      <TableCell className="text-black">{stock}</TableCell>
                      <TableCell>${(p.precio || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
