// ==========================================
// CONFIGURACIÓN SUPABASE - ESQUEMA INTERAUTO
// ==========================================
const SUPABASE_URL = 'https://zzelbikylbbxclnskgkf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZWxiaWt5bGJieGNsbnNrZ2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MjA4NDMsImV4cCI6MjA4MTQ5Njg0M30.VGqblbw-vjQWUTpz8Xdhk5MNLyNniXvAO9moMWVAd8s';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'interauto' },
});

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let ventasData = [];
let metasMensuales = [];
let ventasAgrupadas = [];
let chartVentas = null;

const estado = {
  mesSeleccionado: ''
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', initDashboard);

async function initDashboard() {
  const loader = document.getElementById('loader');

  try {
    actualizarLoaderProgress(10, 'Conectando con servidor...');

    // Cargar datos de ventas (tabla comercial)
    actualizarLoaderProgress(30, 'Cargando ventas...');
    let rawVentas = [];
    try {
      const { data, error } = await supabaseClient.from('comercial').select('*');
      if (error) {
        console.warn('Error cargando ventas:', error.message);
      } else {
        rawVentas = data || [];
      }
    } catch (e) {
      console.warn('Error en consulta ventas:', e);
    }
    ventasData = rawVentas;

    // Cargar metas mensuales
    actualizarLoaderProgress(50, 'Cargando metas...');
    let rawMetas = [];
    try {
      const { data, error } = await supabaseClient.from('metas_mensuales').select('*');
      if (error) {
        console.warn('Error cargando metas:', error.message);
      } else {
        rawMetas = data || [];
      }
    } catch (e) {
      console.warn('Error en consulta metas:', e);
    }
    metasMensuales = rawMetas;

    actualizarLoaderProgress(80, 'Procesando datos...');

    // Agrupar ventas por mes
    ventasAgrupadas = agruparVentasPorMes(ventasData);

    // Configurar selector de mes
    configurarSelectorMes();

    // Establecer mes inicial
    if (ventasAgrupadas.length > 0) {
      estado.mesSeleccionado = ventasAgrupadas[0].clave;
    }

    actualizarLoaderProgress(100, 'Listo');

    // Actualizar dashboard
    actualizarDashboard();

    // Año en footer
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    console.log(`✅ Dashboard cargado. Ventas: ${ventasData.length}, Metas: ${metasMensuales.length}`);

  } catch (error) {
    console.error('❌ Error crítico:', error);
    actualizarLoaderProgress(100, 'Error al cargar');
  }

  // Siempre ocultar el loader
  setTimeout(() => {
    if (loader) loader.classList.add('hidden');
  }, 500);
}

// ==========================================
// FUNCIONES DE AGRUPACIÓN
// ==========================================
function agruparVentasPorMes(ventas) {
  const agrupado = {};

  ventas.forEach(v => {
    if (!v.fecha) return;

    const fechaObj = new Date(v.fecha);
    if (isNaN(fechaObj.getTime())) return;

    const year = fechaObj.getFullYear();
    const mes = fechaObj.getMonth();
    const clave = `${year}-${String(mes + 1).padStart(2, '0')}`;

    if (!agrupado[clave]) {
      agrupado[clave] = {
        clave,
        anio: year,
        mesNumero: mes,
        unidades: 0,
        modelos: {},
        vendedores: {}
      };
    }

    agrupado[clave].unidades += 1;

    // Contar modelos
    const modelo = (v.modelo || 'Sin Modelo').toUpperCase();
    agrupado[clave].modelos[modelo] = (agrupado[clave].modelos[modelo] || 0) + 1;

    // Contar ventas por vendedor
    const vendedor = v.vendedor || 'Sin Asignar';
    if (!agrupado[clave].vendedores[vendedor]) {
      agrupado[clave].vendedores[vendedor] = { ventas: 0 };
    }
    agrupado[clave].vendedores[vendedor].ventas += 1;
  });

  return Object.values(agrupado).sort((a, b) => (b.anio - a.anio) || (b.mesNumero - a.mesNumero));
}

function obtenerMetaMensual(clave) {
  if (!clave || !metasMensuales || metasMensuales.length === 0) {
    return { meta: 0, prospectos: 0 };
  }

  const [anio, mes] = clave.split('-');
  const metaEncontrada = metasMensuales.find(m => 
    m.año === parseInt(anio) && m.mes === parseInt(mes)
  );

  return {
    meta: metaEncontrada?.meta_unidades || 0,
    prospectos: metaEncontrada?.prospectos || 0
  };
}

// ==========================================
// ACTUALIZACIÓN DEL DASHBOARD
// ==========================================
function actualizarDashboard() {
  const mesVentas = ventasAgrupadas.find(v => v.clave === estado.mesSeleccionado);
  const metaMensual = obtenerMetaMensual(estado.mesSeleccionado);

  // 1. Unidades Vendidas
  const unidades = mesVentas?.unidades || 0;
  setTextById('kpi-unidades', unidades);
  setTextById('kpi-unidades-detalle', mesVentas ? `${obtenerNombreMes(mesVentas.mesNumero)} ${mesVentas.anio}` : 'Sin datos');

  // 2. Meta de Ventas (en unidades)
  const meta = metaMensual.meta;
  const porcentajeMeta = meta > 0 ? Math.min(100, (unidades / meta) * 100) : 0;

  setTextById('kpi-meta', `${meta} unidades`);
  document.getElementById('meta-bar').style.width = `${porcentajeMeta}%`;
  setTextById('meta-actual', `${unidades} vendidas`);
  setTextById('meta-porcentaje', `${porcentajeMeta.toFixed(1)}%`);

  // 3. Crecimiento MoM (comparar con mes anterior)
  const crecimiento = calcularCrecimientoMoM();
  const elCrecimiento = document.getElementById('kpi-crecimiento');
  setTextById('kpi-crecimiento', `${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(1)}%`);
  if (elCrecimiento) {
    elCrecimiento.className = 'value';
    elCrecimiento.classList.add(crecimiento >= 0 ? 'trend-positive' : 'trend-negative');
  }

  // 4. Prospectos
  const prospectos = metaMensual.prospectos;
  setTextById('kpi-prospectos', prospectos);
  setTextById('kpi-prospectos-detalle', 'Leads activos este mes');

  // 5. Ranking de Vendedores
  actualizarRankingVendedores(mesVentas);

  // 6. Modelos Vendidos
  actualizarModelosVendidos(mesVentas);

  // 7. Gráfico últimos 3 meses
  renderGraficoVentas();
}

function calcularCrecimientoMoM() {
  const idx = ventasAgrupadas.findIndex(v => v.clave === estado.mesSeleccionado);
  if (idx === -1 || idx >= ventasAgrupadas.length - 1) return 0;

  const mesActual = ventasAgrupadas[idx];
  const mesAnterior = ventasAgrupadas[idx + 1];

  if (!mesAnterior || mesAnterior.unidades === 0) {
    return mesActual.unidades > 0 ? 100 : 0;
  }

  return ((mesActual.unidades - mesAnterior.unidades) / mesAnterior.unidades) * 100;
}

function actualizarRankingVendedores(mesVentas) {
  const container = document.getElementById('ranking-vendedores');
  if (!container) return;

  if (!mesVentas || Object.keys(mesVentas.vendedores).length === 0) {
    container.innerHTML = `
      <div class="ranking-item">
        <div class="ranking-position">-</div>
        <div class="ranking-info">
          <p class="ranking-name">Sin datos de vendedores</p>
          <p class="ranking-stats">Verifica la tabla comercial</p>
        </div>
        <span class="ranking-value">-</span>
      </div>
    `;
    return;
  }

  const vendedoresOrdenados = Object.entries(mesVentas.vendedores)
    .map(([nombre, datos]) => ({ nombre, ...datos }))
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, 5);

  container.innerHTML = vendedoresOrdenados.map((v, idx) => {
    const posClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
    return `
      <div class="ranking-item" onclick="mostrarVentasVendedor('${v.nombre.replace(/'/g, "\\'")}')">
        <div class="ranking-position ${posClass}">${idx + 1}</div>
        <div class="ranking-info">
          <p class="ranking-name">${v.nombre}</p>
          <p class="ranking-stats">${v.ventas} ${v.ventas === 1 ? 'venta' : 'ventas'}</p>
        </div>
        <span class="ranking-value">${v.ventas} unidades</span>
      </div>
    `;
  }).join('');
}

// ==========================================
// MODAL VENDEDOR - MOSTRAR VENTAS
// ==========================================
function mostrarVentasVendedor(nombreVendedor) {
  const modal = document.getElementById('modal-vendedor');
  if (!modal) return;

  // Filtrar ventas del vendedor en el mes seleccionado
  const ventasVendedor = ventasData.filter(v => {
    if (!v.fecha || v.vendedor !== nombreVendedor) return false;
    const fechaObj = new Date(v.fecha);
    const year = fechaObj.getFullYear();
    const mes = fechaObj.getMonth();
    const clave = `${year}-${String(mes + 1).padStart(2, '0')}`;
    return clave === estado.mesSeleccionado;
  });

  // Actualizar título
  document.getElementById('modal-vendedor-nombre').textContent = `Ventas de ${nombreVendedor}`;

  // Actualizar estadísticas
  document.getElementById('modal-total-ventas').textContent = ventasVendedor.length;

  const modelosUnicos = new Set(ventasVendedor.map(v => (v.modelo || 'Sin Modelo').toUpperCase()));
  document.getElementById('modal-modelos-distintos').textContent = modelosUnicos.size;

  // Crear lista de ventas
  const detalleContainer = document.getElementById('modal-ventas-detalle');
  if (ventasVendedor.length === 0) {
    detalleContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No hay ventas registradas</p>';
  } else {
    // Ordenar por fecha descendente
    const ventasOrdenadas = ventasVendedor.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    detalleContainer.innerHTML = ventasOrdenadas.map(v => {
      const fecha = new Date(v.fecha);
      const fechaFormateada = fecha.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      const modelo = (v.modelo || 'Sin Modelo').toUpperCase();

      return `
        <div class="modal-venta-item">
          <div class="modal-venta-info">
            <p class="modal-venta-modelo">${modelo}</p>
            <p class="modal-venta-fecha">${fechaFormateada}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // Mostrar modal
  modal.classList.add('active');
}

function cerrarModalVendedor() {
  const modal = document.getElementById('modal-vendedor');
  if (modal) modal.classList.remove('active');
}

// Event listeners para el modal
document.addEventListener('DOMContentLoaded', function() {
  const btnClose = document.getElementById('modal-vendedor-close');
  if (btnClose) {
    btnClose.addEventListener('click', cerrarModalVendedor);
  }

  const modal = document.getElementById('modal-vendedor');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        cerrarModalVendedor();
      }
    });
  }

  // Botón descarga PNG ranking
  const btnDownload = document.getElementById('btn-download-ranking');
  if (btnDownload) {
    btnDownload.addEventListener('click', descargarRankingPNG);
  }
});

// ==========================================
// DESCARGA PNG DEL RANKING
// ==========================================
function descargarRankingPNG() {
  const rankingCard = document.getElementById('ranking-card-container');
  if (!rankingCard) return;

  // Ocultar temporalmente el botón de descarga
  const btnDownload = document.getElementById('btn-download-ranking');
  if (btnDownload) btnDownload.style.visibility = 'hidden';

  html2canvas(rankingCard, {
    backgroundColor: '#faf7f2',
    scale: 2,
    logging: false,
    useCORS: true
  }).then(canvas => {
    // Restaurar botón
    if (btnDownload) btnDownload.style.visibility = 'visible';

    // Crear link de descarga
    const link = document.createElement('a');
    const mesNombre = estado.mesSeleccionado.replace('-', '_');
    link.download = `ranking_vendedores_${mesNombre}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(err => {
    console.error('Error al generar PNG:', err);
    if (btnDownload) btnDownload.style.visibility = 'visible';
  });
}

function actualizarModelosVendidos(mesVentas) {
  const container = document.getElementById('modelos-vendidos');
  if (!container) return;

  if (!mesVentas || Object.keys(mesVentas.modelos).length === 0) {
    container.innerHTML = `
      <div class="modelo-item">
        <span class="modelo-nombre">Sin datos</span>
        <span class="modelo-cantidad">0</span>
      </div>
    `;
    return;
  }

  const modelosOrdenados = Object.entries(mesVentas.modelos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  container.innerHTML = modelosOrdenados.map(([modelo, cantidad]) => `
    <div class="modelo-item">
      <span class="modelo-nombre">${modelo}</span>
      <span class="modelo-cantidad">${cantidad}</span>
    </div>
  `).join('');
}

function renderGraficoVentas() {
  const canvas = document.getElementById('chart-ventas');
  if (!canvas) return;

  if (chartVentas) chartVentas.destroy();

  // Obtener últimos 3 meses de datos
  const ultimos3Meses = ventasAgrupadas.slice(0, 3).reverse();

  if (ultimos3Meses.length === 0) {
    return;
  }

  const ctx = canvas.getContext('2d');

  // Obtener metas para los últimos 3 meses
  const metasUltimos3 = ultimos3Meses.map(m => obtenerMetaMensual(m.clave).meta);

  chartVentas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ultimos3Meses.map(d => `${obtenerNombreMes(d.mesNumero).substring(0, 3)} ${d.anio}`),
      datasets: [
        {
          label: 'Unidades Vendidas',
          data: ultimos3Meses.map(d => d.unidades),
          backgroundColor: 'rgba(26, 26, 26, 0.85)',
          borderColor: '#1a1a1a',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Meta',
          data: metasUltimos3,
          type: 'line',
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 6,
          pointBackgroundColor: '#22c55e',
          fill: false,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#1a1a1a', font: { size: 12 } }
        },
        tooltip: {
          backgroundColor: 'rgba(26,26,26,0.95)',
          titleColor: '#fff',
          bodyColor: '#fff',
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.raw} unidades`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#666666', font: { size: 12 } },
          grid: { display: false }
        },
        y: {
          ticks: {
            color: '#666666',
            stepSize: 1
          },
          grid: { color: 'rgba(0,0,0,0.08)' }
        }
      }
    }
  });
}

// ==========================================
// CONFIGURACIÓN DE FILTROS
// ==========================================
function configurarSelectorMes() {
  const select = document.getElementById('filtro-mes');
  if (!select) return;

  // Obtener todos los meses de ventas
  const mesesOrdenados = ventasAgrupadas.map(v => v.clave);

  if (mesesOrdenados.length === 0) {
    select.innerHTML = '<option value="">Sin datos disponibles</option>';
    return;
  }

  select.innerHTML = mesesOrdenados.map(clave => {
    const [anio, mes] = clave.split('-');
    const nombreMes = obtenerNombreMes(parseInt(mes) - 1);
    return `<option value="${clave}">${nombreMes} ${anio}</option>`;
  }).join('');

  select.addEventListener('change', (e) => {
    mostrarOverlay();
    estado.mesSeleccionado = e.target.value;
    setTimeout(() => {
      actualizarDashboard();
      ocultarOverlay();
    }, 300);
  });
}

// ==========================================
// UI HELPERS
// ==========================================
function actualizarLoaderProgress(porcentaje, texto) {
  const progressBar = document.getElementById('loader-progress');
  const loaderText = document.getElementById('loader-text');

  if (progressBar) progressBar.style.width = `${porcentaje}%`;
  if (loaderText && texto) loaderText.textContent = texto;
}

function mostrarOverlay() {
  const overlay = document.getElementById('updating-overlay');
  if (overlay) overlay.classList.add('active');
}

function ocultarOverlay() {
  const overlay = document.getElementById('updating-overlay');
  if (overlay) overlay.classList.remove('active');
}

function setTextById(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function obtenerNombreMes(idx) {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[idx] || '';
}