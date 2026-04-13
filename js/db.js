/* =====================================================
   DB.JS — IndexedDB wrapper para UNISPAN Bitácora
   Base de datos: UniSpanBitacora v1
   ===================================================== */

const DB_NAME    = 'UniSpanBitacora';
const DB_VERSION = 1;

let _db = null;

/* ── OPEN ───────────────────────────────────────────── */
function dbOpen() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      /* ── bitacoras ─────────────────────────────────── */
      if (!db.objectStoreNames.contains('bitacoras')) {
        const bs = db.createObjectStore('bitacoras', { keyPath: 'id', autoIncrement: true });
        bs.createIndex('folio',          'folio',          { unique: true });
        bs.createIndex('fecha',          'fecha',          { unique: false });
        bs.createIndex('obra',           'obra',           { unique: false });
        bs.createIndex('estado_registro','estado_registro',{ unique: false });
      }

      /* ── no_conformidades ──────────────────────────── */
      if (!db.objectStoreNames.contains('no_conformidades')) {
        const ns = db.createObjectStore('no_conformidades', { keyPath: 'id', autoIncrement: true });
        ns.createIndex('folio',   'folio',   { unique: true });
        ns.createIndex('fecha',   'fecha',   { unique: false });
        ns.createIndex('obra',    'obra',    { unique: false });
        ns.createIndex('estado',  'estado',  { unique: false });
        ns.createIndex('tipo',    'tipo',    { unique: false });
      }

      /* ── fotos ─────────────────────────────────────── */
      if (!db.objectStoreNames.contains('fotos')) {
        const fs = db.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
        fs.createIndex('registro_id',   'registro_id',   { unique: false });
        fs.createIndex('tipo_registro', 'tipo_registro', { unique: false });
        // Compound index for efficient querying
        fs.createIndex('registro_tipo', ['registro_id','tipo_registro'], { unique: false });
      }

      /* ── firmas ────────────────────────────────────── */
      if (!db.objectStoreNames.contains('firmas')) {
        const sigs = db.createObjectStore('firmas', { keyPath: 'id', autoIncrement: true });
        sigs.createIndex('registro_id',   'registro_id',   { unique: false });
        sigs.createIndex('tipo_registro', 'tipo_registro', { unique: false });
        sigs.createIndex('tipo_firma',    'tipo_firma',    { unique: false });
      }

      /* ── nc_historial ──────────────────────────────── */
      if (!db.objectStoreNames.contains('nc_historial')) {
        const nh = db.createObjectStore('nc_historial', { keyPath: 'id', autoIncrement: true });
        nh.createIndex('nc_id', 'nc_id', { unique: false });
      }

      /* ── folios (contador global de folios) ────────── */
      if (!db.objectStoreNames.contains('folios')) {
        const fol = db.createObjectStore('folios', { keyPath: 'tipo' });
        // Seed initial values
        fol.put({ tipo: 'BSO', ultimo_numero: 0, ultimo_mes: 0, ultimo_anio: 0 });
        fol.put({ tipo: 'NC',  ultimo_numero: 0, ultimo_mes: 0, ultimo_anio: 0 });
      }
    };

    req.onsuccess = e => {
      _db = e.target.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };

    req.onerror = e => reject(e.target.error);
  });
}

/* ── GENERIC HELPERS ───────────────────────────────── */
function dbTx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisifyReq(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

function getAllFromStore(storeName, indexName = null, query = null) {
  return dbOpen().then(() => {
    const store = dbTx(storeName, 'readonly');
    const target = indexName ? store.index(indexName) : store;
    return promisifyReq(query ? target.getAll(query) : target.getAll());
  });
}

function getByKey(storeName, key) {
  return dbOpen().then(() => promisifyReq(dbTx(storeName).get(key)));
}

function putRecord(storeName, record) {
  return dbOpen().then(() => {
    record.timestamp_modificacion = new Date().toISOString();
    if (!record.timestamp_creacion) record.timestamp_creacion = record.timestamp_modificacion;
    return promisifyReq(dbTx(storeName, 'readwrite').put(record));
  });
}

function deleteRecord(storeName, key) {
  return dbOpen().then(() => promisifyReq(dbTx(storeName, 'readwrite').delete(key)));
}

/* ── FOLIO GENERATION ───────────────────────────────── */
async function generarFolio(tipo) {
  // tipo = 'BSO' | 'NC'
  await dbOpen();
  const now = new Date();
  const mes  = now.getMonth() + 1;
  const anio = now.getFullYear();

  return new Promise((resolve, reject) => {
    const tx    = _db.transaction('folios', 'readwrite');
    const store = tx.objectStore('folios');
    const req   = store.get(tipo);

    req.onsuccess = e => {
      let rec = e.target.result || { tipo, ultimo_numero: 0, ultimo_mes: mes, ultimo_anio: anio };
      // Reset counter on new month/year
      if (rec.ultimo_mes !== mes || rec.ultimo_anio !== anio) {
        rec.ultimo_numero = 0;
        rec.ultimo_mes  = mes;
        rec.ultimo_anio = anio;
      }
      rec.ultimo_numero++;

      const dateStr = [
        anio,
        String(mes).padStart(2,'0'),
        String(now.getDate()).padStart(2,'0')
      ].join('');

      const folio = `${tipo}-${dateStr}-${String(rec.ultimo_numero).padStart(3,'0')}`;

      const putReq = store.put(rec);
      putReq.onsuccess = () => resolve(folio);
      putReq.onerror   = e => reject(e.target.error);
    };

    req.onerror = e => reject(e.target.error);
  });
}

/* ── BITÁCORAS ──────────────────────────────────────── */
const BitacoraDB = {
  getAll() {
    return getAllFromStore('bitacoras');
  },
  getById(id) {
    return getByKey('bitacoras', id);
  },
  async save(data) {
    if (!data.folio) data.folio = await generarFolio('BSO');
    if (!data.estado_registro) data.estado_registro = 'borrador';
    return putRecord('bitacoras', data);
  },
  delete(id) {
    return Promise.all([
      deleteRecord('bitacoras', id),
      FotoDB.deleteByRegistro(id, 'bitacora'),
      FirmaDB.deleteByRegistro(id, 'bitacora')
    ]);
  },
  getByMes(mes, anio) {
    return getAllFromStore('bitacoras').then(all =>
      all.filter(b => {
        const d = new Date(b.fecha);
        return d.getMonth() + 1 === mes && d.getFullYear() === anio;
      })
    );
  }
};

/* ── NO CONFORMIDADES ───────────────────────────────── */
const NCDB = {
  getAll() {
    return getAllFromStore('no_conformidades');
  },
  getById(id) {
    return getByKey('no_conformidades', id);
  },
  async save(data) {
    if (!data.folio) data.folio = await generarFolio('NC');
    if (!data.estado) data.estado = 'Abierta';
    const isNew = !data.id;
    const id = await putRecord('no_conformidades', data);

    // Record state history
    if (isNew) {
      await NCHistorialDB.add(id, null, 'Abierta', 'Registro inicial');
    }
    return id;
  },
  async updateEstado(id, nuevoEstado, notas = '') {
    const nc = await getByKey('no_conformidades', id);
    const estadoAnterior = nc.estado;
    nc.estado = nuevoEstado;
    if (nuevoEstado === 'Resuelta' || nuevoEstado === 'Cerrada') {
      nc.fecha_cierre = nc.fecha_cierre || new Date().toISOString().split('T')[0];
    }
    await putRecord('no_conformidades', nc);
    await NCHistorialDB.add(id, estadoAnterior, nuevoEstado, notas);
    return nc;
  },
  delete(id) {
    return Promise.all([
      deleteRecord('no_conformidades', id),
      FotoDB.deleteByRegistro(id, 'nc'),
      FirmaDB.deleteByRegistro(id, 'nc'),
      NCHistorialDB.deleteByNC(id)
    ]);
  },
  getByMes(mes, anio) {
    return getAllFromStore('no_conformidades').then(all =>
      all.filter(n => {
        const d = new Date(n.fecha_deteccion || n.timestamp_creacion);
        return d.getMonth() + 1 === mes && d.getFullYear() === anio;
      })
    );
  }
};

/* ── FOTOS ──────────────────────────────────────────── */
const FotoDB = {
  getByRegistro(registroId, tipoRegistro) {
    return dbOpen().then(() => {
      return new Promise((resolve, reject) => {
        const tx    = _db.transaction('fotos', 'readonly');
        const index = tx.objectStore('fotos').index('registro_tipo');
        const req   = index.getAll(IDBKeyRange.only([registroId, tipoRegistro]));
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror   = e => reject(e.target.error);
      });
    });
  },
  save(foto) {
    return putRecord('fotos', foto);
  },
  delete(id) {
    return deleteRecord('fotos', id);
  },
  deleteByRegistro(registroId, tipoRegistro) {
    return FotoDB.getByRegistro(registroId, tipoRegistro).then(fotos =>
      Promise.all(fotos.map(f => deleteRecord('fotos', f.id)))
    );
  }
};

/* ── FIRMAS ─────────────────────────────────────────── */
const FirmaDB = {
  getByRegistro(registroId, tipoRegistro) {
    return dbOpen().then(() =>
      getAllFromStore('firmas').then(all =>
        all.filter(f => f.registro_id === registroId && f.tipo_registro === tipoRegistro)
      )
    );
  },
  getPrincipal(registroId, tipoRegistro) {
    return FirmaDB.getByRegistro(registroId, tipoRegistro).then(sigs =>
      sigs.find(s => s.tipo_firma === 'principal') || null
    );
  },
  save(firma) {
    return putRecord('firmas', firma);
  },
  delete(id) {
    return deleteRecord('firmas', id);
  },
  deleteByRegistro(registroId, tipoRegistro) {
    return FirmaDB.getByRegistro(registroId, tipoRegistro).then(firmas =>
      Promise.all(firmas.map(f => deleteRecord('firmas', f.id)))
    );
  }
};

/* ── NC HISTORIAL ────────────────────────────────────── */
const NCHistorialDB = {
  getByNC(ncId) {
    return dbOpen().then(() =>
      getAllFromStore('nc_historial', 'nc_id', IDBKeyRange.only(ncId))
    );
  },
  add(ncId, estadoAnterior, estadoNuevo, notas = '') {
    return putRecord('nc_historial', {
      nc_id:           ncId,
      estado_anterior: estadoAnterior,
      estado_nuevo:    estadoNuevo,
      timestamp:       new Date().toISOString(),
      notas
    });
  },
  deleteByNC(ncId) {
    return NCHistorialDB.getByNC(ncId).then(items =>
      Promise.all(items.map(i => deleteRecord('nc_historial', i.id)))
    );
  }
};

/* ── EXPORT ALL ──────────────────────────────────────── */
async function exportarTodo() {
  await dbOpen();
  const [bitacoras, ncs, fotos, firmas, historial] = await Promise.all([
    getAllFromStore('bitacoras'),
    getAllFromStore('no_conformidades'),
    getAllFromStore('fotos'),
    getAllFromStore('firmas'),
    getAllFromStore('nc_historial')
  ]);
  return { bitacoras, ncs, fotos, firmas, historial };
}

/* ── DB STATS ────────────────────────────────────────── */
async function dbStats() {
  await dbOpen();
  const [bitacoras, ncs, fotos] = await Promise.all([
    getAllFromStore('bitacoras'),
    getAllFromStore('no_conformidades'),
    getAllFromStore('fotos')
  ]);
  return {
    bitacoras: bitacoras.length,
    ncs: ncs.length,
    fotos: fotos.length,
    ncs_abiertas: ncs.filter(n => n.estado === 'Abierta').length,
    ncs_en_atencion: ncs.filter(n => n.estado === 'En atención').length
  };
}
