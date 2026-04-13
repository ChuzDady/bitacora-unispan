/* =====================================================
   CAMERA.JS — Módulo de cámara y gestión de fotos
   ===================================================== */

const Camera = (() => {

  let _stream      = null;
  let _videoEl     = null;
  let _onCapture   = null;   // callback(fotoData)
  let _registroId  = null;
  let _tipoRegistro= null;
  let _maxFotos    = 8;
  let _fotosActuales = 0;

  /* ── INICIALIZAR ─────────────────────────────────── */
  function init(videoElement, { onCapture, registroId, tipoRegistro = 'bitacora', maxFotos = 8 }) {
    _videoEl      = videoElement;
    _onCapture    = onCapture;
    _registroId   = registroId;
    _tipoRegistro = tipoRegistro;
    _maxFotos     = maxFotos;
  }

  /* ── ABRIR CÁMARA ───────────────────────────────── */
  async function abrir() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Cámara trasera
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      _videoEl.srcObject = _stream;
      await _videoEl.play();
      return true;
    } catch (err) {
      console.error('Camera error:', err);
      let msg = 'No se pudo acceder a la cámara.';
      if (err.name === 'NotAllowedError')  msg = 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.';
      if (err.name === 'NotFoundError')    msg = 'No se encontró ninguna cámara en este dispositivo.';
      if (err.name === 'NotReadableError') msg = 'La cámara está siendo usada por otra aplicación.';
      throw new Error(msg);
    }
  }

  /* ── CERRAR CÁMARA ──────────────────────────────── */
  function cerrar() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_videoEl) {
      _videoEl.srcObject = null;
    }
  }

  /* ── CAPTURAR FOTO ──────────────────────────────── */
  async function capturar() {
    if (!_stream || !_videoEl) throw new Error('Cámara no inicializada');
    if (_fotosActuales >= _maxFotos) {
      throw new Error(`Máximo ${_maxFotos} fotos por registro`);
    }

    // Obtener geolocalización en paralelo con la captura
    const [geoData] = await Promise.allSettled([obtenerGPS()]);
    const { lat, lon } = geoData.status === 'fulfilled' ? geoData.value : { lat: null, lon: null };

    // Capturar frame actual del video
    const canvas  = document.createElement('canvas');
    canvas.width  = _videoEl.videoWidth;
    canvas.height = _videoEl.videoHeight;
    const ctx     = canvas.getContext('2d');
    ctx.drawImage(_videoEl, 0, 0);

    // Agregar timestamp y coordenadas sobre la imagen
    const timestamp = new Date();
    dibujarOverlay(ctx, canvas.width, canvas.height, timestamp, lat, lon);

    // Comprimir a calidad 0.7
    const blob = await new Promise(res =>
      canvas.toBlob(res, 'image/jpeg', 0.7)
    );

    // Generar thumbnail (240px de ancho)
    const thumb = await generarThumbnail(canvas);

    const fotoData = {
      registro_id:   _registroId,
      tipo_registro: _tipoRegistro,
      blob,
      thumbnail:     thumb,
      lat,
      lon,
      timestamp:     timestamp.toISOString(),
      descripcion:   null,
      numero:        _fotosActuales + 1
    };

    _fotosActuales++;

    if (_onCapture) _onCapture(fotoData);
    return fotoData;
  }

  /* ── DESDE GALERÍA (input file fallback) ─────────── */
  async function desdeArchivo(file) {
    if (_fotosActuales >= _maxFotos) {
      throw new Error(`Máximo ${_maxFotos} fotos por registro`);
    }

    const [geoData] = await Promise.allSettled([obtenerGPS()]);
    const { lat, lon } = geoData.status === 'fulfilled' ? geoData.value : { lat: null, lon: null };

    const imgEl = await fileToImage(file);

    const canvas  = document.createElement('canvas');
    canvas.width  = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx     = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);

    const timestamp = new Date(file.lastModified || Date.now());
    dibujarOverlay(ctx, canvas.width, canvas.height, timestamp, lat, lon);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.7));
    const thumb = await generarThumbnail(canvas);

    const fotoData = {
      registro_id:   _registroId,
      tipo_registro: _tipoRegistro,
      blob,
      thumbnail:     thumb,
      lat,
      lon,
      timestamp:     timestamp.toISOString(),
      descripcion:   null,
      numero:        _fotosActuales + 1
    };

    _fotosActuales++;
    if (_onCapture) _onCapture(fotoData);
    return fotoData;
  }

  /* ── HELPERS ─────────────────────────────────────── */
  function obtenerGPS() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no disponible'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => reject(err),
        { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }
      );
    });
  }

  function dibujarOverlay(ctx, w, h, timestamp, lat, lon) {
    const dateStr = timestamp.toLocaleString('es-MX', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const gpsStr  = lat != null
      ? `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`
      : 'GPS: No disponible';
    const text    = `${dateStr}  ${gpsStr}`;

    const fontSize = Math.max(14, Math.floor(h * 0.025));
    ctx.font       = `bold ${fontSize}px monospace`;
    ctx.textAlign  = 'left';

    const padding = 8;
    const boxH    = fontSize + padding * 2;
    const boxY    = h - boxH;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, boxY, w, boxH);

    // Text
    ctx.fillStyle = '#F5821F';
    ctx.fillText(text, padding, h - padding);
  }

  async function generarThumbnail(canvas) {
    const thumbW  = 240;
    const thumbH  = Math.round(canvas.height * thumbW / canvas.width);
    const tc      = document.createElement('canvas');
    tc.width  = thumbW;
    tc.height = thumbH;
    tc.getContext('2d').drawImage(canvas, 0, 0, thumbW, thumbH);
    return new Promise(res => tc.toBlob(res, 'image/jpeg', 0.6));
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function setFotosActuales(n) { _fotosActuales = n; }

  return { init, abrir, cerrar, capturar, desdeArchivo, blobToDataURL, setFotosActuales };
})();
