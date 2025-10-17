// ===============================
// 📌 VARIABLES GLOBALES
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const spinner = document.getElementById("spinner");
const barraProgresoRelleno = document.querySelector(".relleno");
const barraProgresoTexto = document.getElementById("porcentaje");
const contenedorNumeros = document.getElementById("listaDisponibles");

let CONFIG = {};
let PAGO_PENDIENTE = { nombre: null, correo: null, telefono: null, reference: null, amount: 0 };

// ===============================
// ⚙️ CARGAR CONFIGURACIÓN
// ===============================
async function cargarConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("Error al obtener configuración");
    const data = await res.json();
    if (!data.exito) throw new Error("Configuración inválida");
    CONFIG = data;
    console.log("✅ Configuración cargada:", CONFIG);
  } catch (err) {
    console.error("❌ Error cargando configuración:", err);
    mostrarMensaje("🚫 No se pudo cargar la configuración. Intenta más tarde.", "error");
  }
}

// ===============================
// 💡 FUNCIONES UTILITARIAS
// ===============================
function obtenerNumerosSeleccionados() {
  return Array.from(document.querySelectorAll(".numero.seleccionado")).map((btn) =>
    String(btn.textContent).padStart(3, "0")
  );
}

function mostrarMensaje(texto, tipo = "info") {
  if (!mensaje) return;
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

function actualizarBarra(vendidos = 0, porcentaje = 0) {
  if (!barraProgresoRelleno || !barraProgresoTexto) return;

  const colorGradiente =
    porcentaje < 50
      ? ["#E74C3C", "#C0392B"]
      : porcentaje < 90
      ? ["#F39C12", "#E67E22"]
      : ["#27AE60", "#2ECC71"];

  barraProgresoRelleno.style.width = `${porcentaje}%`;
  barraProgresoRelleno.style.background = `linear-gradient(90deg, ${colorGradiente[0]}, ${colorGradiente[1]})`;
  barraProgresoTexto.textContent = `Progreso: ${porcentaje.toFixed(1)}% vendido (${vendidos} de 1000)`;
}

// ===============================
// 🔄 CARGAR NÚMEROS Y PROGRESO
// ===============================
async function actualizarEstadoGlobal() {
  try {
    const resNumeros = await fetch("/api/tickets/numeros");
    const dataNumeros = await resNumeros.json();
    if (!dataNumeros.exito) throw new Error("Error al obtener los números");

    contenedorNumeros.innerHTML = "";

    dataNumeros.numeros.forEach((item) => {
      const btn = document.createElement("button");
      btn.textContent = String(item.numero).padStart(3, "0");
      btn.className = `numero ${item.disponible ? "disponible" : "ocupado"}`;
      btn.disabled = !item.disponible;

      if (item.disponible) {
        btn.addEventListener("click", () => btn.classList.toggle("seleccionado"));
      }

      contenedorNumeros.appendChild(btn);
    });

    // Cargar progreso
    const resConsulta = await fetch("/api/tickets/consulta");
    const dataConsulta = await resConsulta.json();
    if (dataConsulta.exito) {
      const vendidos = dataConsulta.total ?? Math.round((dataConsulta.porcentaje / 100) * 1000);
      const porcentaje = parseFloat(dataConsulta.porcentaje) || 0;
      actualizarBarra(vendidos, porcentaje);
    }
  } catch (err) {
    console.error("❌ Error actualizando estado global:", err);
    mostrarMensaje("🚫 Error al cargar datos de la rifa.", "error");
  }
}

// ===============================
// 💳 Evento: Reservar y Pagar
// ===============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = form.nombre.value.trim();
  const correo = form.correo.value.trim();
  const telefono = form.telefono.value.trim();
  const numeros = obtenerNumerosSeleccionados();

  if (!nombre || !correo || numeros.length === 0) {
    return mostrarMensaje("⚠️ Completa tus datos y selecciona al menos un número.", "error");
  }

  mostrarMensaje("Procesando reserva...", "info");
  spinner.style.display = "block";

  try {
    // 1️⃣ Enviar datos al backend para crear preferencia
    const referencia = `RIFA-${Date.now()}`;
    const monto = (CONFIG.precio || 5000) * numeros.length;

    const res = await fetch("/api/mercadopago/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: referencia,
        nombre,
        correo,
        telefono,
        monto
      }),
    });

    const data = await res.json();
    spinner.style.display = "none";

    // 2️⃣ Validar respuesta
    if (!data.exito || !data.init_point) {
      console.error("❌ Error de respuesta Mercado Pago:", data);
      return mostrarMensaje("🚫 No se pudo generar el enlace de pago.", "error");
    }

    mostrarMensaje("✅ Redirigiendo a Mercado Pago...");
    
    // 3️⃣ Redirigir al checkout de Mercado Pago
    window.location.href = data.init_point;

  } catch (err) {
    console.error("❌ Error en el flujo de pago:", err);
    spinner.style.display = "none";
    mostrarMensaje("🚫 Error al iniciar el pago. Intenta nuevamente.", "error");
  }
});


// ===============================
// 🚀 INICIALIZACIÓN
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfig();
  await actualizarEstadoGlobal();
});
