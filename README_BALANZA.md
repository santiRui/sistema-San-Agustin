# 🔧 Configuración de Balanza - Sistema San Agustín

## 📋 Pasos para Conectar tu Aplicación Local

### 1. Probar la Conectividad (Recomendado)

Antes de modificar tu aplicación existente, prueba que todo funcione:

```bash
# En el directorio del proyecto
node servidor-prueba-balanza.js
```

Luego ejecuta tu aplicación Next.js:
```bash
npm run dev
```

Ve a `http://localhost:3001/dashboard/balanza` y verifica que aparezca "Balanza Conectada" en verde.

### 2. Modificar tu Aplicación Existente

Tu aplicación que lee COM4 debe exponer un endpoint HTTP:

**Endpoint requerido:** `GET http://localhost:3000/lectura`

**Respuesta JSON mínima:**
```json
{
  "peso": 1.234,
  "estable": true
}
```

**Respuesta JSON completa:**
```json
{
  "peso": 1.234,
  "estable": true,
  "producto": "Jamón Crudo",
  "codigo": "JAM001", 
  "total": 5556,
  "balanzaId": "BAL-001"
}
```

### 3. Configurar CORS

**Muy importante:** Tu aplicación debe permitir solicitudes desde otros orígenes.

#### Python (Flask)
```python
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
```

#### Node.js (Express)
```javascript
const cors = require('cors');
app.use(cors());
```

#### C# (ASP.NET Core)
```csharp
// En Startup.cs o Program.cs
services.AddCors(options => {
    options.AddDefaultPolicy(builder => {
        builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});
app.UseCors();
```

### 4. Verificar Funcionamiento

1. **Servidor de balanza corriendo:** `http://localhost:3000/lectura` debe responder JSON
2. **Aplicación web:** Debe mostrar "Balanza Conectada" y peso actual
3. **Consola del navegador:** No debe mostrar errores de CORS o red

## 🚀 Ejecutar el Sistema Completo

1. **Inicia tu aplicación de balanza** (puerto 3000)
2. **Inicia la aplicación web:**
   ```bash
   npm run dev
   ```
3. **Abre:** `http://localhost:3001/dashboard/balanza`

## 🔍 Troubleshooting

### Error: "Balanza Desconectada"
- Verifica que tu aplicación esté corriendo en puerto 3000
- Revisa la consola del navegador (F12) para ver errores específicos
- Prueba manualmente: `http://localhost:3000/lectura`

### Error de CORS
```
Access to fetch at 'http://localhost:3000/lectura' from origin 'http://localhost:3001' has been blocked by CORS policy
```
**Solución:** Configura CORS en tu aplicación de balanza (ver paso 3)

### Timeout de Conexión
- Tu aplicación debe responder en menos de 5 segundos
- Optimiza la lectura del puerto COM si es necesaria

### Datos No Válidos
- Asegúrate de que el JSON tenga al menos `peso` y `estable`
- Verifica que `peso` sea un número, no string

## 📊 Comportamiento del Sistema

- **Consulta cada 2 segundos** a tu aplicación
- **Guarda lecturas** cuando `estable: true` y `peso > 0`
- **Evita duplicados** (solo guarda si cambió el peso o pasaron 10+ segundos)
- **Mantiene historial** de las últimas 50 lecturas

## 📞 Soporte

Si necesitas ayuda específica para tu lenguaje de programación o tienes errores, proporciona:
1. El lenguaje/framework de tu aplicación existente
2. Los errores exactos de la consola del navegador
3. La respuesta de `http://localhost:3000/lectura` (si funciona)
