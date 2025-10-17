// ===============================
// 📌 VARIABLES GLOBALES Y ELEMENTOS DOM
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const spinner = document.getElementById("spinner");
const barraProgresoRelleno = document.querySelector(".relleno");
const barraProgresoTexto = document.getElementById("porcentaje");
const contenedorNumeros = document.getElementById("listaDisponibles");
const pagoBox = document.getElementById("pago-box");
const mercadoPagoButton = document.getElementById("mercadopago-button");

let CONFIG = {};
let PAGO_PENDIENTE = {
  nombre: null,
  correo: null,
  telefono: null,
  reference: null,
  amount: 0,
};

// ===============================
// ⚙️ CARGAR CONFIGURACIÓN DEL BACKEND
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
// 🧩 FUNCIONES UTILITARIAS
// ===============================
function obtenerNumerosSeleccionados() {
  return Array.from(document.querySelectorAll(".numero.seleccionado"))
    .map((btn) => String(btn.textContent).padStart(3, "0"));
}

function mostrarMensaje(texto, tipo = "exito") {
  if (!mensaje) return;
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

function actualizarBarra(vendidos, porcentaje, totalBoletos = 1000) {
  if (!barraProgresoRelleno) return;

  barraProgresoRelleno.style.width = `${porcentaje}%`;

  // 🎨 Colores dinámicos según progreso
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
  barraProgresoTexto.textContent = `Progreso: ${porcentaje}% vendido (${vendidos} de ${totalBoletos})`;
}

function toggleUI(disabled) {
  form.querySelector('button[type="submit"]').disabled = disabled;
  contenedorNumeros.querySelectorAll("button").forEach((btn) => {
    btn.disabled = disabled || btn.classList.contains("ocupado");
  });
}

// ===============================
// 🔄 FUNCIÓN CENTRAL DE SINCRONIZACIÓN
// ===============================
async function actualizarEstadoGlobal() {
  try {
    const numerosContainer = document.getElementById("listaDisponibles");
    if (!numerosContainer) return;

    // 🎟️ Cargar números
    const resNumeros = await fetch("/api/tickets/numeros");
    if (!resNumeros.ok) throw new Error("No se pudieron cargar los números");

    const dataNumeros = await resNumeros.json();
    if (!dataNumeros.exito) throw new Error("Respuesta inválida de números");

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

    console.log("🎟️ Números cargados correctamente.");

    // 📊 Cargar progreso
    const resConsulta = await fetch("/api/tickets/consulta");
    if (!resConsulta.ok) throw new Error("No se pudo cargar la consulta");

    const dataConsulta = await resConsulta.json();
    if (dataConsulta.exito) {
      const totalVendidos = dataConsulta.total || 0;
      const totalBoletos = dataConsulta.totalBoletos || 1000;
      const porcentaje = ((totalVendidos / totalBoletos) * 100).toFixed(1);

      actualizarBarra(totalVendidos, porcentaje, totalBoletos);
      console.log("📊 Barra de progreso actualizada.");
    }
  } catch (err) {
    console.error("❌ Error en actualización global:", err);
    mostrarMensaje("🚫 Error al sincronizar el estado del juego.", "error");
  }
}

// ===============================
// 📥 ENVÍO DEL FORMULARIO (RESERVAR)
// ===============================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = document.getElementById("nombre")?.value.trim();
    const correo = document.getElementById("correo")?.value.trim();
    const telefono = document.getElementById("telefono")?.value.trim();
    const numerosSeleccionados = obtenerNumerosSeleccionados();

    if (!nombre || !correo || !telefono) {
      mostrarMensaje("⚠️ Completa todos los campos.", "error");
      return;
    }
    if (numerosSeleccionados.length < 1) {
      mostrarMensaje("⚠️ Debes seleccionar al menos un número.", "error");
      return;
    }

    spinner?.classList.remove("hidden");
    mensaje.textContent = "";
    pagoBox?.classList.add("hidden");
    toggleUI(true);

    try {
      const res = await fetch("/api/tickets/guardar-pendiente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, correo, telefono, numeros: numerosSeleccionados }),
      });

      const data = await res.json();
      if (!res.ok || !data.exito) throw new Error(data.mensaje || "Error guardando pendiente");

      const precio = CONFIG.precio || 5000;
      const totalAmount = precio * numerosSeleccionados.length;

      PAGO_PENDIENTE = { nombre, correo, telefono, reference: data.reference, amount: totalAmount };

      console.log("💾 Pendiente guardado. Ref:", data.reference);

      pagoBox?.classList.remove("hidden");
      mostrarMensaje(
        `✅ Números reservados por 15 minutos. Total a pagar: $${totalAmount.toLocaleString(
          "es-CO"
        )}. Presiona 'Pagar con Mercado Pago'.`,
        "exito"
      );

      await actualizarEstadoGlobal();
      toggleUI(true);
    } catch (error) {
      console.error("❌ Error en reserva:", error);
      mostrarMensaje("🚫 Error al reservar: " + (error.message || "Intenta más tarde"), "error");
      toggleUI(false);
    } finally {
      spinner?.classList.add("hidden");
    }
  });
}

// ===============================
// 💳 INICIO DE PAGO CON MERCADO PAGO
// ===============================
if (mercadoPagoButton) {
  mercadoPagoButton.addEventListener("click", startMercadoPagoFlow);
}

async function startMercadoPagoFlow() {
  const { reference, amount, correo, nombre, telefono } = PAGO_PENDIENTE;

  if (!reference || amount === 0) {
    mostrarMensaje("⚠️ Primero debes reservar tus números.", "error");
    return;
  }

  mercadoPagoButton.disabled = true;
  spinner?.classList.remove("hidden");
  mostrarMensaje("⏳ Creando orden de pago...", "exito");

  try {
    const res = await fetch("/api/mercadopago/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, monto: amount, nombre, correo, telefono }),
    });

    const data = await res.json();
    if (!res.ok || !data.exito) throw new Error(data.mensaje || "Error al generar la preferencia.");

    if (data.init_point) {
      window.location.href = data.init_point;
    } else {
      throw new Error("El backend no devolvió la URL de pago.");
    }
  } catch (error) {
    console.error("❌ Error en flujo de pago:", error);
    mostrarMensaje("🚫 Error al iniciar el pago: " + (error.message || "Intenta más tarde"), "error");
    mercadoPagoButton.disabled = false;
    toggleUI(false);
  } finally {
    spinner?.classList.add("hidden");
  }
}

// ===============================
// 🚀 INICIO
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfig();
  await actualizarEstadoGlobal();
});
