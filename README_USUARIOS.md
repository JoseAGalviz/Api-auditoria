# Sistema de Gestión de Usuarios - API

## 📋 Descripción

Sistema completo de gestión de usuarios con autenticación segura mediante bcrypt, almacenamiento en MySQL y API RESTful.

## 🚀 Características

- ✅ Crear usuarios con contraseña encriptada
- ✅ Listar usuarios con filtros
- ✅ Obtener usuario por ID
- ✅ Actualizar información de usuarios
- ✅ Eliminar usuarios (soft delete y hard delete)
- ✅ Gestión de segmentos (JSON)
- ✅ Gestión de permisos (JSON)
- ✅ Control de status (activo/inactivo)

## 📁 Estructura de Archivos

```
api-app/
├── src/
│   ├── controllers/
│   │   └── usuario.controller.js    # Lógica de negocio
│   ├── routes/
│   │   └── usuario.route.js         # Rutas de la API
│   └── server.js                    # Configuración del servidor
├── database/
│   └── schema.sql                   # Script SQL para crear la BD
└── README_USUARIOS.md               # Esta documentación
```

## 🗄️ Base de Datos

### Tabla: usuarios

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INT | ID único (auto-incremental) |
| `usuario` | VARCHAR(100) | Nombre de usuario (único) |
| `segmentos` | JSON | Segmentos asignados |
| `contraseña_hash` | VARCHAR(255) | Contraseña encriptada con bcrypt |
| `status` | TINYINT(1) | 1 = activo, 0 = inactivo |
| `permisos` | JSON | Permisos del usuario |
| `fecha_registro` | DATETIME | Fecha de creación |

### Crear la Base de Datos

Ejecuta el archivo SQL:

```bash
mysql -u desarrollo -p app < database/schema.sql
```

O copia y pega el contenido de `database/schema.sql` en tu cliente MySQL.

## 🔌 API Endpoints

### Base URL
```
http://localhost:8001/api/usuarios
```

### 1. Crear Usuario

**POST** `/api/usuarios/crear`

**Body (JSON):**
```json
{
  "usuario": "vendedor01",
  "segmentos": ["SEGMENTO1", "SEGMENTO2"],
  "contraseña": "miPassword123",
  "status": 1,
  "permisos": {
    "crear": true,
    "editar": true,
    "eliminar": false,
    "ver_reportes": true
  }
}
```

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "message": "Usuario creado exitosamente",
  "data": {
    "id": 1,
    "usuario": "vendedor01",
    "segmentos": "[\"SEGMENTO1\",\"SEGMENTO2\"]",
    "status": 1,
    "permisos": "{\"crear\":true,\"editar\":true,\"eliminar\":false,\"ver_reportes\":true}",
    "fecha_registro": "2025-12-10T18:30:00.000Z"
  }
}
```

### 2. Obtener Todos los Usuarios

**GET** `/api/usuarios`

**Query Parameters (opcionales):**
- `status`: Filtrar por status (0 o 1)
- `usuario`: Buscar por nombre de usuario (búsqueda parcial)

**Ejemplo:**
```
GET /api/usuarios?status=1
GET /api/usuarios?usuario=vendedor
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 1,
      "usuario": "vendedor01",
      "segmentos": ["SEGMENTO1", "SEGMENTO2"],
      "status": 1,
      "permisos": {
        "crear": true,
        "editar": true,
        "eliminar": false,
        "ver_reportes": true
      },
      "fecha_registro": "2025-12-10T18:30:00.000Z"
    }
  ]
}
```

### 3. Obtener Usuario por ID

**GET** `/api/usuarios/:id`

**Ejemplo:**
```
GET /api/usuarios/1
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "usuario": "vendedor01",
    "segmentos": ["SEGMENTO1", "SEGMENTO2"],
    "status": 1,
    "permisos": {
      "crear": true,
      "editar": true,
      "eliminar": false,
      "ver_reportes": true
    },
    "fecha_registro": "2025-12-10T18:30:00.000Z"
  }
}
```

### 4. Actualizar Usuario

**PUT** `/api/usuarios/:id`

**Body (JSON):** (todos los campos son opcionales)
```json
{
  "segmentos": ["SEGMENTO3"],
  "contraseña": "nuevaPassword456",
  "status": 1,
  "permisos": {
    "crear": false,
    "editar": true,
    "eliminar": true,
    "ver_reportes": true
  }
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Usuario actualizado exitosamente"
}
```

### 5. Eliminar Usuario

**DELETE** `/api/usuarios/:id`

**Query Parameters (opcionales):**
- `hard`: Si es `true`, elimina permanentemente. Por defecto es soft delete (cambia status a 0)

**Ejemplos:**
```
DELETE /api/usuarios/1          # Soft delete (status = 0)
DELETE /api/usuarios/1?hard=true  # Hard delete (eliminación permanente)
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Usuario desactivado exitosamente"
}
```

## 🧪 Pruebas con cURL

### Crear usuario
```bash
curl -X POST http://localhost:8001/api/usuarios/crear \
  -H "Content-Type: application/json" \
  -d '{
    "usuario": "admin",
    "segmentos": ["TODOS"],
    "contraseña": "admin123",
    "status": 1,
    "permisos": {
      "crear": true,
      "editar": true,
      "eliminar": true,
      "ver_reportes": true,
      "administrar_usuarios": true
    }
  }'
```

### Obtener todos los usuarios
```bash
curl http://localhost:8001/api/usuarios
```

### Obtener usuario por ID
```bash
curl http://localhost:8001/api/usuarios/1
```

### Actualizar usuario
```bash
curl -X PUT http://localhost:8001/api/usuarios/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": 0
  }'
```

### Eliminar usuario (soft delete)
```bash
curl -X DELETE http://localhost:8001/api/usuarios/1
```

## 🧪 Pruebas con Postman/Thunder Client

1. **Importar colección** (opcional): Crea una nueva colección llamada "Usuarios API"

2. **Configurar variables de entorno:**
   - `base_url`: `http://localhost:8001`

3. **Crear requests:**
   - POST `{{base_url}}/api/usuarios/crear`
   - GET `{{base_url}}/api/usuarios`
   - GET `{{base_url}}/api/usuarios/1`
   - PUT `{{base_url}}/api/usuarios/1`
   - DELETE `{{base_url}}/api/usuarios/1`

## 🔒 Seguridad

- Las contraseñas se encriptan con **bcrypt** (10 salt rounds)
- Nunca se devuelve la contraseña en las respuestas
- Validación de campos requeridos
- Validación de usuario único

## 📝 Notas Importantes

1. **Segmentos**: Se almacenan como JSON. Puedes usar arrays o objetos:
   ```json
   ["SEGMENTO1", "SEGMENTO2"]
   ```
   o
   ```json
   {"segmento1": true, "segmento2": false}
   ```

2. **Permisos**: Se almacenan como JSON con estructura flexible:
   ```json
   {
     "crear": true,
     "editar": true,
     "eliminar": false,
     "ver_reportes": true,
     "administrar_usuarios": false
   }
   ```

3. **Status**: 
   - `1` = Usuario activo
   - `0` = Usuario inactivo

4. **Soft Delete vs Hard Delete**:
   - Soft delete: Cambia el status a 0 (recomendado para auditoría)
   - Hard delete: Elimina el registro permanentemente

## 🐛 Manejo de Errores

La API devuelve códigos HTTP estándar:

- `200`: Operación exitosa
- `201`: Recurso creado exitosamente
- `400`: Error en la solicitud (datos inválidos)
- `404`: Recurso no encontrado
- `500`: Error interno del servidor

**Ejemplo de error:**
```json
{
  "error": "El usuario ya existe."
}
```

## 🔄 Próximas Mejoras

- [ ] Autenticación con JWT
- [ ] Middleware de autorización
- [ ] Validación de permisos por endpoint
- [ ] Logs de auditoría
- [ ] Paginación en listado de usuarios
- [ ] Búsqueda avanzada por segmentos y permisos

## 📞 Soporte

Para problemas o preguntas, revisa los logs del servidor o contacta al equipo de desarrollo.
