// Prueba de cotizador sin señal: datos guardados en el celular, cotizaciones pendientes que se envían al volver la conexión.
const FOTOS = 'fotos-v1';
const $ = (id) => document.getElementById(id);
let datos = null, online = false, cot = [];

const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

function toast(t) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 3200);
}
const fmt = (n, m) => m === 'PYG'
  ? '₲ ' + Math.round(n).toLocaleString('es-PY')
  : 'US$ ' + n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const conv = (usd) => $('moneda').value === 'PYG' ? usd * datos.tc.PYG : usd;

// Conexión real: navigator.onLine no es confiable en iPhone, se prueba pidiendo un archivo chico.
async function probarConexion() {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 4000);
    const r = await fetch('ping.txt?t=' + Date.now(), { cache: 'no-store', signal: c.signal });
    return r.ok;
  } catch { return false; }
}

async function cargarDatos() {
  const guardados = leer('datos', null);
  if (online) {
    try {
      const r = await fetch('articulos.json?t=' + Date.now(), { cache: 'no-store' });
      const nuevos = await r.json();
      if (guardados && nuevos.version !== guardados.version) {
        const viejos = new Map(guardados.articulos.map(a => [a.c, a.u]));
        const cambios = nuevos.articulos.filter(a => viejos.get(a.c) !== a.u).length;
        toast(`Precios actualizados: ${cambios} cambios`);
      }
      escribir('datos', nuevos); escribir('actualizado', new Date().toISOString());
      return nuevos;
    } catch {}
  }
  return guardados;
}

function pintarBarra() {
  const pend = leer('cots', []).filter(c => c.estado === 'pendiente').length;
  const act = leer('actualizado', null);
  const cuando = act ? new Date(act).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca';
  $('bar').className = 'bar ' + (online ? 'on' : 'off');
  $('barT').textContent = online ? 'Con señal · datos al día' : 'Sin señal · trabajando con lo guardado';
  $('barS').textContent = `Datos del ${cuando}` + (datos ? ` · lista versión ${datos.version}` : '') + (pend ? ` · ${pend} pendiente(s) de enviar` : '');
}

async function espacio() {
  if (!navigator.storage?.estimate) return;
  const e = await navigator.storage.estimate();
  const mb = (x) => (x / 1048576).toFixed(0) + ' MB';
  $('espacio').textContent = `Espacio usado por la app: ${mb(e.usage)} de ${mb(e.quota)} disponibles.`;
}

async function fotosListas() {
  const c = await caches.open(FOTOS); return (await c.keys()).length;
}

async function prepararFotos() {
  if (!online) { toast('Necesitás señal para descargar las fotos'); return; }
  if (navigator.storage?.persist) navigator.storage.persist();
  $('prepBtn').disabled = true;
  const c = await caches.open(FOTOS);
  const ya = new Set((await c.keys()).map(r => new URL(r.url).pathname.split('/').pop()));
  const faltan = datos.articulos.filter(a => !ya.has(a.c + '.jpg'));
  let hechas = datos.articulos.length - faltan.length;
  const total = datos.articulos.length;
  const inicio = Date.now();
  for (let i = 0; i < faltan.length; i += 20) {
    await Promise.all(faltan.slice(i, i + 20).map(a => c.add('fotos/' + a.c + '.jpg').catch(() => {})));
    hechas = Math.min(total, hechas + 20);
    $('progBar').style.width = (hechas / total * 100) + '%';
    $('prepTxt').textContent = `Descargando fotos: ${hechas} de ${total}`;
  }
  const n = await fotosListas();
  $('prepTxt').textContent = `Listo: ${n} fotos guardadas en el celular (${Math.round((Date.now() - inicio) / 1000)} s).`;
  $('prepBtn').disabled = false; $('prepBtn').textContent = 'Revisar fotos faltantes';
  espacio();
}

function buscar() {
  const q = $('buscar').value.trim().toLowerCase();
  if (!datos || q.length < 2) { $('res').innerHTML = ''; return; }
  const m = $('moneda').value;
  const hits = datos.articulos.filter(a => (a.c + ' ' + a.d + ' ' + a.m + ' ' + a.p).toLowerCase().includes(q)).slice(0, 30);
  $('res').innerHTML = hits.length ? hits.map(a => `
    <div class="art">
      <img src="fotos/${a.c}.jpg" alt="" loading="lazy">
      <div><div class="d">${a.d}</div><div class="c">${a.c} · ${a.m} · ${a.p}</div></div>
      <div class="pr">${fmt(conv(a.u), m)}<br><button class="sec" data-c="${a.c}">Agregar</button></div>
    </div>`).join('') : '<p class="muted">Sin resultados.</p>';
}

function pintarCot() {
  const m = $('moneda').value;
  if (!cot.length) { $('lineas').innerHTML = 'Todavía no agregaste artículos.'; $('total').textContent = '—'; $('guardar').disabled = true; return; }
  $('lineas').innerHTML = '<div class="line muted"><span>Artículo</span><span>Cant.</span><span>Desc. %</span></div>' +
    cot.map((l, i) => `<div class="line"><span>${l.d}<br><small class="muted">${fmt(conv(l.u), m)} c/u</small></span>
      <input type="number" inputmode="numeric" min="1" value="${l.q}" data-i="${i}" data-k="q">
      <input type="number" inputmode="decimal" min="0" max="100" value="${l.desc}" data-i="${i}" data-k="desc"></div>`).join('');
  $('total').textContent = fmt(conv(totalUSD(cot)), m);
  $('guardar').disabled = false;
}
const totalUSD = (ls) => ls.reduce((s, l) => s + l.u * l.q * (1 - l.desc / 100), 0);

function guardar() {
  const cots = leer('cots', []);
  const aprob = cot.some(l => l.desc > datos.escala);
  cots.unshift({ id: Date.now(), cliente: $('cliente').value, moneda: $('moneda').value, tc: datos.tc.PYG,
    lineas: cot, version: datos.version, creada: new Date().toISOString(), estado: 'pendiente', aprob });
  escribir('cots', cots); cot = []; pintarCot(); pintarGuardadas(); pintarBarra();
  toast(online ? 'Cotización guardada. Enviando…' : 'Cotización guardada en el celular. Se envía al volver la señal.');
  if (online) enviarPendientes();
}

// Simula el envío al sistema: en el sistema real la cotización pasa al servidor.
async function enviarPendientes() {
  const cots = leer('cots', []);
  const pend = cots.filter(c => c.estado === 'pendiente');
  if (!pend.length || !(await probarConexion())) return;
  const precios = new Map(datos.articulos.map(a => [a.c, a.u]));
  pend.forEach(c => {
    c.estado = 'enviada'; c.enviada = new Date().toISOString();
    c.cambio = c.lineas.some(l => precios.get(l.c) !== l.u);
  });
  escribir('cots', cots); pintarGuardadas(); pintarBarra();
  toast(`${pend.length} cotización(es) enviada(s)`);
}

function pintarGuardadas() {
  const cots = leer('cots', []);
  const h = (iso) => new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
  $('guardadas').innerHTML = cots.length ? cots.slice(0, 15).map(c => `
    <div class="q"><div><b>${c.cliente}</b> · ${fmt(c.moneda === 'PYG' ? totalUSD(c.lineas) * c.tc : totalUSD(c.lineas), c.moneda)}</div>
    <div>${c.estado === 'pendiente' ? '<span class="pill pend">Pendiente de enviar</span>' : '<span class="pill env">Enviada ' + h(c.enviada) + '</span>'}
    ${c.aprob ? ' <span class="pill pend">Requiere aprobación</span>' : ''}
    ${c.cambio ? ' <span class="pill warn">Cambió un precio desde que se armó</span>' : ''}</div>
    <div class="muted">Armada a las ${h(c.creada)} · ${c.lineas.length} artículo(s) · lista v${c.version}</div></div>`).join('') : 'Ninguna todavía.';
}

$('res').addEventListener('click', (e) => {
  const c = e.target.dataset.c; if (!c) return;
  const a = datos.articulos.find(x => x.c === c);
  const ya = cot.find(l => l.c === c);
  if (ya) ya.q++; else cot.push({ c: a.c, d: a.d, u: a.u, q: 1, desc: 0 });
  pintarCot(); toast('Agregado: ' + a.d);
});
$('lineas').addEventListener('input', (e) => {
  const i = e.target.dataset.i; if (i === undefined) return;
  cot[i][e.target.dataset.k] = Math.max(0, Number(e.target.value) || 0);
  $('total').textContent = fmt(conv(totalUSD(cot)), $('moneda').value);
});
$('buscar').addEventListener('input', buscar);
$('moneda').addEventListener('change', () => { buscar(); pintarCot(); });
$('guardar').addEventListener('click', guardar);
$('prepBtn').addEventListener('click', prepararFotos);

async function revisar() {
  const antes = online;
  online = await probarConexion();
  if (online && !antes) { datos = await cargarDatos() || datos; buscar(); await enviarPendientes(); }
  pintarBarra();
}

(async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  online = await probarConexion();
  datos = await cargarDatos();
  if (!datos) { $('barT').textContent = 'Abrí la app una vez con señal para bajar los datos'; return; }
  $('escala').textContent = datos.escala;
  const n = await fotosListas();
  if (n >= datos.articulos.length) { $('prepTxt').textContent = `Listo: ${n} fotos guardadas en el celular.`; $('prepBtn').textContent = 'Revisar fotos faltantes'; $('progBar').style.width = '100%'; }
  else if (n) { $('prepTxt').textContent = `Hay ${n} de ${datos.articulos.length} fotos guardadas.`; $('progBar').style.width = (n / datos.articulos.length * 100) + '%'; }
  pintarBarra(); pintarGuardadas(); espacio();
  if (online) enviarPendientes();
  setInterval(revisar, 15000);
  window.addEventListener('online', revisar); window.addEventListener('offline', revisar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
})();
