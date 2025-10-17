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
// 💳 FLUJO DE PAGO CON MERCADO PAGO
// ===============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = form.nombre.value.trim();
  const correo = form.correo.value.trim();
  const telefono = form.telefono.value.trim();
  const seleccionados = obtenerNumerosSeleccionados();

  if (!nombre || !correo || !telefono) {
    mostrarMensaje("⚠️ Debes completar todos los campos.", "error");
    return;
  }

  if (seleccionados.length === 0) {
    mostrarMensaje("⚠️ Debes seleccionar al menos un número.", "error");
    return;
  }

  spinner.style.display = "block";
  mostrarMensaje("Procesando tu reserva, por favor espera...", "info");

  try {
    const res = await fetch("/api/pago/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, correo, telefono, numeros: seleccionados }),
    });

    const data = await res.json();
    if (!data.exito) throw new Error(data.mensaje || "Error al crear el pago.");

    PAGO_PENDIENTE = {
      nombre,
      correo,
      telefono,
      reference: data.preference_id,
      amount: data.monto,
    };

    mostrarMensaje("✅ Redirigiendo a Mercado Pago...", "exito");

    // Redirigir al checkout de Mercado Pago
    if (data.init_point) {
      window.location.href = data.init_point;
    } else {
      throw new Error("No se recibió enlace de pago.");
    }
  } catch (err) {
    console.error("❌ Error en el flujo de pago:", err);
    mostrarMensaje("🚫 Error al procesar el pago. Intenta nuevamente.", "error");
  } finally {
    spinner.style.display = "none";
  }
});

// ===============================
// 🚀 INICIALIZACIÓN
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfig();
  await actualizarEstadoGlobal();
});
