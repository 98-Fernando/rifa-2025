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
    CONFIG = await res.json();
    console.log("⚙️ Config cargada:", CONFIG);
  } catch (err) {
    console.error("❌ Error cargando configuración:", err);
  }
}

// ===============================
// 📥 Envío de formulario
// ===============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const correo = document.getElementById("correo").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
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
  spinner.classList.remove("hidden");
  mensaje.textContent = "";
  ticketBox.classList.add("hidden");

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

    // 2️⃣ Calcular firma con el backend
    const precio = CONFIG.precio || 5000;
    const signatureRes = await fetch("/api/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        amountInCents: precio * 100,
        currency: "COP",
      }),
    });

    const sigData = await signatureRes.json();
    if (!sigData.signature) throw new Error("No se pudo generar la firma");

    // 3️⃣ Crear transacción en el backend y obtener la URL de Wompi
    const txRes = await fetch("/api/crear-transaccion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        amountInCents: precio * 100,
        currency: "COP",
        signature: sigData.signature,
      }),
    });

    const txData = await txRes.json();
    if (!txData.urlCheckout) throw new Error("No se obtuvo la URL de checkout");

    // 🚀 Redirigir al Checkout de Wompi
    window.location.href = txData.urlCheckout;

  } catch (error) {
    console.error("Error:", error);
    mostrarMensaje("🚫 Ocurrió un error: " + error.message, "error");
  } finally {
    spinner.classList.add("hidden");
  }
});

// ===============================
// ✅ Obtener los números seleccionados
// ===============================
function obtenerNumerosSeleccionados() {
  return Array.from(document.querySelectorAll(".numero.seleccionado"))
    .map((btn) => btn.textContent.trim());
}

// ===============================
// 🟢 Mostrar mensajes
// ===============================
function mostrarMensaje(texto, tipo = "exito") {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

// ===============================
// 📊 Actualizar barra de progreso
// ===============================
function actualizarBarra(porcentaje) {
  if (barraProgreso) {
    barraProgreso.style.width = `${porcentaje}%`;

    if (porcentaje < 50) barraProgreso.style.backgroundColor = "#f44336";
    else if (porcentaje < 90) barraProgreso.style.backgroundColor = "#ff9800";
    else barraProgreso.style.backgroundColor = "#4caf50";
  }
}

// ===============================
// 🚀 Al iniciar
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  await cargarConfig();

  try {
    const res = await fetch("/api/tickets/consulta");
    const data = await res.json();
    if (data.exito) actualizarBarra(data.porcentaje);
  } catch (error) {
    console.error("❌ Error cargando porcentaje:", error);
  }
});
