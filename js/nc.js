/* =====================================================
   NC.JS — Módulo de No Conformidades (FOR-P.CA-014)
   ===================================================== */

const NCModule = (() => {

  const ESTADOS = ['Abierta', 'En atención', 'Resuelta', 'Cerrada'];
  const TIPOS   = ['Calidad de Producto', 'Diseño de Ingeniería', 'Logística'];
  const COLORES_ESTADO = {
    'Abierta':     '#C0392B',
    'En atención': '#E67E22',
    'Resuelta':    '#27AE60',
    'Cerrada':     '#7F8C8D'
  };
  const ICONOS_TIPO = {
    'Calidad de Producto':   '🔴',
    'Diseño de Ingeniería':  '🟡',
    'Logística':             '🔵'
  };

  /* ── CHIP DE ESTADO ──────────────────────────────── */
  function chipEstado(estado) {
    const color = COLORES_ESTADO[estado] || '#999';
    return `<span class="chip" style="background:${color}">${estado}</span>`;
  }

  function chipTipo(tipo) {
    return `<span class="chip chip-outline">${ICONOS_TIPO[tipo] || ''} ${tipo}</span>`;
  }

  /* ── RENDERIZAR LISTA DE NCs ─────────────────────── */
  async function renderizarLista(contenedorEl, filtros = {}) {
    let ncs = await NCDB.getAll();

    // Filtros
    if (filtros.estado) ncs = ncs.filter(n => n.estado === filtros.estado);
    if (filtros.tipo)   ncs = ncs.filter(n => n.tipo === filtros.tipo);
    if (filtros.obra)   ncs = ncs.filter(n => (n.obra || '').toLowerCase().includes(filtros.obra.toLowerCase()));
    if (filtros.texto)  {
      const q = filtros.texto.toLowerCase();
      ncs = ncs.filter(n =>
        (n.folio || '').toLowerCase().includes(q) ||
        (n.obra  || '').toLowerCase().includes(q) ||
        (n.descripcion || '').toLowerCase().includes(q)
      );
    }

    // Ordenar: más recientes primero
    ncs.sort((a, b) => (b.timestamp_creacion || '') > (a.timestamp_creacion || '') ? 1 : -1);

    if (ncs.length === 0) {
      contenedorEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>No hay No Conformidades registradas</p>
          <small>Usa el botón "⚠ Nueva NC" para crear una</small>
        </div>`;
      return;
    }

    contenedorEl.innerHTML = ncs.map(nc => `
      <div class="card card-nc" data-id="${nc.id}" data-tipo="nc">
        <div class="card-header">
          <span class="card-folio">${nc.folio || 'Sin folio'}</span>
          ${chipEstado(nc.estado)}
        </div>
        <div class="card-body">
          <div class="card-obra">${nc.obra || 'Sin obra'}</div>
          <div class="card-meta">
            ${chipTipo(nc.tipo)}
            <span class="card-fecha">${formatFecha(nc.fecha_deteccion || nc.timestamp_creacion)}</span>
          </div>
          <div class="card-desc">${(nc.descripcion || '').slice(0, 100)}${nc.descripcion?.length > 100 ? '…' : ''}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-outline" onclick="NCModule.abrirDetalle(${nc.id})">Ver detalle</button>
          <button class="btn btn-sm btn-primary" onclick="AppRouter.irA('nc-pdf', ${nc.id})">PDF</button>
          <button class="btn btn-sm btn-danger" onclick="NCModule.confirmarEliminar(${nc.id})">🗑</button>
        </div>
      </div>
    `).join('');
  }

  /* ── DETALLE DE NC ───────────────────────────────── */
  async function abrirDetalle(id) {
    const [nc, historial] = await Promise.all([
      NCDB.getById(id),
      NCHistorialDB.getByNC(id)
    ]);
    if (!nc) { Toast.show('NC no encontrada', 'error'); return; }

    const modal = document.getElementById('modal-nc-detalle');
    if (!modal) return;

    document.getElementById('modal-nc-titulo').textContent = nc.folio;
    document.getElementById('modal-nc-body').innerHTML = `
      <div class="detalle-section">
        ${chipEstado(nc.estado)} ${chipTipo(nc.tipo)}
      </div>
      <div class="detalle-grid">
        <div><strong>Obra:</strong> ${nc.obra || '—'}</div>
        <div><strong>Contrato:</strong> ${nc.contrato || '—'}</div>
        <div><strong>Supervisor:</strong> ${nc.supervisor || '—'}</div>
        <div><strong>Administrador:</strong> ${nc.administrador || '—'}</div>
        <div><strong>Impacto:</strong> <span class="badge-impacto badge-${(nc.impacto||'').toLowerCase()}">${nc.impacto || '—'}</span></div>
        <div><strong>Responsable:</strong> ${nc.responsable || '—'}</div>
      </div>
      <div class="detalle-field">
        <strong>Descripción:</strong>
        <p>${nc.descripcion || '—'}</p>
      </div>
      <div class="detalle-field">
        <strong>Causa raíz:</strong>
        <p>${nc.causa_raiz || '—'}</p>
      </div>
      <div class="detalle-field">
        <strong>Acciones correctivas:</strong>
        <p>${nc.acciones_correctivas || '—'}</p>
      </div>
      ${nc.estado === 'Resuelta' || nc.estado === 'Cerrada' ? `
        <div class="detalle-field detalle-resolucion">
          <strong>Resolución:</strong>
          <p>${nc.descripcion_resolucion || '—'}</p>
          <span>Eficacia: <strong>${nc.eficacia || '—'}</strong></span>
        </div>
      ` : ''}
      <div class="detalle-historial">
        <strong>Historial de estados</strong>
        <ul>
          ${historial.map(h => `
            <li>
              <span class="hist-ts">${new Date(h.timestamp).toLocaleString('es-MX')}</span>
              <span class="hist-cambio">${h.estado_anterior || 'Inicio'} → ${h.estado_nuevo}</span>
              ${h.notas ? `<span class="hist-notas">${h.notas}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="detalle-actions">
        <button class="btn btn-primary" onclick="NCModule.mostrarCambioEstado(${nc.id},'${nc.estado}')">
          Actualizar estado
        </button>
        <button class="btn btn-outline" onclick="AppRouter.irA('nc-pdf', ${nc.id})">
          Generar PDF
        </button>
        <button class="btn btn-outline" onclick="AppRouter.irA('nc-form', ${nc.id})">
          Editar NC
        </button>
      </div>
    `;

    modal.classList.add('active');
    modal.dataset.ncId = id;
  }

  /* ── CAMBIO DE ESTADO ────────────────────────────── */
  function mostrarCambioEstado(id, estadoActual) {
    const siguientes = ESTADOS.filter(e => e !== estadoActual);
    const modal = document.getElementById('modal-cambio-estado');
    if (!modal) return;

    document.getElementById('cambio-estado-select').innerHTML =
      siguientes.map(e => `<option value="${e}">${e}</option>`).join('');
    document.getElementById('cambio-estado-notas').value = '';

    modal.dataset.ncId = id;
    modal.classList.add('active');
  }

  async function confirmarCambioEstado() {
    const modal    = document.getElementById('modal-cambio-estado');
    const id       = parseInt(modal.dataset.ncId);
    const estado   = document.getElementById('cambio-estado-select').value;
    const notas    = document.getElementById('cambio-estado-notas').value.trim();

    try {
      Loading.show('Actualizando estado…');
      await NCDB.updateEstado(id, estado, notas);
      modal.classList.remove('active');

      // Refrescar detalle si está abierto
      const detalleModal = document.getElementById('modal-nc-detalle');
      if (detalleModal?.classList.contains('active')) {
        await abrirDetalle(id);
      }

      Toast.show(`Estado actualizado: ${estado}`, 'success');

      // Refrescar lista
      const lista = document.getElementById('nc-lista-container');
      if (lista) await renderizarLista(lista);

    } catch(e) {
      Toast.show('Error al actualizar: ' + e.message, 'error');
    } finally {
      Loading.hide();
    }
  }

  /* ── ELIMINAR NC ─────────────────────────────────── */
  async function confirmarEliminar(id) {
    if (!confirm('¿Eliminar esta No Conformidad? Esta acción no se puede deshacer.')) return;
    try {
      await NCDB.delete(id);
      Toast.show('NC eliminada', 'success');
      const lista = document.getElementById('nc-lista-container');
      if (lista) await renderizarLista(lista);
    } catch(e) {
      Toast.show('Error al eliminar: ' + e.message, 'error');
    }
  }

  /* ── HELPERS ─────────────────────────────────────── */
  function formatFecha(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('es-MX'); }
    catch(e) { return iso; }
  }

  return {
    ESTADOS, TIPOS, COLORES_ESTADO, ICONOS_TIPO,
    chipEstado, chipTipo,
    renderizarLista,
    abrirDetalle,
    mostrarCambioEstado,
    confirmarCambioEstado,
    confirmarEliminar
  };
})();
