# Bitácora UNISPAN — PWA

Progressive Web App para supervisores de obra de **UNISPAN México**.  
Funciona 100% en el navegador móvil (Chrome/Android) sin servidor ni Play Store.

---

## Estructura de archivos

```
BITACORA/
├── index.html              ← App shell principal (todas las pantallas)
├── manifest.json           ← Manifiesto PWA (instalación en Android)
├── sw.js                   ← Service Worker (funcionamiento offline)
├── generar-iconos.html     ← Herramienta para generar íconos PNG
├── css/
│   └── app.css             ← Estilos completos (mobile-first + dark mode)
├── js/
│   ├── db.js               ← IndexedDB: todos los stores y operaciones CRUD
│   ├── camera.js           ← Cámara trasera + GPS + compresión 0.7
│   ├── signature.js        ← Pad de firma táctil sobre canvas
│   ├── pdf.js              ← Generación de PDF en cliente (jsPDF)
│   ├── nc.js               ← Módulo de No Conformidades (FOR-P.CA-014)
│   ├── export.js           ← Exportación JSON para reporte mensual
│   └── app.js              ← Controlador principal, routing, UI
└── assets/
    ├── logo.svg            ← Logo UNISPAN (encabezado de la app)
    ├── icon.svg            ← Ícono PWA vectorial
    ├── icon-192.png        ← Ícono PWA 192×192 (generar con herramienta)
    └── icon-512.png        ← Ícono PWA 512×512 (generar con herramienta)
```

---

## Correr localmente

```bash
# Opción 1 — npx serve (recomendado)
cd BITACORA
npx serve .

# Opción 2 — Python
python -m http.server 8080

# Opción 3 — VS Code
# Instala "Live Server" → clic derecho en index.html → Open with Live Server
```

Abrir en Chrome: `http://localhost:3000` (o el puerto que indique serve).

> **Importante:** la app debe servirse desde HTTP/HTTPS (no `file://`) para que
> funcionen el Service Worker, la Cámara y la Geolocalización.

---

## Instalar como PWA en Android

1. Abrir Chrome en Android y navegar a la URL de la app (ej: `http://192.168.x.x:3000`).
2. Esperar que Chrome muestre el banner "Añadir a pantalla de inicio"  
   — o ir a **Menú ⋮ → Añadir a pantalla de inicio**.
3. La app se instala como icono nativo y funciona sin internet.

Para que el ícono PNG se vea correctamente:
1. Abre `generar-iconos.html` en Chrome.
2. Descarga `icon-192.png` e `icon-512.png`.
3. Coloca los archivos en la carpeta `assets/`.

---

## Estructura de IndexedDB

Base de datos: `UniSpanBitacora` (versión 1)

| Store | keyPath | Índices | Descripción |
|-------|---------|---------|-------------|
| `bitacoras` | `id` (auto) | folio, fecha, obra, estado_registro | Registros de visitas |
| `no_conformidades` | `id` (auto) | folio, fecha, obra, estado, tipo | Reportes NC FOR-P.CA-014 |
| `fotos` | `id` (auto) | registro_id, tipo_registro, [registro_id+tipo_registro] | Blobs de fotos comprimidas |
| `firmas` | `id` (auto) | registro_id, tipo_registro, tipo_firma | PNG de firmas digitales |
| `nc_historial` | `id` (auto) | nc_id | Historial de cambios de estado |
| `folios` | `tipo` ('BSO'/'NC') | — | Contador global de folios (no reutilizable) |

### Campos principales — Bitácora

```json
{
  "id": 1,
  "folio": "BSO-20260407-001",
  "fecha": "2026-04-07T10:30",
  "obra": "Hospital IMSS Saltillo",
  "contrato": "UNIS-2024-041",
  "supervisor": "Pedro Amador",
  "representante": "Juan Pérez",
  "actividad": "Armado de cimbra Magnum en eje 3-4 nivel 2",
  "materiales": ["MAGNUM", "HI (HI LOAD)"],
  "observaciones": "Se detectó faltante de conectores tipo A.",
  "estado_avance": "En proceso",
  "capacitacion": false,
  "descripcion_capacitacion": null,
  "estado_registro": "firmado",
  "timestamp_creacion": "2026-04-07T10:30:00.000Z",
  "timestamp_modificacion": "2026-04-07T11:30:00.000Z"
}
```

### Campos principales — No Conformidad

```json
{
  "id": 1,
  "folio": "NC-20260407-001",
  "fecha_deteccion": "2026-04-07",
  "obra": "Hospital IMSS Saltillo",
  "tipo": "Calidad de Producto",
  "impacto": "ALTO",
  "estado": "En atención",
  "descripcion": "24 piezas HI LOAD con deformación en cabezal.",
  "causa_raiz": "Maltrato en maniobras de carga.",
  "acciones_correctivas": "Reposición inmediata. Inspección en almacén.",
  "responsable": "UNISPAN",
  "continuo_obra": "Parcialmente"
}
```

---

## Generar el Reporte Mensual Word + HTML

### Método 1 — JSON (recomendado)

1. Ir a **Config → Reporte Mensual**.
2. Seleccionar mes y año.
3. Pulsar **"Exportar JSON para reporte mensual"** → descarga `REPORTE_SUPERVISION_042026.json`.
4. Entregar el archivo a Claude con el mensaje:

```
Genera el reporte mensual de supervisión con este JSON
```

Claude generará automáticamente el reporte Word (.docx) y el dashboard HTML interactivo.

### Método 2 — ZIP de PDFs

1. Pulsar **"Exportar ZIP de PDFs del mes"** → descarga todos los PDFs del período.
2. Entregar el ZIP a Claude con el mismo mensaje.

---

## Personalizar logo y campos

### Logo

Reemplazar `assets/logo.svg` con el logo oficial de UNISPAN en formato SVG o PNG.  
Si usas PNG, actualizar en `index.html`:

```html
<img src="assets/logo.png" alt="UNISPAN">
```

### Agregar materiales/sistemas

En `index.html`, buscar los bloques `id="b-materiales"` y `id="nc-sistema"` y agregar:

```html
<label class="checkbox-item">
  <input type="checkbox" value="NUEVO SISTEMA">
  <label>Nuevo Sistema</label>
</label>
```

### Cambiar colores

En `css/app.css`, modificar las variables en `:root`:

```css
:root {
  --azul:    #003D7C;   /* Azul UNISPAN */
  --naranja: #F5821F;   /* Naranja UNISPAN */
  --rojo:    #C0392B;   /* Rojo para No Conformidades */
}
```

---

## Funcionamiento offline

- El Service Worker (`sw.js`) cachea todos los assets en la primera visita.
- IndexedDB almacena todos los datos localmente.
- Las fotos se comprimen a calidad 0.7 antes de guardarse.
- La app funciona completamente sin internet una vez instalada.
- El botón "Sincronizar" es un placeholder para futura integración con backend.

---

## Consideraciones técnicas

| Aspecto | Implementación |
|---------|---------------|
| Firmas | PNG embebido en PDF (no SVG) |
| Fotos | Blob + thumbnail 240px, JPEG calidad 0.7 |
| PDF | 100% cliente con jsPDF — sin enviar datos a servidor |
| GPS | `navigator.geolocation` con fallback "No disponible" |
| Folios | Únicos, no reutilizables aunque se elimine el registro |
| Supervisor | Persiste en `localStorage` entre sesiones |
| NC historial | Cada cambio de estado guarda timestamp en `nc_historial` |

---

*UNISPAN México — Ingeniería en Encofrados y Andamios*
