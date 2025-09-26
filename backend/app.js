// ===============================
// 📌 Variables globales
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const ticketBox = document.getElementById("ticket-box");
const spinner = document.getElementById("spinner");
const barraProgreso = document.querySelector(".relleno");

let CONFIG = {};

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
// 📥 Envío de formulario
// ===============================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = document.getElementById("nombre")?.value.trim();
    const correo = document.getElementById("correo")?.value.trim();
    const telefono = document.getElementById("telefono")?.value.trim();
    const numerosSeleccionados = obtenerNumerosSeleccionados(); // ["1", "2", ...]

    // Validaciones
    if (!nombre || !correo || !telefono) {
      mostrarMensaje("⚠️ Completa todos los campos.", "error");
      return;
    }
    if (numerosSeleccionados.length < 1 || numerosSeleccionados.length > 20) {
      mostrarMensaje("⚠️ Debes seleccionar entre 1 y 20 números.", "error");
      return;
    }

    // Reiniciar estados visuales
    spinner?.classList.remove("hidden");
    mensaje.textContent = "";
    ticketBox?.classList.add("hidden");

    try {
      // 1️⃣ Guardar en "pendiente"
      const res = await fetch("/api/tickets/guardar-pendiente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, correo, telefono, numeros: numerosSeleccionados }),
      });

      const data = await res.json();
      if (!data.exito) throw new Error(data.mensaje || "Error guardando pendiente");

      const reference = data.reference;
      const precio = CONFIG.precio || 5000;
      const amountInCents = precio * 100 * numerosSeleccionados.length;

      console.log("💾 Pendiente guardado:", data);
      console.log("💰 Total a pagar:", amountInCents);

      // 2️⃣ Calcular firma con el backend
      const signatureRes = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          amountInCents,
          currency: "COP",
        }),
      });

      const sigData = await signatureRes.json();
      if (!sigData.signature) throw new Error("No se pudo generar la firma");

      console.log("✍️ Firma generada:", sigData.signature);

      // 3️⃣ Crear transacción en el backend y obtener la URL de Wompi
      const txRes = await fetch("/api/crear-transaccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          amountInCents,
          currency: "COP",
          signature: sigData.signature,
        }),
      });

      const txData = await txRes.json();
      if (!txData.urlCheckout) throw new Error("No se obtuvo la URL de checkout");

      console.log("🔗 Redirigiendo a:", txData.urlCheckout);

      // 🚀 Redirigir al Checkout de Wompi
      window.location.href = txData.urlCheckout;

    } catch (error) {
      console.error("❌ Error:", error);
      mostrarMensaje("🚫 Ocurrió un error: " + error.message, "error");
    } finally {
      spinner?.classList.add("hidden");
    }
  });
}

// ===============================
// ✅ Obtener los números seleccionados
// ===============================
function obtenerNumerosSeleccionados() {
  return Array.from(document.querySelectorAll(".seleccionado"))
    .map((btn) => btn.textContent.trim());
}

// ===============================
// 🟢 Mostrar mensajes
// ===============================
function mostrarMensaje(texto, tipo = "exito") {
  if (!mensaje) return;
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

// ===============================
// 📊 Actualizar barra de progreso
// ===============================
function actualizarBarra(porcentaje) {
  if (!barraProgreso) return;

  barraProgreso.style.width = `${porcentaje}%`;

  if (porcentaje < 50) barraProgreso.style.backgroundColor = "#f44336";
  else if (porcentaje < 90) barraProgreso.style.backgroundColor = "#ff9800";
  else barraProgreso.style.backgroundColor = "#4caf50";
}

// ===============================
// 🚀 Al iniciar
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfig();

  try {
    const res = await fetch("/api/tickets/consulta");
    if (!res.ok) throw new Error("No se pudo cargar los datos");
    const data = await res.json();
    if (data.exito) actualizarBarra(data.porcentaje);
  } catch (error) {
    console.error("❌ Error cargando porcentaje:", error);
  }
});
