/**
 * Servidor de Prueba para Balanza
 * 
 * Este es un servidor simple para probar la conectividad con la aplicación web.
 * Simula lecturas de balanza para verificar que todo funciona correctamente.
 * 
 * Para ejecutar:
 * 1. Instalar Node.js si no lo tienes
 * 2. Ejecutar: node servidor-prueba-balanza.js
 * 3. El servidor correrá en http://localhost:3000
 */

const http = require('http');
const url = require('url');

// Simulación de datos de balanza
let pesoActual = 0;
let contadorLecturas = 0;

const productos = [
  { nombre: "Jamón Crudo", codigo: "JAM001", precio: 4500 },
  { nombre: "Salame Milano", codigo: "SAL002", precio: 3800 },
  { nombre: "Queso Provoleta", codigo: "QUE003", precio: 5200 },
  { nombre: "Mortadela", codigo: "MOR004", precio: 2400 }
];

function simularLecturaBalanza() {
  // Simular fluctuaciones de peso realistas
  const variacion = (Math.random() - 0.5) * 0.1; // ±0.05kg
  pesoActual = Math.max(0, pesoActual + variacion);
  
  // Ocasionalmente cambiar a un peso completamente nuevo
  if (Math.random() < 0.1) {
    pesoActual = Math.random() * 2.5; // 0 a 2.5 kg
  }
  
  const productoAleatorio = productos[Math.floor(Math.random() * productos.length)];
  const estable = Math.random() > 0.2; // 80% de probabilidad de estar estable
  
  return {
    peso: Number(pesoActual.toFixed(3)),
    estable: estable,
    producto: productoAleatorio.nombre,
    codigo: productoAleatorio.codigo,
    total: Math.round(pesoActual * productoAleatorio.precio),
    balanzaId: "BAL-PRUEBA-001",
    timestamp: new Date().toISOString()
  };
}

const server = http.createServer((req, res) => {
  // Configurar CORS para permitir solicitudes desde la aplicación web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  const parsedUrl = url.parse(req.url, true);
  
  // Manejar preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Endpoint principal para lecturas
  if (parsedUrl.pathname === '/lectura' && req.method === 'GET') {
    contadorLecturas++;
    const lectura = simularLecturaBalanza();
    
    console.log(`[${new Date().toLocaleTimeString()}] Lectura #${contadorLecturas}:`, lectura);
    
    res.writeHead(200);
    res.end(JSON.stringify(lectura, null, 2));
    return;
  }

  // Endpoint de estado del servidor
  if (parsedUrl.pathname === '/status' && req.method === 'GET') {
    const status = {
      servidor: "Servidor de Prueba Balanza",
      estado: "Funcionando",
      lecturas_enviadas: contadorLecturas,
      peso_actual: pesoActual,
      timestamp: new Date().toISOString()
    };
    
    res.writeHead(200);
    res.end(JSON.stringify(status, null, 2));
    return;
  }

  // Endpoint para reiniciar el peso
  if (parsedUrl.pathname === '/reset' && req.method === 'GET') {
    pesoActual = 0;
    contadorLecturas = 0;
    
    res.writeHead(200);
    res.end(JSON.stringify({ mensaje: "Peso reiniciado", peso: pesoActual }));
    return;
  }

  // 404 para rutas no encontradas
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Endpoint no encontrado" }));
});

const PORT = Number(process.env.PORT) || 3001; // usar 3001 por defecto para no chocar con Next.js
const HOST = process.env.HOST || 'localhost';

server.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('🔧 SERVIDOR DE PRUEBA PARA BALANZA');
  console.log('='.repeat(60));
  console.log(`📡 Servidor corriendo en: http://${HOST}:${PORT}`);
  console.log(`📊 Endpoint principal: http://${HOST}:${PORT}/lectura`);
  console.log(`📈 Estado del servidor: http://${HOST}:${PORT}/status`);
  console.log(`🔄 Reiniciar peso: http://${HOST}:${PORT}/reset`);
  console.log('='.repeat(60));
  console.log('💡 Para probar la conectividad:');
  console.log('   1. Ejecuta este servidor');
  console.log('   2. Abre tu aplicación web Next.js');
  console.log('   3. Ve a la página de Balanza');
  console.log('   4. Deberías ver "Balanza Conectada" en verde');
  console.log('='.repeat(60));
  
  // Simular lecturas cada 3 segundos para mostrar actividad
  setInterval(() => {
    // Solo mostrar actividad, las lecturas reales se generan cuando se solicitan
  }, 3000);
});

// Manejar cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor de prueba...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Cerrando servidor de prueba...');
  server.close(() => {
    console.log('✅ Servidor cerrado correctamente');
    process.exit(0);
  });
});
