# Integración con Aplicación Local de Balanza

## Resumen
Esta documentación explica cómo conectar la aplicación web Next.js con tu aplicación local que lee el puerto COM4.

## Configuración Requerida en tu Aplicación Local

Tu aplicación local debe exponer un servidor HTTP en el puerto 3000 con el siguiente endpoint:

### Endpoint Requerido
```
GET http://localhost:3000/lectura
```

### Formato de Respuesta JSON
```json
{
  "peso": 1.234,           // REQUERIDO: Peso actual en kg (número decimal)
  "estable": true,         // REQUERIDO: Si la lectura es estable (booleano)
  "producto": "Jamón",     // OPCIONAL: Nombre del producto
  "codigo": "JAM001",      // OPCIONAL: Código del producto  
  "total": 5560,           // OPCIONAL: Precio total en pesos
  "balanzaId": "BAL-001"   // OPCIONAL: ID de la balanza
}
```

### Ejemplo de Respuesta Mínima
```json
{
  "peso": 0.750,
  "estable": true
}
```

## Configuración CORS (Importante)

Tu aplicación local DEBE permitir solicitudes desde el origen de Next.js. Agrega estos headers HTTP:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Ejemplos de Implementación

### Python con Flask
```python
from flask import Flask, jsonify
from flask_cors import CORS
import serial

app = Flask(__name__)
CORS(app)  # Habilita CORS

# Tu código existente para leer COM4
ser = serial.Serial('COM4', 9600)

@app.route('/lectura', methods=['GET'])
def get_lectura():
    # Tu lógica existente para leer la balanza
    peso = leer_peso_desde_com4()
    
    return jsonify({
        "peso": peso,
        "estable": True,  # Tu lógica para determinar estabilidad
        "producto": "Producto detectado",
        "codigo": "PROD001",
        "total": int(peso * 4500),  # Precio por kg
        "balanzaId": "BAL-001"
    })

if __name__ == '__main__':
    app.run(host='localhost', port=3000)
```

### Node.js con Express
```javascript
const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');

const app = express();
app.use(cors());

// Tu código existente para COM4
const port = new SerialPort({ path: 'COM4', baudRate: 9600 });

app.get('/lectura', (req, res) => {
    // Tu lógica existente para leer la balanza
    const peso = leerPesoDesdeBalanza();
    
    res.json({
        peso: peso,
        estable: true,
        producto: "Producto detectado",
        codigo: "PROD001", 
        total: Math.round(peso * 4500),
        balanzaId: "BAL-001"
    });
});

app.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});
```

### C# con ASP.NET Core
```csharp
using Microsoft.AspNetCore.Mvc;
using System.IO.Ports;

[ApiController]
[Route("[controller]")]
public class LecturaController : ControllerBase
{
    private SerialPort _serialPort = new SerialPort("COM4", 9600);

    [HttpGet]
    public IActionResult Get()
    {
        // Tu lógica existente para leer COM4
        var peso = LeerPesoDesdeBalanza();
        
        return Ok(new {
            peso = peso,
            estable = true,
            producto = "Producto detectado",
            codigo = "PROD001",
            total = (int)(peso * 4500),
            balanzaId = "BAL-001"
        });
    }
}
```

## Estados de Conexión

La aplicación web mostrará:
- **Verde**: Balanza conectada y recibiendo datos
- **Rojo**: No se puede conectar al servidor local
- **Peso actual**: Se actualiza cada 2 segundos

## Registro de Lecturas

Las lecturas se guardan automáticamente en la tabla cuando:
- `estable` es `true`
- `peso` es mayor a 0
- Han pasado más de 10 segundos desde la última lectura O el peso cambió más de 0.01 kg

## Troubleshooting

### Error de CORS
Si ves errores de CORS en la consola del navegador, asegúrate de que tu aplicación local tenga los headers CORS configurados.

### Timeout de Conexión
La aplicación web espera máximo 5 segundos por respuesta. Si tu aplicación es más lenta, optimiza la lectura del puerto COM.

### Datos Inválidos
Verifica que tu endpoint devuelva JSON válido con al menos `peso` y `estable`.

## Prueba de Conectividad

Puedes probar manualmente el endpoint visitando:
```
http://localhost:3000/lectura
```

Deberías ver una respuesta JSON con los datos de la balanza.
