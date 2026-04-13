/* =====================================================
   SIGNATURE.JS — Pad de firma digital sobre canvas táctil
   ===================================================== */

const SignaturePad = (() => {

  let _canvas   = null;
  let _ctx      = null;
  let _isDrawing= false;
  let _isEmpty  = true;
  let _lastX    = 0;
  let _lastY    = 0;

  /* ── INICIALIZAR ─────────────────────────────────── */
  function init(canvasEl) {
    _canvas = canvasEl;
    _ctx    = canvasEl.getContext('2d');
    _isEmpty = true;

    // Adaptar al DPI real del dispositivo
    ajustarDPI();

    // Estilos del trazo
    _ctx.strokeStyle = '#003D7C';
    _ctx.lineWidth   = 2.5;
    _ctx.lineCap     = 'round';
    _ctx.lineJoin    = 'round';

    // Fondo blanco
    limpiar();

    // Eventos táctiles
    _canvas.addEventListener('touchstart',  onTouchStart, { passive: false });
    _canvas.addEventListener('touchmove',   onTouchMove,  { passive: false });
    _canvas.addEventListener('touchend',    onTouchEnd,   { passive: false });
    _canvas.addEventListener('touchcancel', onTouchEnd,   { passive: false });

    // Eventos de mouse (desktop / emulación)
    _canvas.addEventListener('mousedown', onMouseDown);
    _canvas.addEventListener('mousemove', onMouseMove);
    _canvas.addEventListener('mouseup',   onMouseUp);
    _canvas.addEventListener('mouseleave',onMouseUp);
  }

  /* ── DPI ADJUSTMENT ──────────────────────────────── */
  function ajustarDPI() {
    const dpr   = window.devicePixelRatio || 1;
    const rect  = _canvas.getBoundingClientRect();
    const cssW  = rect.width  || _canvas.offsetWidth  || 360;
    const cssH  = rect.height || _canvas.offsetHeight || 250;

    _canvas.width  = cssW * dpr;
    _canvas.height = cssH * dpr;

    _canvas.style.width  = cssW + 'px';
    _canvas.style.height = cssH + 'px';

    _ctx.scale(dpr, dpr);
    _ctx.strokeStyle = '#003D7C';
    _ctx.lineWidth   = 2.5;
    _ctx.lineCap     = 'round';
    _ctx.lineJoin    = 'round';
  }

  /* ── LIMPIAR ─────────────────────────────────────── */
  function limpiar() {
    _canvas.closest('.firma-container')?.classList.remove('has-signature');
    _ctx.fillStyle = '#FFFFFF';
    _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

    // Línea guía de firma
    const cssH = parseInt(_canvas.style.height || '250');
    const cssW = parseInt(_canvas.style.width  || '360');
    const lineY = cssH * 0.75;

    _ctx.save();
    _ctx.strokeStyle = '#CCCCCC';
    _ctx.lineWidth   = 1;
    _ctx.setLineDash([6, 4]);
    _ctx.beginPath();
    _ctx.moveTo(20, lineY);
    _ctx.lineTo(cssW - 20, lineY);
    _ctx.stroke();

    // Texto "Firme aquí"
    _ctx.fillStyle   = '#AAAAAA';
    _ctx.font        = '13px Barlow, Arial, sans-serif';
    _ctx.textAlign   = 'center';
    _ctx.fillText('Firme aquí', cssW / 2, lineY - 8);
    _ctx.restore();

    _isEmpty = true;
  }

  /* ── TOUCH HANDLERS ──────────────────────────────── */
  function getPos(touchOrMouse) {
    const rect = _canvas.getBoundingClientRect();
    if (touchOrMouse.touches) {
      const t = touchOrMouse.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: touchOrMouse.clientX - rect.left, y: touchOrMouse.clientY - rect.top };
  }

  function onTouchStart(e) {
    e.preventDefault();
    const pos = getPos(e);
    comenzar(pos.x, pos.y);
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!_isDrawing) return;
    const pos = getPos(e);
    dibujar(pos.x, pos.y);
  }

  function onTouchEnd(e) {
    e.preventDefault();
    finalizar();
  }

  function onMouseDown(e) {
    const pos = getPos(e);
    comenzar(pos.x, pos.y);
  }

  function onMouseMove(e) {
    if (!_isDrawing) return;
    const pos = getPos(e);
    dibujar(pos.x, pos.y);
  }

  function onMouseUp() {
    finalizar();
  }

  /* ── DRAWING CORE ────────────────────────────────── */
  function comenzar(x, y) {
    _isDrawing = true;
    _isEmpty   = false;
    _lastX = x;
    _lastY = y;
    _ctx.beginPath();
    _ctx.moveTo(x, y);
    // Visual: cambiar borde de dashed a solid al primer trazo
    _canvas.closest('.firma-container')?.classList.add('has-signature');
  }

  function dibujar(x, y) {
    _ctx.strokeStyle = '#003D7C';
    _ctx.lineWidth   = 2.5;

    // Suavizado con curva cuadrática
    const midX = (_lastX + x) / 2;
    const midY = (_lastY + y) / 2;
    _ctx.quadraticCurveTo(_lastX, _lastY, midX, midY);
    _ctx.stroke();
    _ctx.beginPath();
    _ctx.moveTo(midX, midY);

    _lastX = x;
    _lastY = y;
  }

  function finalizar() {
    if (!_isDrawing) return;
    _isDrawing = false;
    _ctx.beginPath();
  }

  /* ── EXPORTAR ─────────────────────────────────────── */
  function estaVacia() {
    return _isEmpty;
  }

  function exportarPNG() {
    // Devuelve data URL PNG
    return _canvas.toDataURL('image/png');
  }

  function exportarBlob() {
    return new Promise(resolve => _canvas.toBlob(resolve, 'image/png'));
  }

  /* ── DESTRUIR ─────────────────────────────────────── */
  function destroy() {
    if (!_canvas) return;
    _canvas.removeEventListener('touchstart',  onTouchStart);
    _canvas.removeEventListener('touchmove',   onTouchMove);
    _canvas.removeEventListener('touchend',    onTouchEnd);
    _canvas.removeEventListener('touchcancel', onTouchEnd);
    _canvas.removeEventListener('mousedown',   onMouseDown);
    _canvas.removeEventListener('mousemove',   onMouseMove);
    _canvas.removeEventListener('mouseup',     onMouseUp);
    _canvas.removeEventListener('mouseleave',  onMouseUp);
    _canvas = null;
    _ctx    = null;
  }

  return { init, limpiar, estaVacia, exportarPNG, exportarBlob, destroy };
})();
