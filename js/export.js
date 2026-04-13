/* =====================================================
   EXPORT.JS — Exportación JSON para reporte mensual
   ===================================================== */

const Exportador = (() => {

  /* ── PALABRAS CLAVE para clasificación automática ── */
  const KW = {
    danos:            /da[ñn]o|deformaci[oó]n|roto|deterioro|golpe|fractura|quebrado/i,
    uso_incorrecto:   /mal uso|uso incorrecto|sin seguir|sin procedimiento|mal aplicado/i,
    adaptaciones:     /adaptaci[oó]n|ajuste aprobado|modificaci[oó]n aprobada|ajuste de modulaci[oó]n/i,
    inventarios:      /inventario|conciliaci[oó]n|faltante|sobrante|diferencia de material/i,
    pendiente:        /pendiente|programar|confirmar|falta|requiere|por definir/i,
    cierre:           /retorno|paro de renta|acopio|fin de renta|retirar equipo/i
  };

  /* ── GENERAR JSON MENSUAL ────────────────────────── */
  async function generarJSON(mes, anio) {
    const [bitacoras, ncs] = await Promise.all([
      BitacoraDB.getByMes(mes, anio),
      NCDB.getByMes(mes, anio)
    ]);

    const meta = {
      periodo:      `${nombreMes(mes).toUpperCase()} ${anio}`,
      mes,
      anio,
      generado_en:  new Date().toISOString(),
      version:      '1.0'
    };

    const kpis = calcularKPIs(bitacoras, ncs);
    const obras = agruparObras(bitacoras, ncs, mes, anio);
    const noConformidades = formatearNCs(ncs);
    const observaciones_tecnicas = extraerObsTecnicas(bitacoras, ncs);

    return { meta, kpis, obras, no_conformidades: noConformidades, observaciones_tecnicas };
  }

  /* ── KPIs ────────────────────────────────────────── */
  function calcularKPIs(bitacoras, ncs) {
    const obras = agruparPorObra(bitacoras);
    const obrasActivas  = obras.filter(o => !esEnCierre(o));
    const obrasEnCierre = obras.filter(o => esEnCierre(o));

    return {
      total_obras_atendidas: obras.length,
      obras_activas:         obrasActivas.length,
      obras_en_cierre:       obrasEnCierre.length,
      total_no_conformidades: ncs.length,
      capacitaciones: bitacoras.filter(b => b.capacitacion === true).length
    };
  }

  /* ── AGRUPAR OBRAS ───────────────────────────────── */
  function agruparObras(bitacoras, ncs, mes, anio) {
    const mapaObras = {};

    bitacoras.forEach(b => {
      const key = b.contrato || b.obra || 'SIN_CONTRATO';
      if (!mapaObras[key]) {
        mapaObras[key] = {
          cliente:        extraerCliente(b.obra || ''),
          nombre_obra:    b.obra || '',
          contrato:       b.contrato || '',
          sistema_rentado:[],
          estado:         'Activo',
          visitas:        [],
          _textos:        [],
          _observaciones: [],
          _todas_obs:     []
        };
      }
      const obra = mapaObras[key];

      // Acumular sistemas únicos
      if (Array.isArray(b.materiales)) {
        b.materiales.forEach(m => {
          if (!obra.sistema_rentado.includes(m)) obra.sistema_rentado.push(m);
        });
      }

      // Construir visita
      const visita = {
        folio:                   b.folio,
        fecha:                   b.fecha,
        supervisor:              b.supervisor || '',
        representante_cliente:   b.representante || '',
        actividad:               b.actividad || '',
        estado_avance:           b.estado_avance || '',
        observaciones:           b.observaciones || null,
        capacitacion:            b.capacitacion === true,
        descripcion_capacitacion: b.descripcion_capacitacion || null,
        fotos:                   (b._fotos || []).map((f, i) => ({
          numero:    i + 1,
          timestamp: f.timestamp,
          lat:       f.lat,
          lon:       f.lon,
          descripcion: f.descripcion || null
        })),
        firma: b._firma ? {
          nombre_firmante:  b._firma.nombre_firmante,
          timestamp_firma:  b._firma.timestamp
        } : null
      };

      obra.visitas.push(visita);

      // Acumular texto para narrativa
      if (b.actividad)    obra._textos.push(b.actividad);
      if (b.observaciones) {
        obra._textos.push(b.observaciones);
        obra._todas_obs.push({ texto: b.observaciones, fecha: b.fecha });
      }
    });

    // Convertir a array y calcular campos derivados
    return Object.values(mapaObras).map(obra => {
      obra.visitas.sort((a, b) => a.fecha > b.fecha ? 1 : -1);

      const ultimaVisita = obra.visitas[obra.visitas.length - 1];
      if (ultimaVisita && esEnCierreVisita(ultimaVisita)) {
        obra.estado = 'En cierre';
      }

      obra.resumen_narrativo = generarNarrativa(obra.visitas);
      obra.observaciones_puntuales = extraerObsPuntuales(obra._todas_obs);
      obra.acciones_pendientes     = extraerAccionesPendientes(obra.visitas);

      // Limpiar campos internos
      delete obra._textos;
      delete obra._observaciones;
      delete obra._todas_obs;

      return obra;
    });
  }

  /* ── NO CONFORMIDADES ────────────────────────────── */
  function formatearNCs(ncs) {
    return ncs.map(nc => ({
      folio:                nc.folio,
      fecha_reporte:        (nc.fecha_deteccion || nc.timestamp_creacion || '').split('T')[0],
      tipo:                 nc.tipo || '',
      proceso_reclamante:   nc.proceso_reclamante || '',
      proceso_receptor:     nc.proceso_receptor || '',
      obra:                 nc.obra || '',
      contrato:             nc.contrato || '',
      administrador:        nc.administrador || '',
      descripcion:          nc.descripcion || '',
      impacto:              nc.impacto || '',
      causa_raiz:           nc.causa_raiz || '',
      accion_correctiva:    nc.acciones_correctivas || '',
      fecha_implementacion: nc.fecha_implementacion || null,
      responsable:          nc.responsable || '',
      continuo_obra:        nc.continuo_obra || '',
      contacto_notificado:  nc.contacto_notificado || '',
      medio_notificacion:   nc.medio_notificacion || '',
      fecha_notificacion:   nc.fecha_notificacion || null,
      estado:               nc.estado || 'Abierta',
      eficacia:             nc.eficacia || null,
      fecha_cierre:         nc.fecha_cierre || null,
      descripcion_resolucion: nc.descripcion_resolucion || null,
      observaciones_sgc:    nc.observaciones_sgc || null
    }));
  }

  /* ── OBSERVACIONES TÉCNICAS ──────────────────────── */
  function extraerObsTecnicas(bitacoras, ncs) {
    const result = {
      danos_deterioro:         [],
      uso_incorrecto:          [],
      adaptaciones_aprobadas:  [],
      inventarios_conciliaciones: []
    };

    const textos = [
      ...bitacoras.map(b => ({ texto: b.observaciones || '', fuente: b.obra || '' })),
      ...ncs.map(n => ({ texto: n.descripcion || '', fuente: n.obra || '' }))
    ];

    textos.forEach(({ texto, fuente }) => {
      if (!texto) return;
      const entrada = `${texto.slice(0, 120)}${texto.length > 120 ? '...' : ''} — ${fuente}`;
      if (KW.danos.test(texto))          result.danos_deterioro.push(entrada);
      if (KW.uso_incorrecto.test(texto)) result.uso_incorrecto.push(entrada);
      if (KW.adaptaciones.test(texto))   result.adaptaciones_aprobadas.push(entrada);
      if (KW.inventarios.test(texto))    result.inventarios_conciliaciones.push(entrada);
    });

    return result;
  }

  /* ── HELPERS ─────────────────────────────────────── */
  function agruparPorObra(bitacoras) {
    const mapa = {};
    bitacoras.forEach(b => {
      const key = b.contrato || b.obra || 'SIN';
      if (!mapa[key]) mapa[key] = { visitas: [] };
      mapa[key].visitas.push(b);
    });
    return Object.values(mapa);
  }

  function esEnCierre(obra) {
    if (!obra.visitas || obra.visitas.length === 0) return false;
    const ultima = obra.visitas[obra.visitas.length - 1];
    return esEnCierreVisita(ultima);
  }

  function esEnCierreVisita(visita) {
    if (!visita) return false;
    if (visita.estado_avance === 'Terminado') return true;
    const obs = (visita.observaciones || '') + ' ' + (visita.actividad || '');
    return KW.cierre.test(obs);
  }

  function extraerCliente(nombreObra) {
    // Heurística simple: primera palabra en mayúsculas
    const match = nombreObra.match(/^([A-ZÁÉÍÓÚÜÑ]{2,})/);
    return match ? match[1] : nombreObra.split(' ')[0] || '';
  }

  function generarNarrativa(visitas) {
    const partes = visitas.map(v => {
      let texto = v.actividad || '';
      if (v.observaciones) texto += '. ' + v.observaciones;
      if (v.fecha) {
        const d = new Date(v.fecha);
        const fechaStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
        texto = `[${fechaStr}] ${texto}`;
      }
      return texto;
    }).filter(Boolean);
    return partes.join('. ');
  }

  function extraerObsPuntuales(observaciones) {
    return observaciones.map(({ texto, fecha }) => {
      const d = new Date(fecha);
      const fechaStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
      return `${texto.slice(0, 150)} [${fechaStr}]`;
    }).filter(Boolean);
  }

  function extraerAccionesPendientes(visitas) {
    const pendientes = [];
    visitas.forEach(v => {
      if (v.estado_avance === 'Requiere atención') {
        pendientes.push(`Requiere atención: ${(v.observaciones || v.actividad || '').slice(0, 120)}`);
      }
      const obs = v.observaciones || '';
      if (KW.pendiente.test(obs)) {
        const oraciones = obs.split(/[.;]/).filter(o => KW.pendiente.test(o));
        oraciones.forEach(o => pendientes.push(o.trim().slice(0, 150)));
      }
    });
    return [...new Set(pendientes)]; // Deduplicar
  }

  /* ── NOMBRES DE MESES ────────────────────────────── */
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  function nombreMes(n) { return MESES[n - 1] || ''; }

  /* ── DESCARGAR JSON ──────────────────────────────── */
  async function descargarJSON(mes, anio) {
    const data = await generarJSON(mes, anio);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const mesStr = String(mes).padStart(2,'0');
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `REPORTE_SUPERVISION_${mesStr}${anio}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return data;
  }

  /* ── EXPORTAR TODOS LOS DATOS (sin filtro) ────────── */
  async function descargarTodo() {
    const data = await exportarTodo(); // fn de db.js
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g,'');
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `BITACORA_COMPLETO_${fecha}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ── EXPORTAR ZIP DE PDFs ─────────────────────────── */
  async function descargarZipPDFs(mes, anio, generarPDFFn) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip no está cargado');

    const [bitacoras, ncs] = await Promise.all([
      BitacoraDB.getByMes(mes, anio),
      NCDB.getByMes(mes, anio)
    ]);

    const zip = new JSZip();
    const carpeta = zip.folder(`REPORTE_${nombreMes(mes).toUpperCase()}_${anio}`);

    let total = bitacoras.length + ncs.length;
    let procesados = 0;

    for (const b of bitacoras) {
      try {
        const pdfBlob = await generarPDFFn('bitacora', b.id);
        carpeta.file(`${b.folio}.pdf`, pdfBlob);
      } catch(e) { console.warn('PDF error:', b.folio, e); }
      procesados++;
    }

    for (const n of ncs) {
      try {
        const pdfBlob = await generarPDFFn('nc', n.id);
        carpeta.file(`${n.folio}.pdf`, pdfBlob);
      } catch(e) { console.warn('PDF error:', n.folio, e); }
      procesados++;
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url  = URL.createObjectURL(blob);
    const mesStr = String(mes).padStart(2,'0');
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `PDFS_SUPERVISION_${mesStr}${anio}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return procesados;
  }

  return { generarJSON, descargarJSON, descargarTodo, descargarZipPDFs, nombreMes };
})();
