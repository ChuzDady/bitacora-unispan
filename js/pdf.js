/* =====================================================
   PDF.JS — Generación corporativa de PDFs con jsPDF
   Formato: Letter (215.9 × 279.4 mm) | Margen: 15mm
   Diseño profesional UNISPAN v2
   ===================================================== */

const PDFGen = (() => {

  /* ── DIMENSIONES Y CONSTANTES ───────────────────── */
  const PW   = 215.9;  // Page Width  (Letter)
  const PH   = 279.4;  // Page Height (Letter)
  const M    = 15;     // Margin (all sides)
  const CW   = PW - M * 2;  // Content Width = 185.9mm
  const HDR  = 12;     // Page header band height (non-cover pages)
  const FTR  = 10;     // Footer area height
  const CS   = M + HDR + 4;   // Content Start Y (below header)
  const CE   = PH - FTR - 4;  // Content End Y (above footer)

  /* ── PALETA CORPORATIVA ─────────────────────────── */
  const C = {
    azul:    [0,   61,  124],
    azulDk:  [0,   42,  87],
    naranja: [245, 130, 31],
    rojo:    [192, 57,  43],
    rojoLg:  [253, 234, 232],
    amber:   [230, 126, 34],
    amberLg: [254, 243, 231],
    verde:   [39,  174, 96],
    verdeLg: [232, 248, 238],
    gris:    [100, 116, 139],
    grisCl:  [244, 246, 249],
    grBorde: [203, 213, 225],
    negro:   [30,  41,  59],
    blanco:  [255, 255, 255],
  };

  /* ── HELPER: blob → data URL ────────────────────── */
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      if (!blob) { reject(new Error('No blob')); return; }
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* ── HELPER: paginación ──────────────────────────── */
  function checkPage(doc, y, needed = 20) {
    if (y + needed > CE) {
      doc.addPage();
      return CS;
    }
    return y;
  }

  /* ── HELPER: texto multi-línea con wrap ─────────── */
  function addWrappedText(doc, text, x, y, maxW, lineH = 5) {
    const lines = doc.splitTextToSize(String(text || '—'), maxW);
    doc.text(lines, x, y);
    return y + lines.length * lineH;
  }

  /* ═══════════════════════════════════════════════════
     PORTADA (para NC, opcional en bitácora)
     ═══════════════════════════════════════════════════ */
  async function dibujarPortada(doc, datos) {
    const { titulo, folio, obra, contrato, fecha, tipo, chipTexto, chipColor } = datos;

    /* Franja superior azul 45mm */
    doc.setFillColor(...C.azul);
    doc.rect(0, 0, PW, 45, 'F');

    /* Banda naranja decorativa inferior de la franja */
    doc.setFillColor(...C.naranja);
    doc.rect(0, 43, PW, 3, 'F');

    /* Texto UNISPAN */
    doc.setTextColor(...C.blanco);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text('UNISPAN', PW / 2, 22, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.naranja);
    doc.text('INGENIERÍA EN ENCOFRADOS Y ANDAMIOS', PW / 2, 31, { align: 'center' });

    /* México en blanco pequeño */
    doc.setTextColor(200, 220, 255);
    doc.setFontSize(8);
    doc.text('MÉXICO', PW / 2, 39, { align: 'center' });

    /* Nombre del documento */
    doc.setTextColor(...C.azul);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(titulo, PW / 2, 68, { align: 'center' });

    /* Línea naranja debajo del título */
    doc.setFillColor(...C.naranja);
    doc.rect(M, 72, CW, 1.5, 'F');

    /* Chip tipo NC */
    if (chipTexto) {
      const chipW = 60;
      const chipX = (PW - chipW) / 2;
      doc.setFillColor(...(chipColor || C.naranja));
      doc.roundedRect(chipX, 76, chipW, 10, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.blanco);
      doc.text(chipTexto.toUpperCase(), PW / 2, 82.5, { align: 'center' });
    }

    /* Tabla de identificación */
    const tabY = chipTexto ? 94 : 82;
    const filas = [
      ['FOLIO',    folio    || '—'],
      ['FECHA',    fecha    ? new Date(fecha).toLocaleDateString('es-MX') : '—'],
      ['OBRA',     obra     || '—'],
      ['COTIZACIÓN', contrato || '—'],
    ];

    const colL = M + 10;
    const colV = M + 55;
    const rowH = 10;

    filas.forEach((fila, i) => {
      const ry = tabY + i * rowH;

      /* Fondo alterno */
      doc.setFillColor(...(i % 2 === 0 ? C.grisCl : C.blanco));
      doc.rect(M + 5, ry, CW - 10, rowH, 'F');

      /* Etiqueta */
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.azul);
      doc.text(fila[0], colL, ry + 6.5);

      /* Valor */
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.negro);
      doc.text(String(fila[1]).slice(0, 70), colV, ry + 6.5);
    });

    /* Borde exterior de la tabla */
    doc.setDrawColor(...C.grBorde);
    doc.setLineWidth(0.4);
    doc.rect(M + 5, tabY, CW - 10, filas.length * rowH, 'S');
  }

  /* ═══════════════════════════════════════════════════
     ENCABEZADO DE PÁGINA (todas las páginas no portada)
     ═══════════════════════════════════════════════════ */
  function dibujarHeader(doc, titulo, folio) {
    /* Banda azul */
    doc.setFillColor(...C.azul);
    doc.rect(0, 0, PW, HDR, 'F');

    /* UNISPAN a la izquierda */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.blanco);
    doc.text('UNISPAN', M, 7.5);

    /* Título centrado */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(titulo, PW / 2, 7.5, { align: 'center' });

    /* Folio a la derecha en naranja */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.naranja);
    doc.text(folio, PW - M, 7.5, { align: 'right' });
  }

  /* ═══════════════════════════════════════════════════
     PIE DE PÁGINA (todas las páginas)
     ═══════════════════════════════════════════════════ */
  function dibujarFooter(doc, pageNum, totalPages, centroTexto = '') {
    const pieY = PH - FTR;

    /* Línea naranja superior */
    doc.setDrawColor(...C.naranja);
    doc.setLineWidth(0.8);
    doc.line(0, pieY, PW, pieY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gris);

    /* Izquierda */
    doc.text('UNISPAN México — Ingeniería en Encofrados y Andamios', M, pieY + 4.5);

    /* Centro */
    if (centroTexto) {
      doc.text(centroTexto, PW / 2, pieY + 4.5, { align: 'center' });
    }

    /* Derecha */
    doc.setFont('helvetica', 'bold');
    doc.text(`Página ${pageNum} de ${totalPages}`, PW - M, pieY + 4.5, { align: 'right' });
  }

  /* ═══════════════════════════════════════════════════
     ENCABEZADO DE SECCIÓN
     ═══════════════════════════════════════════════════ */
  function seccion(doc, numero, titulo, y) {
    y = checkPage(doc, y, 14);

    /* Rectángulo azul completo */
    doc.setFillColor(...C.azul);
    doc.rect(M, y, CW, 8, 'F');

    /* Número en naranja */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.naranja);
    doc.text(String(numero), M + 4, y + 5.5);

    /* Título en blanco */
    doc.setTextColor(...C.blanco);
    doc.text(titulo.toUpperCase(), M + 13, y + 5.5);

    return y + 12;
  }

  /* ═══════════════════════════════════════════════════
     TABLA DE DATOS GENERAL (etiqueta / valor)
     ═══════════════════════════════════════════════════ */
  function tablaFilas(doc, filas, y, labelW = 55) {
    const rowH = 8;
    const startY = y;

    filas.forEach((fila, i) => {
      y = checkPage(doc, y, rowH + 2);
      const isFirst = y === CS && i > 0; // nueva página mid-tabla

      /* Fondo alterno */
      doc.setFillColor(...(i % 2 === 0 ? C.grisCl : C.blanco));
      doc.rect(M, y, CW, rowH, 'F');

      /* Etiqueta */
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.azul);
      doc.text(String(fila[0]).toUpperCase(), M + 3, y + 5.5);

      /* Valor — auto-size si es muy largo */
      const valor = String(fila[1] != null ? fila[1] : '—');
      const maxValW = CW - labelW - 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.negro);

      if (doc.getTextWidth(valor) > maxValW) {
        doc.setFontSize(7.5);
      }

      const lines = doc.splitTextToSize(valor, maxValW);
      if (lines.length > 1) {
        // Celda alta para texto largo
        const extraH = (lines.length - 1) * 4.5;
        doc.setFillColor(...(i % 2 === 0 ? C.grisCl : C.blanco));
        doc.rect(M, y + rowH, CW, extraH, 'F');
        doc.text(lines, M + labelW, y + 5.5);
        y += rowH + extraH;
      } else {
        doc.text(valor, M + labelW, y + 5.5);
        y += rowH;
      }
    });

    /* Borde exterior */
    doc.setDrawColor(...C.grBorde);
    doc.setLineWidth(0.4);
    doc.rect(M, startY, CW, y - startY, 'S');

    /* Separador vertical entre etiqueta y valor */
    doc.setDrawColor(...C.grBorde);
    doc.line(M + labelW - 2, startY, M + labelW - 2, y);

    return y + 4;
  }

  /* ═══════════════════════════════════════════════════
     TEXTO LARGO (campo tipo textarea)
     ═══════════════════════════════════════════════════ */
  function campoTexto(doc, label, texto, y) {
    if (!texto && texto !== 0) return y;
    y = checkPage(doc, y, 18);

    /* Label */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.gris);
    doc.text(label.toUpperCase(), M, y + 4);
    y += 7;

    /* Contenido */
    const lines = doc.splitTextToSize(String(texto) || '—', CW - 8);
    const boxH  = Math.max(12, lines.length * 4.8 + 6);

    y = checkPage(doc, y, boxH + 4);

    doc.setFillColor(...C.grisCl);
    doc.rect(M, y, CW, boxH, 'F');
    doc.setDrawColor(...C.grBorde);
    doc.setLineWidth(0.3);
    doc.rect(M, y, CW, boxH, 'S');

    /* Borde izquierdo azul */
    doc.setFillColor(...C.azul);
    doc.rect(M, y, 2, boxH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.negro);
    doc.text(lines, M + 5, y + 5);

    return y + boxH + 5;
  }

  /* ═══════════════════════════════════════════════════
     FOTOS EN GRID 2 COLUMNAS
     ═══════════════════════════════════════════════════ */
  async function dibujarFotos(doc, fotos, y) {
    if (!fotos || fotos.length === 0) {
      y = checkPage(doc, y, 12);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...C.gris);
      doc.text('Sin registro fotográfico en este documento.', M + 2, y + 6);
      return y + 14;
    }

    const COLS   = 2;
    const GAP    = 5;
    const IMGW   = (CW - GAP) / COLS;  // ~90mm cada foto
    const IMGH   = 56;
    const CAPH   = 14;   // altura de la caption

    for (let i = 0; i < fotos.length; i++) {
      const col  = i % COLS;
      const imgX = M + col * (IMGW + GAP);

      if (col === 0) {
        y = checkPage(doc, y, IMGH + CAPH + 4);
      }

      /* ── Imagen ── */
      try {
        const dataUrl = await blobToDataURL(fotos[i].blob);
        doc.addImage(dataUrl, 'JPEG', imgX, y, IMGW, IMGH, undefined, 'FAST');
        /* Borde sutil sobre la imagen */
        doc.setDrawColor(...C.grBorde);
        doc.setLineWidth(0.3);
        doc.rect(imgX, y, IMGW, IMGH, 'S');
      } catch(e) {
        doc.setFillColor(220, 220, 220);
        doc.rect(imgX, y, IMGW, IMGH, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...C.gris);
        doc.text('Foto no disponible', imgX + IMGW/2, y + IMGH/2, { align: 'center' });
      }

      /* ── Caption ── */
      const capY = y + IMGH;
      doc.setFillColor(...C.grisCl);
      doc.rect(imgX, capY, IMGW, CAPH, 'F');
      doc.setDrawColor(...C.grBorde);
      doc.setLineWidth(0.3);
      doc.rect(imgX, capY, IMGW, CAPH, 'S');

      const num    = `Foto ${i + 1}`;
      const ts     = fotos[i].timestamp
        ? new Date(fotos[i].timestamp).toLocaleString('es-MX', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      const gps    = fotos[i].lat != null
        ? `${fotos[i].lat.toFixed(4)}, ${fotos[i].lon.toFixed(4)}`
        : 'GPS no disponible';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.azul);
      doc.text(num, imgX + 3, capY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.gris);
      doc.text(ts,  imgX + 3, capY + 8.5);
      doc.text(gps, imgX + 3, capY + 12);

      if (fotos[i].descripcion) {
        const descW = doc.getTextWidth(fotos[i].descripcion.slice(0, 40));
        doc.text(fotos[i].descripcion.slice(0, 40), imgX + IMGW - 3, capY + 4.5, { align: 'right' });
      }

      if (col === COLS - 1 || i === fotos.length - 1) {
        y += IMGH + CAPH + 5;
      }
    }

    return y;
  }

  /* ═══════════════════════════════════════════════════
     SECCIÓN DE FIRMA
     ═══════════════════════════════════════════════════ */
  function dibujarFirma(doc, firma, tituloSeccion, textoLegal, y) {
    y = checkPage(doc, y, 65);

    const boxH = 52;

    /* Recuadro con borde punteado azul */
    doc.setDrawColor(...C.azul);
    doc.setLineWidth(0.6);
    doc.setLineDash([3, 2], 0);
    doc.rect(M, y, CW, boxH, 'S');
    doc.setLineDash([], 0);

    /* Título de la constancia */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.azul);
    doc.text(tituloSeccion.toUpperCase(), PW / 2, y + 6, { align: 'center' });

    /* Texto legal */
    if (textoLegal) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.gris);
      const legalLines = doc.splitTextToSize(textoLegal, CW - 12);
      doc.text(legalLines, PW / 2, y + 12, { align: 'center' });
    }

    /* Imagen de firma */
    const sigY     = y + 18;
    const sigH     = 24;
    const sigAreaX = M + 20;
    const sigAreaW = CW - 40;

    if (firma?.imagen_png) {
      try {
        doc.addImage(firma.imagen_png, 'PNG', sigAreaX, sigY, sigAreaW, sigH, undefined, 'FAST');
      } catch(e) {}
    }

    /* Línea de firma */
    doc.setDrawColor(...C.gris);
    doc.setLineWidth(0.5);
    doc.setLineDash([], 0);
    doc.line(sigAreaX, y + boxH - 14, sigAreaX + sigAreaW, y + boxH - 14);

    /* Nombre del firmante */
    const nombre = firma?.nombre_firmante || '________________________________';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.negro);
    doc.text(nombre, PW / 2, y + boxH - 8.5, { align: 'center' });

    /* Timestamp */
    if (firma?.timestamp) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.gris);
      doc.text(new Date(firma.timestamp).toLocaleString('es-MX'), PW / 2, y + boxH - 4, { align: 'center' });
    }

    return y + boxH + 6;
  }

  /* ═══════════════════════════════════════════════════
     DECORACIONES FINALES (headers + footers en todas las páginas)
     ═══════════════════════════════════════════════════ */
  function aplicarDecoraciones(doc, tienePortada, tituloDoc, folio, piecentro) {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      const esPortada = tienePortada && p === 1;

      if (!esPortada) {
        dibujarHeader(doc, tituloDoc, folio);
      }
      dibujarFooter(doc, p, total, piecentro);
    }
  }

  /* ═══════════════════════════════════════════════════
     GENERAR BITÁCORA
     ═══════════════════════════════════════════════════ */
  async function generarBitacora(id) {
    const [bitacora, fotos, firmas] = await Promise.all([
      BitacoraDB.getById(id),
      FotoDB.getByRegistro(id, 'bitacora'),
      FirmaDB.getByRegistro(id, 'bitacora')
    ]);
    if (!bitacora) throw new Error('Bitácora no encontrada');

    const firma = firmas.find(f => f.tipo_firma === 'principal') || null;
    const tituloDoc = 'BITÁCORA DE SUPERVISIÓN EN OBRA';
    const folio     = bitacora.folio || 'BSO-SIN-FOLIO';

    /* ── Inicializar jsPDF ── */
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
      compress: true
    });

    /* Metadata */
    doc.setProperties({
      title:   `${tituloDoc} — ${folio}`,
      author:  'UNISPAN México',
      subject: folio,
      creator: 'App Bitácora UNISPAN v1.0'
    });

    let y = CS;

    /* ── SECCIÓN 1: Datos Generales ── */
    y = seccion(doc, '1', 'Datos Generales', y);
    const gpsStr = bitacora.gps_lat && bitacora.gps_lon
      ? `${bitacora.gps_lat.toFixed(6)}, ${bitacora.gps_lon.toFixed(6)}`
      : 'No disponible';
    y = tablaFilas(doc, [
      ['Folio',             folio],
      ['Fecha y Hora',      bitacora.fecha ? new Date(bitacora.fecha).toLocaleString('es-MX') : '—'],
      ['Obra / Proyecto',   bitacora.obra],
      ['No. de Cotización', bitacora.contrato],
      ['Ubicación GPS',     gpsStr],
      ['Supervisor UNISPAN',bitacora.supervisor],
      ['Rep. del Cliente',  bitacora.representante],
      ['Estado de Avance',  bitacora.estado_avance],
      ['Sistema / Equipo',  (bitacora.materiales || []).join(', ') || '—'],
    ], y);

    /* ── SECCIÓN 2: Actividad ── */
    y = seccion(doc, '2', 'Actividad Realizada', y);
    y = campoTexto(doc, 'Descripción de la actividad', bitacora.actividad, y);
    if (bitacora.observaciones) {
      y = campoTexto(doc, 'Observaciones e Incidencias', bitacora.observaciones, y);
    }

    /* ── SECCIÓN 3: Capacitación (si aplica) ── */
    if (bitacora.capacitacion) {
      y = seccion(doc, '3', 'Capacitación al Personal', y);
      y = campoTexto(doc, 'Descripción de la capacitación', bitacora.descripcion_capacitacion, y);
    }

    /* ── SECCIÓN 4: Registro Fotográfico ── */
    const numFotos = bitacora.capacitacion ? '4' : '3';
    y = seccion(doc, numFotos, 'Registro Fotográfico', y);
    y = await dibujarFotos(doc, fotos, y);

    /* ── SECCIÓN 5: Constancia de Recibido ── */
    const numFirma = bitacora.capacitacion ? '5' : '4';
    y = seccion(doc, numFirma, 'Constancia de Recibido', y);

    const legal = 'El presente documento es constancia de la visita de supervisión realizada por UNISPAN México. La firma del representante del cliente acredita haber recibido el servicio descrito y estar conforme con las actividades registradas en esta bitácora.';

    y = dibujarFirma(doc, firma, 'Firma del Representante del Cliente', legal, y);

    /* ── Aplicar headers y footers ── */
    aplicarDecoraciones(doc, false, tituloDoc, folio, '');

    return doc;
  }

  /* ═══════════════════════════════════════════════════
     GENERAR NO CONFORMIDAD
     ═══════════════════════════════════════════════════ */
  async function generarNC(id) {
    const [nc, fotos, firmas, historial] = await Promise.all([
      NCDB.getById(id),
      FotoDB.getByRegistro(id, 'nc'),
      FirmaDB.getByRegistro(id, 'nc'),
      NCHistorialDB.getByNC(id)
    ]);
    if (!nc) throw new Error('NC no encontrada');

    const firmaPrincipal = firmas.find(f => f.tipo_firma === 'principal') || null;
    const firmaCierre    = firmas.find(f => f.tipo_firma === 'cierre')    || null;

    const tituloDoc = 'REPORTE DE NO CONFORMIDAD';
    const folio     = nc.folio || 'NC-SIN-FOLIO';

    /* Chip de clasificación */
    let chipColor = C.naranja;
    if (nc.tipo === 'Calidad de Producto')  chipColor = C.rojo;
    if (nc.tipo === 'Diseño de Ingeniería') chipColor = C.amber;
    if (nc.tipo === 'Logística')            chipColor = C.azul;

    /* ── Inicializar jsPDF ── */
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'letter',
      compress: true
    });

    doc.setProperties({
      title:   `${tituloDoc} — ${folio}`,
      author:  'UNISPAN México',
      subject: folio,
      creator: 'App Bitácora UNISPAN v1.0'
    });

    /* ── PÁGINA 1: Portada ── */
    await dibujarPortada(doc, {
      titulo:    tituloDoc,
      folio,
      obra:      nc.obra,
      contrato:  nc.contrato,
      fecha:     nc.fecha_deteccion,
      chipTexto: nc.tipo || '',
      chipColor
    });

    /* ── PÁGINA 2+: Contenido ── */
    doc.addPage();
    let y = CS;

    /* ── SECCIÓN 1: Datos Generales ── */
    y = seccion(doc, '1', 'Datos Generales', y);
    const gpsStrNC = nc.gps_lat && nc.gps_lon
      ? `${nc.gps_lat.toFixed(6)}, ${nc.gps_lon.toFixed(6)}`
      : 'No disponible';
    y = tablaFilas(doc, [
      ['Folio',            folio],
      ['Fecha Detección',  nc.fecha_deteccion ? new Date(nc.fecha_deteccion).toLocaleDateString('es-MX') : '—'],
      ['Obra / Proyecto',  nc.obra],
      ['No. Cotización',   nc.contrato],
      ['Ubicación GPS',    gpsStrNC],
      ['Supervisor',       nc.supervisor],
      ['Clasificación',    nc.tipo],
      ['Reclamante',       nc.proceso_reclamante],
      ['Receptor',         nc.proceso_receptor],
      ['Administrador',    nc.administrador],
      ['Estado',           nc.estado],
    ], y);

    /* ── SECCIÓN 2: Descripción ── */
    y = seccion(doc, '2', 'Descripción y Clasificación', y);
    y = tablaFilas(doc, [
      ['Sistema / Equipo', (nc.sistema || []).join(', ') || '—'],
      ['Piezas Afectadas', String(nc.cantidad_piezas || '—')],
      ['Impacto',          nc.impacto || '—'],
    ], y, 55);
    y = campoTexto(doc, 'Descripción detallada', nc.descripcion, y);

    /* ── SECCIÓN 3: Evidencia Fotográfica ── */
    y = seccion(doc, '3', 'Evidencia Fotográfica', y);
    y = await dibujarFotos(doc, fotos, y);

    /* ── SECCIÓN 4: Análisis y Acciones ── */
    y = seccion(doc, '4', 'Análisis y Acciones Correctivas', y);
    y = campoTexto(doc, 'Causa Raíz', nc.causa_raiz, y);
    y = campoTexto(doc, 'Acciones Correctivas a Tomar', nc.acciones_correctivas, y);
    y = tablaFilas(doc, [
      ['Fecha Implementación', nc.fecha_implementacion || '—'],
      ['Responsable',          nc.responsable         || '—'],
      ['Continuó la Obra',     nc.continuo_obra        || '—'],
    ], y);

    /* ── SECCIÓN 5: Escalación ── */
    y = seccion(doc, '5', 'Escalación y Notificación', y);
    y = tablaFilas(doc, [
      ['Contacto Notificado', nc.contacto_notificado || '—'],
      ['Medio',               nc.medio_notificacion  || '—'],
      ['Fecha/Hora Notif.',   nc.fecha_notificacion ? new Date(nc.fecha_notificacion).toLocaleString('es-MX') : '—'],
    ], y);
    if (nc.observaciones_sgc) {
      y = campoTexto(doc, 'Observaciones SGC', nc.observaciones_sgc, y);
    }

    /* ── SECCIÓN 6: Constancia ── */
    y = seccion(doc, '6', 'Constancia de Notificación al Cliente', y);
    const legalNC = 'El presente documento es constancia de notificación formal de no conformidad. La firma acredita conocimiento del evento, no necesariamente responsabilidad sobre el mismo — UNISPAN México / FOR-P.CA-014.';
    y = dibujarFirma(doc, firmaPrincipal, 'Firma del Representante del Cliente', legalNC, y);

    /* ── SECCIÓN 7: Resolución (si aplica) ── */
    if (nc.estado === 'Resuelta' || nc.estado === 'Cerrada') {
      y = seccion(doc, '7', 'Resolución', y);

      /* Chip eficacia */
      if (nc.eficacia) {
        const chipColor = nc.eficacia === 'Eficaz' ? C.verde : C.rojo;
        const chipLg    = nc.eficacia === 'Eficaz' ? C.verdeLg : C.rojoLg;
        y = checkPage(doc, y, 12);
        doc.setFillColor(...chipLg);
        doc.rect(M, y, CW, 10, 'F');
        doc.setFillColor(...chipColor);
        doc.roundedRect(M + 4, y + 2, 40, 6, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.blanco);
        doc.text(`EFICACIA: ${nc.eficacia.toUpperCase()}`, M + 24, y + 6, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.negro);
        if (nc.fecha_cierre) doc.text(`Fecha de cierre: ${new Date(nc.fecha_cierre).toLocaleDateString('es-MX')}`, M + 50, y + 6);
        y += 14;
      }

      y = campoTexto(doc, 'Descripción de la Resolución', nc.descripcion_resolucion, y);
      y = dibujarFirma(doc, firmaCierre, 'Firma de Cierre — Supervisor UNISPAN', '', y);
    }

    /* ── SECCIÓN 8: Historial de estados ── */
    if (historial && historial.length > 0) {
      y = seccion(doc, '8', 'Historial de Cambios de Estado', y);
      const filasH = historial.map(h => [
        new Date(h.timestamp).toLocaleString('es-MX'),
        `${h.estado_anterior || 'Inicio'} → ${h.estado_nuevo}${h.notas ? '  (' + h.notas + ')' : ''}`
      ]);
      y = tablaFilas(doc, filasH, y, 48);
    }

    /* ── Decoraciones ── */
    aplicarDecoraciones(doc, true, tituloDoc, folio, 'FOR-P.CA-014  |  Rev. 01');

    return doc;
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
     ═══════════════════════════════════════════════════ */
  async function generar(tipo, id) {
    return tipo === 'nc' ? generarNC(id) : generarBitacora(id);
  }

  async function descargar(tipo, id) {
    const doc = await generar(tipo, id);
    const reg = tipo === 'nc' ? await NCDB.getById(id) : await BitacoraDB.getById(id);
    const folio = reg?.folio || `${tipo}_${id}`;
    const obra  = (reg?.obra || 'obra').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-]/g, '').trim().slice(0, 30);
    const nombre = `${folio}_${obra}.pdf`;
    doc.save(nombre);
  }

  async function obtenerBlob(tipo, id) {
    const doc = await generar(tipo, id);
    return doc.output('blob');
  }

  async function obtenerDataURL(tipo, id) {
    const doc = await generar(tipo, id);
    return doc.output('datauristring');
  }

  return { generar, descargar, obtenerBlob, obtenerDataURL };
})();
