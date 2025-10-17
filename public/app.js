// ===============================
// 📌 Variables globales y elementos DOM
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const spinner = document.getElementById("spinner");
const barraProgresoRelleno = document.querySelector(".relleno");
const barraProgresoTexto = document.getElementById("porcentaje");
const contenedorNumeros = document.getElementById("listaDisponibles");

// Nuevos elementos del frontend para el flujo de pago
const pagoBox = document.getElementById("pago-box");
const mercadoPagoButton = document.getElementById("mercadopago-button");

let CONFIG = {};
let PAGO_PENDIENTE = { nombre: null, correo: null, telefono: null, reference: null, amount: 0 };


// ===============================
// 🔹 Cargar configuración del backend
// ===============================
async function cargarConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("No se pudo cargar la configuración");
    const data = await res.json();
    if (!data.exito) throw new Error("Config inválida");
    CONFIG = data;
    console.log("⚙️ Config cargada:", CONFIG);
  } catch (err) {
    console.error("❌ Error cargando configuración:", err);
    mostrarMensaje("🚫 No se pudo cargar la configuración. Intenta más tarde.", "error");
  }
}

// ===============================
// ✅ Funciones utilitarias
// ===============================
function obtenerNumerosSeleccionados() {
  return Array.from(document.querySelectorAll(".numero.seleccionado")).map((btn) =>
    String(btn.textContent).padStart(3, "0")
  );
}

function mostrarMensaje(texto, tipo = "exito") {
  if (!mensaje) return;
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

function actualizarBarra(vendidos, porcentaje) {
  if (!barraProgresoRelleno || !barraProgresoTexto) return;

  // Asegurar valores numéricos
  vendidos = vendidos || 0;
  porcentaje = parseFloat(porcentaje) || 0;

  barraProgresoRelleno.style.width = `${porcentaje}%`;

  let startColor, endColor;
  if (porcentaje < 50) {
    startColor = "#E74C3C";
    endColor = "#C0392B";
  } else if (porcentaje < 90) {
    startColor = "#F39C12";
    endColor = "#E67E22";
  } else {
    startColor = "#27AE60";
    endColor = "#2ECC71";
  }

  barraProgresoRelleno.style.background = `linear-gradient(90deg, ${startColor}, ${endColor})`;
  barraProgresoTexto.textContent = `Progreso: ${porcentaje.toFixed(1)}% vendido (${vendidos} de 1000)`;
}

// ===============================
// 🔄 Cargar números y progreso
// ===============================
async function actualizarEstadoGlobal() {
  try {
    const numerosContainer = document.getElementById("listaDisponibles");
    if (!numerosContainer) return;

    // Números
    const resNumeros = await fetch("/api/tickets/numeros");
    const dataNumeros = await resNumeros.json();
    if (!dataNumeros.exito) throw new Error("Error al obtener números");

    numerosContainer.innerHTML = "";
    dataNumeros.numeros.forEach((item) => {
      const btn = document.createElement("button");
      btn.textContent = String(item.numero).padStart(3, "0");
      btn.className = item.disponible ? "numero disponible" : "numero ocupado";
      btn.disabled = !item.disponible;
      if (item.disponible) {
        btn.addEventListener("click", () => btn.classList.toggle("seleccionado"));
      }
      numerosContainer.appendChild(btn);
    });

    // Progreso
    const resConsulta = await fetch("/api/tickets/consulta");
    const dataConsulta = await resConsulta.json();
    if (dataConsulta.exito) {
      actualizarBarra(dataConsulta.total, dataConsulta.porcentaje);
    }
  } catch (err) {
    console.error("❌ Error actualizando:", err);
    mostrarMensaje("🚫 Error al cargar los datos.", "error");
  }
}

// ===============================
// 🚀 Inicio
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfig();
  await actualizarEstadoGlobal();
});
