// ===============================
// 📌 Variables globales y elementos DOM
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const spinner = document.getElementById("spinner");
const barraProgreso = document.querySelector(".relleno");
const numerosContainer = document.getElementById("numeros-container");

// Nuevos elementos del frontend para el flujo del Widget
const pagoBox = document.getElementById("pago-box");
const wompiButton = document.getElementById("wompi-button");

let CONFIG = {};
let PAGO_PENDIENTE = {
    reference: null,
    amountInCents: 0,
    customerEmail: null,
};


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
// 📥 Envío de formulario (RESERVAR)
// ===============================
if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = document.getElementById("nombre")?.value.trim();
        const correo = document.getElementById("correo")?.value.trim();
        const telefono = document.getElementById("telefono")?.value.trim();
        const numerosSeleccionados = obtenerNumerosSeleccionados();

        // ✅ Validaciones
        if (!nombre || !correo || !telefono) {
            mostrarMensaje("⚠️ Completa todos los campos.", "error");
            return;
        }
        if (numerosSeleccionados.length < 1 || numerosSeleccionados.length > 20) {
            mostrarMensaje("⚠️ Debes seleccionar entre 1 y 20 números.", "error");
            return;
        }
        if (!CONFIG.publicKey) {
             mostrarMensaje("⚠️ La pasarela de pagos no está configurada.", "error");
             return;
        }

        spinner?.classList.remove("hidden");
        mensaje.textContent = "";
        pagoBox?.classList.add("hidden"); // Ocultar el botón de pago si está visible

        try {
            // 1️⃣ Guardar pendiente en el backend
            const res = await fetch("/api/tickets/guardar-pendiente", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nombre, correo, telefono, numeros: numerosSeleccionados }),
            });

            const data = await res.json();
            if (!res.ok || !data.exito) throw new Error(data.mensaje || "Error guardando pendiente");

            const precio = CONFIG.precio || 5000;
            const amountInCents = precio * 100 * numerosSeleccionados.length;

            // 2️⃣ Almacenar datos para el pago
            PAGO_PENDIENTE = {
                reference: data.reference,
                amountInCents: amountInCents,
                customerEmail: correo,
            };

            console.log("💾 Pendiente guardado. Referencia:", data.reference);
            
            // 3️⃣ Mostrar botón de pago y deshabilitar formulario
            pagoBox?.classList.remove("hidden");
            form.querySelector('button[type="submit"]').disabled = true;
            numerosContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
            
            mostrarMensaje(`✅ Números reservados por 15 minutos. Presiona 'Pagar con Wompi'.`, "exito");
            
        } catch (error) {
            console.error("❌ Error en flujo de reserva:", error);
            mostrarMensaje("🚫 Error al reservar: " + (error.message || "Intenta más tarde"), "error");
        } finally {
            spinner?.classList.add("hidden");
        }
    });
}


// // ===============================
// // 💰 Disparar el Pago con el Widget
// // NOTE: Esta lógica se mueve dentro de DOMContentLoaded
// // ===============================

// ... (Las funciones auxiliares se mantienen igual) ...

// ===============================
// 🔹 Renderizar números disponibles
// ===============================
async function cargarNumeros() {
    // La lógica de cargar números se mantiene igual
    try {
        const res = await fetch("/api/tickets/numeros");
        if (!res.ok) throw new Error("No se pudieron cargar los números");

        const data = await res.json();
        if (!data.exito) throw new Error("Respuesta inválida");

        numerosContainer.innerHTML = "";
        data.numeros.forEach((item) => {
            const btn = document.createElement("button");
            btn.textContent = item.numero;
            btn.className = item.disponible ? "numero disponible" : "numero ocupado";
            btn.disabled = !item.disponible;

            if (item.disponible) {
                btn.addEventListener("click", () => {
                    btn.classList.toggle("seleccionado");
                });
            }

            numerosContainer.appendChild(btn);
        });

        console.log("🎟️ Números cargados:", data.numeros);
    } catch (err) {
        console.error("❌ Error cargando números:", err);
        mostrarMensaje("🚫 No se pudieron cargar los números.", "error");
    }
}

// ===============================
// ✅ Funciones utilitarias (sin cambios)
// ===============================

function obtenerNumerosSeleccionados() {
    return Array.from(document.querySelectorAll(".numero.seleccionado"))
        .map((btn) => Number(btn.textContent.trim())); // Usar Number() para seguridad
}

function mostrarMensaje(texto, tipo = "exito") {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

function actualizarBarra(porcentaje) {
    if (!barraProgreso) return;

    barraProgreso.style.width = `${porcentaje}%`;

    if (porcentaje < 50) barraProgreso.style.backgroundColor = "#f44336";
    else if (porcentaje < 90) barraProgreso.style.backgroundColor = "#ff9800";
    else barraProgreso.style.backgroundColor = "#4caf50";

    const porcentajeTxt = document.getElementById("porcentaje");
    if (porcentajeTxt) porcentajeTxt.textContent = `Progreso: ${porcentaje}% vendido`;
}


// ===============================
// 🚀 Al iniciar (Lógica sincronizada)
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    await cargarConfig();
    await cargarNumeros();

    // 💰 Lógica del botón de Pago con el Widget (Mover aquí garantiza que el DOM existe)
    if (wompiButton) {
        wompiButton.addEventListener('click', () => {
            
            if (!PAGO_PENDIENTE.reference || PAGO_PENDIENTE.amountInCents === 0) {
                mostrarMensaje("⚠️ Primero debes reservar tus números.", "error");
                return;
            }

            // 1. Obtener los datos del estado global
            const { reference, amountInCents, customerEmail } = PAGO_PENDIENTE;
            const { publicKey, urlSuccess } = CONFIG;
            
            if (!publicKey || !urlSuccess) {
                mostrarMensaje("🚫 Configuración de Wompi incompleta.", "error");
                return;
            }
            
            const paymentData = {
                amountInCents: amountInCents,
                currency: "COP",
                reference: reference,
                customerEmail: customerEmail,
                publicKey: publicKey, 
                redirectUrl: urlSuccess,
            };

            // 2. Inicializa el Widget
            // La comprobación de window.$wompi ahora es más fiable.
            if (window.$wompi && window.$wompi.initialize) {
                wompiButton.disabled = true; 
                spinner?.classList.remove("hidden");
                window.$wompi.initialize(paymentData);
            } else {
                console.error("❌ El script del Widget de Wompi ($wompi) no se cargó correctamente. (Error de script o CSP)");
                mostrarMensaje("🚫 Error al cargar la pasarela de pagos. Recarga la página.", "error");
                wompiButton.disabled = false;
                spinner?.classList.add("hidden");
            }
        });
    }
    // Fin de la lógica del botón Wompi

    try {
        const res = await fetch("/api/tickets/consulta");
        if (!res.ok) throw new Error("No se pudo cargar los datos");
        const data = await res.json();
        if (data.exito) actualizarBarra(data.porcentaje);
    } catch (error) {
        console.error("❌ Error cargando porcentaje:", error);
    }
});
