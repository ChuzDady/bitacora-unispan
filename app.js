/* =====================================================
   APP.JS — Controlador principal de UNISPAN Bitácora PWA
   ===================================================== */

/* ── UTILIDADES GLOBALES ──────────────────────────── */

const Toast = {
  show(msg, tipo = 'info', duracion = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 350);
    }, duracion);
  }
};

const Loading = {
  show(msg = 'Cargando…') {
    const el = document.getElementById('loading-overlay');
    if (el) {
      el.querySelector('.loading-msg').textContent = msg;
      el.classList.add('active');
    }
  },
  hide() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.remove('active');
  }
};

/* ── ESTADO GLOBAL ───────────────────────────────── */
const State = {
  screenActual:     'home',
  modoEdicion:      false,
  registroActual:   null,   // { tipo: 'bitacora'|'nc', id: number }
  fotosPendientes:  [],     // fotos no guardadas aún
  firmaActual:      null,   // datos de firma
  signaturePad:     null,   // instancia del pad

  reset() {
    this.modoEdicion    = false;
    this.registroActual = null;
    this.fotosPendientes= [];
    this.firmaActual    = null;
    if (this.signaturePad) { this.signaturePad.destroy?.(); this.signaturePad = null; }
  }
};

/* ── ROUTER ──────────────────────────────────────── */
const AppRouter = {
  screens: ['home','bitacora-form','fotos','firma','pdf-preview',
            'nc-form','nc-lista','config'],

  irA(screen, param = null) {
    // Cerrar cámara si salimos de fotos
    if (State.screenActual === 'fotos') {
      Camera.cerrar();
    }

    // Ocultar todas
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    const el = document.getElementById(`screen-${screen}`);
    if (!el) { console.warn('Pantalla no encontrada:', screen); return; }
    el.classList.add('active');
    State.screenActual = screen;

    // Actualizar nav activo
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.screen === screen ||
        (screen.startsWith('bitacora') && n.dataset.screen === 'bitacora-form') ||
        (screen.startsWith('nc') && n.dataset.screen === 'nc-lista') );
    });

    // Acción al entrar a cada pantalla
    switch(screen) {
      case 'home':         Pantallas.home.cargar(); break;
      case 'bitacora-form':Pantallas.bitacora.cargar(param); break;
      case 'fotos':        Pantallas.fotos.cargar(); break;
      case 'firma':        Pantallas.firma.cargar(); break;
      case 'pdf-preview':  Pantallas.pdfPreview.cargar(param); break;
      case 'nc-form':      Pantallas.nc.cargarForm(param); break;
      case 'nc-lista':     Pantallas.nc.cargarLista(); break;
      case 'config':       Pantallas.config.cargar(); break;
    }

    window.scrollTo(0, 0);
  }
};

/* ═══════════════════════════════════════════════════
   PANTALLAS
   ═══════════════════════════════════════════════════ */
const Pantallas = {

  /* ── HOME ────────────────────────────────────────── */
  home: {
    async cargar() {
      const lista = document.getElementById('lista-registros');
      if (!lista) return;
      Loading.show('Cargando registros…');
      try {
        const [bitacoras, ncs] = await Promise.all([
          BitacoraDB.getAll(),
          NCDB.getAll()
        ]);

        // Combinar y ordenar por fecha desc
        const todos = [
          ...bitacoras.map(b => ({ ...b, _tipo: 'bitacora' })),
          ...ncs.map(n => ({ ...n, _tipo: 'nc' }))
        ].sort((a, b) => {
          const ta = a.timestamp_creacion || a.fecha || '';
          const tb = b.timestamp_creacion || b.fecha || '';
          return tb > ta ? 1 : -1;
        });

        if (todos.length === 0) {
          lista.innerHTML = `
            <div class="empty-state">
              <span class="empty-icon">📋</span>
              <p>No hay registros aún</p>
              <small>Crea tu primera bitácora o no conformidad</small>
            </div>`;
        } else {
          lista.innerHTML = todos.map(r => renderCard(r)).join('');
        }

        // Stats
        actualizarStats(bitacoras, ncs);
      } catch(e) {
        Toast.show('Error cargando datos: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    }
  },

  /* ── BITÁCORA FORM ───────────────────────────────── */
  bitacora: {
    async cargar(id = null) {
      const form = document.getElementById('form-bitacora');
      if (!form) return;

      if (id) {
        // Editar existente
        State.modoEdicion    = true;
        State.registroActual = { tipo: 'bitacora', id };
        const b = await BitacoraDB.getById(id);
        if (b) {
          rellenarFormBitacora(b);
          if (b.estado_registro === 'firmado') {
            bloquearFormBitacora(true);
            document.getElementById('bitacora-titulo').textContent = 'Bitácora Firmada';
          } else {
            bloquearFormBitacora(false);
            document.getElementById('bitacora-titulo').textContent = 'Editar Bitácora';
          }
        }
      } else {
        // Nueva bitácora
        State.modoEdicion    = false;
        State.registroActual = { tipo: 'bitacora', id: null };
        form.reset();
        limpiarFormBitacora();
        document.getElementById('bitacora-titulo').textContent = 'Nueva Bitácora';

        // Auto-rellenar supervisor guardado
        const supervisor = localStorage.getItem('supervisor_nombre') || '';
        const supEl = document.getElementById('b-supervisor');
        if (supEl) supEl.value = supervisor;

        // Auto-rellenar fecha/hora actual
        const fechaEl = document.getElementById('b-fecha');
        if (fechaEl) fechaEl.value = new Date().toISOString().slice(0,16);
      }
    },

    async guardar() {
      // Bloquear guardado si ya está firmado
      if (State.modoEdicion && State.registroActual?.id) {
        const existente = await BitacoraDB.getById(State.registroActual.id);
        if (existente?.estado_registro === 'firmado') {
          Toast.show('Este registro está firmado y bloqueado. No se puede modificar.', 'warning', 4000);
          return;
        }
      }
      const form = document.getElementById('form-bitacora');
      if (!validarForm(form)) return;

      const data = leerFormBitacora();
      Loading.show('Guardando…');
      try {
        let id;
        if (State.modoEdicion && State.registroActual?.id) {
          data.id = State.registroActual.id;
          id = await BitacoraDB.save(data);
        } else {
          id = await BitacoraDB.save(data);
          State.registroActual = { tipo: 'bitacora', id: Number(id) };
        }

        // Guardar supervisor en localStorage
        localStorage.setItem('supervisor_nombre', data.supervisor || '');

        State.modoEdicion = true;
        State.registroActual.id = Number(id);

        Toast.show('Bitácora guardada', 'success');
        // Ir a fotos
        AppRouter.irA('fotos');
      } catch(e) {
        Toast.show('Error al guardar: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    },

    guardarBorrador() {
      Pantallas.bitacora.guardar();
    }
  },

  /* ── FOTOS ───────────────────────────────────────── */
  fotos: {
    async cargar() {
      if (!State.registroActual) { AppRouter.irA('home'); return; }
      const { id, tipo } = State.registroActual;
      const maxFotos = tipo === 'nc' ? 6 : 8;

      // Cargar fotos existentes
      const fotos = id ? await FotoDB.getByRegistro(id, tipo) : [];
      Camera.setFotosActuales(fotos.length);

      renderizarGrid(fotos);
      actualizarContadorFotos(fotos.length, maxFotos);

      // Inicializar cámara
      const video = document.getElementById('camera-video');
      Camera.init(video, {
        registroId:   id,
        tipoRegistro: tipo,
        maxFotos,
        onCapture: async (fotoData) => {
          try {
            Loading.show('Guardando foto…');
            const savedId = await FotoDB.save(fotoData);
            fotoData.id = savedId;
            const fotosActuales = await FotoDB.getByRegistro(id, tipo);
            renderizarGrid(fotosActuales);
            actualizarContadorFotos(fotosActuales.length, maxFotos);
            Toast.show('Foto guardada', 'success');
          } catch(e) {
            Toast.show('Error: ' + e.message, 'error');
          } finally {
            Loading.hide();
          }
        }
      });

      // Intentar abrir cámara
      try {
        await Camera.abrir();
        document.getElementById('camera-preview').classList.remove('hidden');
        document.getElementById('btn-capturar').disabled = false;
      } catch(e) {
        document.getElementById('camera-preview').classList.add('hidden');
        Toast.show(e.message, 'warning', 5000);
      }
    },

    async capturar() {
      try {
        await Camera.capturar();
      } catch(e) {
        Toast.show(e.message, 'error');
      }
    },

    async desdeGaleria() {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          try {
            await Camera.desdeArchivo(file);
          } catch(err) {
            Toast.show(err.message, 'error');
            break;
          }
        }
      };
      input.click();
    },

    continuar() {
      Camera.cerrar();
      AppRouter.irA('firma');
    }
  },

  /* ── FIRMA ───────────────────────────────────────── */
  firma: {
    cargar() {
      if (!State.registroActual) { AppRouter.irA('home'); return; }

      const canvas = document.getElementById('firma-canvas');
      if (!canvas) return;

      // Destruir pad anterior si existe
      if (State.signaturePad) State.signaturePad.destroy?.();

      // Pequeño delay para que el canvas esté en el DOM con tamaño correcto
      requestAnimationFrame(() => {
        SignaturePad.init(canvas);
        State.signaturePad = SignaturePad;
      });
    },

    limpiar() {
      SignaturePad.limpiar();
    },

    async confirmar() {
      if (SignaturePad.estaVacia()) {
        Toast.show('Por favor firma antes de continuar', 'warning');
        return;
      }

      const nombre = document.getElementById('firma-nombre').value.trim();
      if (!nombre) {
        Toast.show('Ingresa el nombre del firmante', 'warning');
        document.getElementById('firma-nombre').focus();
        return;
      }

      Loading.show('Guardando firma…');
      try {
        const pngDataURL = SignaturePad.exportarPNG();

        const firmaData = {
          registro_id:    State.registroActual.id,
          tipo_registro:  State.registroActual.tipo,
          tipo_firma:     'principal',
          imagen_png:     pngDataURL,
          nombre_firmante: nombre,
          timestamp:      new Date().toISOString()
        };

        // Eliminar firma anterior si existe
        const firmasExistentes = await FirmaDB.getByRegistro(
          State.registroActual.id,
          State.registroActual.tipo
        );
        const anterior = firmasExistentes.find(f => f.tipo_firma === 'principal');
        if (anterior) await FirmaDB.delete(anterior.id);

        await FirmaDB.save(firmaData);

        // Marcar como firmado
        if (State.registroActual.tipo === 'bitacora') {
          const b = await BitacoraDB.getById(State.registroActual.id);
          if (b) { b.estado_registro = 'firmado'; await BitacoraDB.save(b); }
        }

        State.firmaActual = firmaData;
        Toast.show('Firma confirmada', 'success');
        AppRouter.irA('pdf-preview', State.registroActual.id);
      } catch(e) {
        Toast.show('Error al guardar firma: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    }
  },

  /* ── PDF PREVIEW ─────────────────────────────────── */
  pdfPreview: {
    async cargar(id = null) {
      const tipo = State.registroActual?.tipo || 'bitacora';
      const recordId = id || State.registroActual?.id;
      if (!recordId) { AppRouter.irA('home'); return; }

      const registro = tipo === 'nc'
        ? await NCDB.getById(recordId)
        : await BitacoraDB.getById(recordId);

      if (!registro) { Toast.show('Registro no encontrado', 'error'); return; }

      // Resumen
      document.getElementById('preview-folio').textContent   = registro.folio || '—';
      document.getElementById('preview-obra').textContent    = registro.obra  || '—';
      document.getElementById('preview-fecha').textContent   = formatFecha(registro.fecha || registro.fecha_deteccion);
      document.getElementById('preview-estado').textContent  =
        tipo === 'nc' ? (registro.estado || '—') : (registro.estado_registro || '—');
      document.getElementById('preview-tipo-label').textContent =
        tipo === 'nc' ? 'No Conformidad' : 'Bitácora';

      // Guardar referencia
      State.registroActual = { tipo, id: recordId };
    },

    async generarYDescargar() {
      const { tipo, id } = State.registroActual;
      Loading.show('Generando PDF…');
      try {
        await PDFGen.descargar(tipo, id);
        Toast.show('PDF descargado', 'success');
      } catch(e) {
        Toast.show('Error al generar PDF: ' + e.message, 'error');
        console.error(e);
      } finally {
        Loading.hide();
      }
    },

    async compartirWhatsApp() {
      const { tipo, id } = State.registroActual;
      const registro = tipo === 'nc' ? await NCDB.getById(id) : await BitacoraDB.getById(id);
      const texto = encodeURIComponent(
        `Adjunto ${tipo === 'nc' ? 'No Conformidad' : 'Bitácora'} ${registro?.folio || ''} ` +
        `— Obra: ${registro?.obra || '—'} ` +
        `— UNISPAN México`
      );
      window.open(`https://wa.me/?text=${texto}`, '_blank');
    },

    async enviarCorreo() {
      const { tipo, id } = State.registroActual;
      const registro = tipo === 'nc' ? await NCDB.getById(id) : await BitacoraDB.getById(id);
      const asunto  = encodeURIComponent(`${tipo === 'nc' ? 'NC' : 'Bitácora'} ${registro?.folio || ''} — ${registro?.obra || ''}`);
      const cuerpo  = encodeURIComponent(`Estimado,\n\nAdjunto el documento de ${tipo === 'nc' ? 'No Conformidad' : 'Bitácora de Supervisión'} correspondiente a la obra "${registro?.obra || ''}".\n\nAtentamente,\n${registro?.supervisor || 'UNISPAN México'}`);
      window.location.href = `mailto:?subject=${asunto}&body=${cuerpo}`;
    }
  },

  /* ── NO CONFORMIDAD FORM ─────────────────────────── */
  nc: {
    async cargarForm(id = null) {
      const form = document.getElementById('form-nc');
      if (!form) return;

      if (id) {
        State.modoEdicion    = true;
        State.registroActual = { tipo: 'nc', id };
        const nc = await NCDB.getById(id);
        if (nc) rellenarFormNC(nc);
        document.getElementById('nc-form-titulo').textContent = 'Editar No Conformidad';
      } else {
        State.modoEdicion    = false;
        State.registroActual = { tipo: 'nc', id: null };
        form.reset();
        limpiarFormNC();
        document.getElementById('nc-form-titulo').textContent = 'Nueva No Conformidad';

        const supervisor = localStorage.getItem('supervisor_nombre') || '';
        const supEl = document.getElementById('nc-supervisor');
        if (supEl) supEl.value = supervisor;

        const fechaEl = document.getElementById('nc-fecha');
        if (fechaEl) fechaEl.value = new Date().toISOString().split('T')[0];
      }
    },

    async guardarForm() {
      const form = document.getElementById('form-nc');
      if (!validarForm(form)) return;

      const data = leerFormNC();
      Loading.show('Guardando NC…');
      try {
        let id;
        if (State.modoEdicion && State.registroActual?.id) {
          data.id = State.registroActual.id;
          id = await NCDB.save(data);
        } else {
          id = await NCDB.save(data);
        }
        State.registroActual = { tipo: 'nc', id: Number(id) };
        State.modoEdicion    = true;

        localStorage.setItem('supervisor_nombre', data.supervisor || '');

        Toast.show('No Conformidad guardada', 'success');
        AppRouter.irA('fotos');
      } catch(e) {
        Toast.show('Error al guardar: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    },

    async cargarLista() {
      const container = document.getElementById('nc-lista-container');
      if (!container) return;
      Loading.show('Cargando NCs…');
      try {
        await NCModule.renderizarLista(container, obtenerFiltrosNC());
      } catch(e) {
        Toast.show('Error: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    }
  },

  /* ── CONFIGURACIÓN ───────────────────────────────── */
  config: {
    cargar() {
      const supEl = document.getElementById('config-supervisor');
      if (supEl) supEl.value = localStorage.getItem('supervisor_nombre') || '';

      // Versión de cache
      const swVer = document.getElementById('config-sw-version');
      if (swVer && navigator.serviceWorker?.controller) {
        const mc = new MessageChannel();
        mc.port1.onmessage = e => { if (swVer) swVer.textContent = e.data?.version || '—'; };
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [mc.port2]);
      }

      // Stats
      dbStats().then(stats => {
        const el = document.getElementById('config-stats');
        if (el) el.innerHTML = `
          <div class="stat-grid">
            <div class="stat-item"><span>${stats.bitacoras}</span><small>Bitácoras</small></div>
            <div class="stat-item"><span>${stats.ncs}</span><small>NCs Total</small></div>
            <div class="stat-item"><span>${stats.fotos}</span><small>Fotos</small></div>
            <div class="stat-item"><span style="color:#C0392B">${stats.ncs_abiertas}</span><small>NCs Abiertas</small></div>
          </div>`;
      });

      // Selector de mes/año para exportar
      const mesEl  = document.getElementById('export-mes');
      const anioEl = document.getElementById('export-anio');
      if (mesEl && anioEl) {
        const now = new Date();
        mesEl.value  = now.getMonth() + 1;
        anioEl.value = now.getFullYear();
      }
    },

    guardarSupervisor() {
      const val = document.getElementById('config-supervisor').value.trim();
      localStorage.setItem('supervisor_nombre', val);
      Toast.show('Nombre guardado', 'success');
    },

    async exportarJSON() {
      const mes  = parseInt(document.getElementById('export-mes').value);
      const anio = parseInt(document.getElementById('export-anio').value);
      if (!mes || !anio) { Toast.show('Selecciona mes y año', 'warning'); return; }
      Loading.show('Generando JSON…');
      try {
        await Exportador.descargarJSON(mes, anio);
        Toast.show('JSON exportado correctamente', 'success');
      } catch(e) {
        Toast.show('Error: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    },

    async exportarTodo() {
      Loading.show('Exportando todos los datos…');
      try {
        await Exportador.descargarTodo();
        Toast.show('Datos exportados', 'success');
      } catch(e) {
        Toast.show('Error: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    },

    async exportarZIP() {
      const mes  = parseInt(document.getElementById('export-mes').value);
      const anio = parseInt(document.getElementById('export-anio').value);
      if (!mes || !anio) { Toast.show('Selecciona mes y año', 'warning'); return; }
      if (typeof JSZip === 'undefined') {
        Toast.show('JSZip no está disponible. Verifica conexión a internet.', 'error');
        return;
      }
      Loading.show('Generando ZIP de PDFs…');
      try {
        const total = await Exportador.descargarZipPDFs(mes, anio,
          (tipo, id) => PDFGen.obtenerBlob(tipo, id)
        );
        Toast.show(`ZIP generado con ${total} PDFs`, 'success');
      } catch(e) {
        Toast.show('Error: ' + e.message, 'error');
      } finally {
        Loading.hide();
      }
    },

    limpiarDatos() {
      if (!confirm('⚠️ ¿Eliminar TODOS los registros? Esta acción no se puede deshacer.')) return;
      if (!confirm('Esta es tu última oportunidad. ¿Confirmas el borrado total?')) return;
      // Limpiar IndexedDB
      indexedDB.deleteDatabase('UniSpanBitacora');
      Toast.show('Base de datos eliminada. Recarga la app.', 'info', 5000);
      setTimeout(() => location.reload(), 3000);
    }
  }
};

/* ── FORMULARIO BITÁCORA — HELPERS ──────────────────── */
const MATERIALES_OPCIONES = [
  { id: 'All Steel (AS)',       label: 'All Steel (AS)' },
  { id: 'Puntal Travesaño (PT)',label: 'Puntal Travesaño (PT)' },
  { id: 'Minimag (MI)',         label: 'Minimag (MI)' },
  { id: 'Magnum (MG)',          label: 'Magnum (MG)' },
  { id: 'Vista (V)',            label: 'Vista (V)' },
  { id: 'Puntal Regulable (PR)',label: 'Puntal Regulable (PR)' },
  { id: 'Super Uni (SU)',       label: 'Super Uni (SU)' },
  { id: 'Hi Load (HL)',         label: 'Hi Load (HL)' },
  { id: 'Multidireccional (MD)',label: 'Multidireccional (MD)' }
];

function leerFormBitacora() {
  const materiales = Array.from(
    document.querySelectorAll('#b-materiales input[type=checkbox]:checked')
  ).map(c => c.value);
  const libre = document.getElementById('b-material-libre').value.trim();
  if (libre) materiales.push(libre);

  return {
    obra:              document.getElementById('b-obra').value.trim(),
    contrato:          document.getElementById('b-contrato').value.trim(),
    fecha:             document.getElementById('b-fecha').value,
    supervisor:        document.getElementById('b-supervisor').value.trim(),
    representante:     document.getElementById('b-representante').value.trim(),
    actividad:         document.getElementById('b-actividad').value.trim(),
    materiales,
    observaciones:     document.getElementById('b-observaciones').value.trim(),
    estado_avance:     document.getElementById('b-estado-avance').value,
    capacitacion:      document.getElementById('b-capacitacion').checked,
    descripcion_capacitacion: document.getElementById('b-capacitacion').checked
      ? document.getElementById('b-desc-capacitacion').value.trim()
      : null,
    gps_lat:           parseFloat(document.getElementById('b-gps-lat')?.value) || null,
    gps_lon:           parseFloat(document.getElementById('b-gps-lon')?.value) || null
  };
}

function rellenarFormBitacora(b) {
  setVal('b-obra', b.obra);
  setVal('b-contrato', b.contrato);
  setVal('b-fecha', b.fecha ? b.fecha.slice(0,16) : '');
  setVal('b-supervisor', b.supervisor);
  setVal('b-representante', b.representante);
  setVal('b-actividad', b.actividad);
  setVal('b-observaciones', b.observaciones);
  setVal('b-estado-avance', b.estado_avance);
  setChecked('b-capacitacion', b.capacitacion);

  if (b.capacitacion) {
    document.getElementById('cap-extra')?.classList.remove('hidden');
    setVal('b-desc-capacitacion', b.descripcion_capacitacion);
  }

  // Materiales
  (b.materiales || []).forEach(m => {
    const cb = document.querySelector(`#b-materiales input[value="${m}"]`);
    if (cb) cb.checked = true;
    else setVal('b-material-libre', m);
  });

  // GPS
  if (b.gps_lat && b.gps_lon) {
    mostrarGPSEnForm('bitacora', b.gps_lat, b.gps_lon);
  }
}

function limpiarFormBitacora() {
  document.querySelectorAll('#b-materiales input[type=checkbox]').forEach(c => c.checked = false);
  setVal('b-material-libre', '');
  document.getElementById('cap-extra')?.classList.add('hidden');
}

function bloquearFormBitacora(bloquear) {
  const form    = document.getElementById('form-bitacora');
  const banner  = document.getElementById('b-firmado-banner');
  const actions = form?.querySelector('.form-actions');

  if (!form) return;

  // Todos los inputs, selects, textareas y checkboxes
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.disabled = bloquear;
  });

  // Mostrar/ocultar banner
  banner?.classList.toggle('hidden', !bloquear);

  // Ocultar botones de acción al bloquear
  if (actions) actions.style.display = bloquear ? 'none' : '';
}

/* ── FORMULARIO NC — HELPERS ─────────────────────── */
function leerFormNC() {
  const sistemas = Array.from(
    document.querySelectorAll('#nc-sistema input[type=checkbox]:checked')
  ).map(c => c.value);
  const libre = document.getElementById('nc-sistema-libre')?.value.trim();
  if (libre) sistemas.push(libre);

  return {
    fecha_deteccion:      document.getElementById('nc-fecha').value,
    obra:                 document.getElementById('nc-obra').value.trim(),
    contrato:             document.getElementById('nc-contrato').value.trim(),
    supervisor:           document.getElementById('nc-supervisor').value.trim(),
    tipo:                 document.getElementById('nc-tipo').value,
    proceso_reclamante:   document.getElementById('nc-reclamante').value.trim(),
    proceso_receptor:     document.getElementById('nc-receptor').value.trim(),
    administrador:        document.getElementById('nc-administrador').value.trim(),
    descripcion:          document.getElementById('nc-descripcion').value.trim(),
    sistema:              sistemas,
    cantidad_piezas:      parseInt(document.getElementById('nc-cantidad').value) || 0,
    impacto:              document.getElementById('nc-impacto').value,
    causa_raiz:           document.getElementById('nc-causa').value.trim(),
    acciones_correctivas: document.getElementById('nc-acciones').value.trim(),
    fecha_implementacion: document.getElementById('nc-fecha-impl').value,
    responsable:          document.getElementById('nc-responsable').value,
    continuo_obra:        document.getElementById('nc-continuo').value,
    contacto_notificado:  document.getElementById('nc-contacto').value.trim(),
    medio_notificacion:   document.getElementById('nc-medio').value,
    fecha_notificacion:   document.getElementById('nc-fecha-notif').value,
    observaciones_sgc:    document.getElementById('nc-obs-sgc').value.trim(),
    estado:               document.getElementById('nc-estado')?.value || 'Abierta',
    descripcion_resolucion: document.getElementById('nc-resolucion')?.value.trim(),
    eficacia:             document.getElementById('nc-eficacia')?.value,
    fecha_cierre:         document.getElementById('nc-fecha-cierre')?.value,
    gps_lat:              parseFloat(document.getElementById('nc-gps-lat')?.value) || null,
    gps_lon:              parseFloat(document.getElementById('nc-gps-lon')?.value) || null
  };
}

function rellenarFormNC(nc) {
  setVal('nc-fecha', nc.fecha_deteccion);
  setVal('nc-obra', nc.obra);
  setVal('nc-contrato', nc.contrato);
  setVal('nc-supervisor', nc.supervisor);
  setVal('nc-tipo', nc.tipo);
  setVal('nc-reclamante', nc.proceso_reclamante);
  setVal('nc-receptor', nc.proceso_receptor);
  setVal('nc-administrador', nc.administrador);
  setVal('nc-descripcion', nc.descripcion);
  setVal('nc-cantidad', nc.cantidad_piezas);
  setVal('nc-impacto', nc.impacto);
  setVal('nc-causa', nc.causa_raiz);
  setVal('nc-acciones', nc.acciones_correctivas);
  setVal('nc-fecha-impl', nc.fecha_implementacion);
  setVal('nc-responsable', nc.responsable);
  setVal('nc-continuo', nc.continuo_obra);
  setVal('nc-contacto', nc.contacto_notificado);
  setVal('nc-medio', nc.medio_notificacion);
  setVal('nc-fecha-notif', nc.fecha_notificacion ? nc.fecha_notificacion.slice(0,16) : '');
  setVal('nc-obs-sgc', nc.observaciones_sgc);

  (nc.sistema || []).forEach(s => {
    const cb = document.querySelector(`#nc-sistema input[value="${s}"]`);
    if (cb) cb.checked = true;
  });

  // Resolución visible si aplica
  const estadoVal = nc.estado || 'Abierta';
  if (estadoVal === 'Resuelta' || estadoVal === 'Cerrada') {
    document.getElementById('nc-resolucion-section')?.classList.remove('hidden');
    setVal('nc-resolucion', nc.descripcion_resolucion);
    setVal('nc-eficacia', nc.eficacia);
    setVal('nc-fecha-cierre', nc.fecha_cierre);
  }

  // GPS
  if (nc.gps_lat && nc.gps_lon) {
    mostrarGPSEnForm('nc', nc.gps_lat, nc.gps_lon);
  }
}

function limpiarFormNC() {
  document.querySelectorAll('#nc-sistema input[type=checkbox]').forEach(c => c.checked = false);
  setVal('nc-sistema-libre', '');
  document.getElementById('nc-resolucion-section')?.classList.add('hidden');
}

function obtenerFiltrosNC() {
  return {
    estado: document.getElementById('nc-filtro-estado')?.value || '',
    tipo:   document.getElementById('nc-filtro-tipo')?.value   || '',
    texto:  document.getElementById('nc-filtro-texto')?.value  || ''
  };
}

/* ── RENDER CARD (home) ──────────────────────────── */
function renderCard(r) {
  const tipo    = r._tipo;
  const esBit   = tipo === 'bitacora';
  const estado  = esBit ? r.estado_registro : r.estado;
  const estadoColor = esBit
    ? (estado === 'firmado' ? '#27AE60' : estado === 'cerrado' ? '#7F8C8D' : '#E67E22')
    : (NCModule.COLORES_ESTADO[estado] || '#999');

  const fecha = formatFecha(esBit ? r.fecha : r.fecha_deteccion || r.timestamp_creacion);

  return `
    <div class="card ${esBit ? '' : 'card-nc'}" data-id="${r.id}" data-tipo="${tipo}">
      <div class="card-header">
        <span class="chip chip-tipo ${esBit ? 'chip-bitacora' : 'chip-nc'}">
          ${esBit ? '📋 Bitácora' : '⚠ No Conf.'}
        </span>
        <span class="chip" style="background:${estadoColor}">${estado || 'borrador'}</span>
      </div>
      <div class="card-body">
        <div class="card-folio">${r.folio || '—'}</div>
        <div class="card-obra">${r.obra || '—'}</div>
        <div class="card-fecha">${fecha}</div>
        ${!esBit && r.tipo ? `<div class="card-meta">${NCModule.chipTipo(r.tipo)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn btn-sm btn-primary"
          onclick="AppRouter.irA('pdf-preview', ${r.id}); State.registroActual={tipo:'${tipo}',id:${r.id}}">
          Ver PDF
        </button>
        ${esBit && estado === 'firmado'
          ? `<button class="btn btn-sm btn-outline" onclick="AppRouter.irA('bitacora-form', ${r.id})" title="Ver (bloqueado)">
               🔒 Ver
             </button>`
          : `<button class="btn btn-sm btn-outline"
               onclick="AppRouter.irA('${esBit ? 'bitacora-form' : 'nc-form'}', ${r.id})">
               Editar
             </button>
             <button class="btn btn-sm btn-danger"
               onclick="eliminarRegistro('${tipo}', ${r.id})">
               🗑
             </button>`
        }
      </div>
    </div>`;
}

/* ── ELIMINAR REGISTRO ──────────────────────────── */
async function eliminarRegistro(tipo, id) {
  // Verificar si está firmado antes de eliminar
  if (tipo === 'bitacora') {
    const b = await BitacoraDB.getById(id);
    if (b?.estado_registro === 'firmado') {
      Toast.show('No se puede eliminar un acta firmada.', 'warning', 4000);
      return;
    }
  }
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  try {
    Loading.show('Eliminando…');
    if (tipo === 'nc') await NCDB.delete(id);
    else await BitacoraDB.delete(id);
    Toast.show('Registro eliminado', 'success');
    Pantallas.home.cargar();
  } catch(e) {
    Toast.show('Error: ' + e.message, 'error');
  } finally {
    Loading.hide();
  }
}

/* ── RENDER FOTOS GRID ───────────────────────────── */
function renderizarGrid(fotos) {
  const grid = document.getElementById('fotos-grid');
  if (!grid) return;
  if (fotos.length === 0) {
    grid.innerHTML = '<p class="fotos-empty">No hay fotos aún. Usa la cámara o sube desde galería.</p>';
    return;
  }
  grid.innerHTML = fotos.map(f => `
    <div class="foto-thumb" data-id="${f.id}">
      <img src="${URL.createObjectURL(f.thumbnail || f.blob)}" alt="Foto ${f.numero}">
      <div class="foto-overlay">
        <span class="foto-num">${f.numero}</span>
        <button class="btn-eliminar-foto" onclick="eliminarFoto(${f.id})">✕</button>
      </div>
    </div>
  `).join('');
}

async function eliminarFoto(id) {
  if (!confirm('¿Eliminar esta foto?')) return;
  try {
    await FotoDB.delete(id);
    const { id: regId, tipo } = State.registroActual;
    const maxFotos = tipo === 'nc' ? 6 : 8;
    const fotos = await FotoDB.getByRegistro(regId, tipo);
    Camera.setFotosActuales(fotos.length);
    renderizarGrid(fotos);
    actualizarContadorFotos(fotos.length, maxFotos);
    Toast.show('Foto eliminada', 'success');
  } catch(e) {
    Toast.show('Error: ' + e.message, 'error');
  }
}

function actualizarContadorFotos(actual, max) {
  const el = document.getElementById('fotos-contador');
  if (el) el.textContent = `${actual} / ${max} fotos`;
  const btnCapturar = document.getElementById('btn-capturar');
  if (btnCapturar) btnCapturar.disabled = actual >= max;
}

/* ── VALIDACIÓN ──────────────────────────────────── */
function validarForm(form) {
  if (!form) return false;
  const invalidos = form.querySelectorAll('[required]');
  let ok = true;
  invalidos.forEach(el => {
    if (!el.value.trim()) {
      el.classList.add('input-error');
      ok = false;
    } else {
      el.classList.remove('input-error');
    }
  });
  if (!ok) Toast.show('Completa todos los campos obligatorios', 'warning');
  return ok;
}

/* ── STATS HOME ──────────────────────────────────── */
function actualizarStats(bitacoras, ncs) {
  const el = document.getElementById('home-stats');
  if (!el) return;
  const ncsAbiertas = ncs.filter(n => n.estado === 'Abierta' || n.estado === 'En atención').length;
  el.innerHTML = `
    <div class="stats-row">
      <div class="stat"><span class="stat-num">${bitacoras.length}</span><span class="stat-label">Bitácoras</span></div>
      <div class="stat"><span class="stat-num">${ncs.length}</span><span class="stat-label">NCs</span></div>
      <div class="stat"><span class="stat-num" style="color:#C0392B">${ncsAbiertas}</span><span class="stat-label">NCs Activas</span></div>
    </div>`;
}

/* ── HELPERS DOM ─────────────────────────────────── */
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val != null ? val : '';
}

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function formatFecha(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch(e) { return iso; }
}

/* ── MODALES ─────────────────────────────────────── */
function cerrarModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

/* ── SERVICE WORKER ──────────────────────────────── */
async function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          Toast.show('Nueva versión disponible. Recarga para actualizar.', 'info', 8000);
        }
      });
    });
  } catch(e) {
    console.warn('SW registro fallido:', e);
  }
}

/* ── CAPACITACIÓN TOGGLE ─────────────────────────── */
function toggleCapacitacion() {
  const cb     = document.getElementById('b-capacitacion');
  const extra  = document.getElementById('cap-extra');
  if (extra) extra.classList.toggle('hidden', !cb.checked);
}

/* ── NC ESTADO TOGGLE para resolución ─────────────── */
function toggleNCEstado() {
  const estado = document.getElementById('nc-estado')?.value;
  const seccion = document.getElementById('nc-resolucion-section');
  if (seccion) {
    seccion.classList.toggle('hidden', estado !== 'Resuelta' && estado !== 'Cerrada');
  }
}

/* ── NC FILTROS ──────────────────────────────────── */
function aplicarFiltrosNC() {
  const container = document.getElementById('nc-lista-container');
  if (!container) return;
  NCModule.renderizarLista(container, obtenerFiltrosNC());
}

/* ── INSTALL PWA ─────────────────────────────────── */
let _installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  document.getElementById('btn-instalar')?.classList.remove('hidden');
});

function instalarPWA() {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  _installPrompt.userChoice.then(result => {
    if (result.outcome === 'accepted') {
      Toast.show('¡App instalada correctamente!', 'success');
      document.getElementById('btn-instalar')?.classList.add('hidden');
    }
    _installPrompt = null;
  });
}

/* ── INIT ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Registrar service worker
  registrarSW();

  // Inicializar base de datos
  try {
    await dbOpen();
  } catch(e) {
    Toast.show('Error inicializando base de datos: ' + e.message, 'error', 8000);
  }

  // Navegación por tabs
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const screen = item.dataset.screen;
      if (screen) AppRouter.irA(screen);
    });
  });

  // Cargar pantalla inicial
  const hash = window.location.hash.replace('#', '');
  const validScreens = ['home','nc-lista','config'];
  AppRouter.irA(validScreens.includes(hash) ? hash : 'home');

  // Detectar estado de conexión
  const updateOnlineStatus = () => {
    const el = document.getElementById('offline-badge');
    if (el) el.classList.toggle('hidden', navigator.onLine);
  };
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
});

/* ── GPS PARA REGISTROS ──────────────────────────── */

// Captura GPS y lo muestra en el formulario
function capturarGPSRegistro(tipo) {
  const prefix = tipo === 'bitacora' ? 'b' : 'nc';
  const statusEl = document.getElementById(`${prefix}-gps-status`);
  if (statusEl) statusEl.textContent = '⏳ Obteniendo ubicación...';

  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = '❌ GPS no disponible en este dispositivo';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      mostrarGPSEnForm(tipo, lat, lon);
    },
    (err) => {
      console.warn('GPS error:', err);
      if (statusEl) statusEl.textContent = '❌ No se pudo obtener ubicación. Verifica permisos.';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// Muestra coordenadas en el formulario y actualiza hidden inputs
function mostrarGPSEnForm(tipo, lat, lon) {
  const prefix = tipo === 'bitacora' ? 'b' : 'nc';
  const statusEl = document.getElementById(`${prefix}-gps-status`);
  const latInput = document.getElementById(`${prefix}-gps-lat`);
  const lonInput = document.getElementById(`${prefix}-gps-lon`);
  const linkDiv  = document.getElementById(`${prefix}-gps-link`);
  const mapsLink = document.getElementById(`${prefix}-gps-maps`);

  if (latInput) latInput.value = lat;
  if (lonInput) lonInput.value = lon;

  if (statusEl) {
    statusEl.innerHTML = `✅ <strong>${lat.toFixed(6)}, ${lon.toFixed(6)}</strong>`;
  }

  if (linkDiv && mapsLink) {
    linkDiv.style.display = 'block';
    mapsLink.href = `https://www.google.com/maps?q=${lat},${lon}`;
  }
}

// Auto-capturar GPS al abrir formulario de bitácora o NC
const _originalIrA = AppRouter.irA.bind(AppRouter);
AppRouter.irA = function(screen) {
  _originalIrA(screen);
  // Si entramos al form de bitácora nueva o NC nueva, capturar GPS
  setTimeout(() => {
    if (screen === 'bitacora-form' && !State.modoEdicion) {
      const latVal = document.getElementById('b-gps-lat')?.value;
      if (!latVal) capturarGPSRegistro('bitacora');
    }
    if (screen === 'nc-form' && !State.modoEdicion) {
      const latVal = document.getElementById('nc-gps-lat')?.value;
      if (!latVal) capturarGPSRegistro('nc');
    }
  }, 300);
};
