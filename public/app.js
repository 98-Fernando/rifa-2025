// ===============================
// 📌 Variables globales y elementos DOM
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const spinner = document.getElementById("spinner");
const barraProgresoRelleno = document.querySelector(".relleno");
const barraProgresoTexto = document.getElementById("porcentaje");
const numerosContainer = document.getElementById("numeros-container");

// Nuevos elementos del frontend para el flujo de pago
const pagoBox = document.getElementById("pago-box");
const mercadoPagoButton = document.getElementById("mercadopago-button");

let CONFIG = {};
let PAGO_PENDIENTE = {
    nombre: null,
    correo: null,
    telefono: null,
    reference: null,
    amount: 0, // Usaremos el monto en COP (no en centavos)
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
// ✅ Funciones utilitarias
// ===============================

function obtenerNumerosSeleccionados() {
    // Obtenemos el texto y lo aseguramos como string de 3 dígitos (ej: '007')
    return Array.from(document.querySelectorAll(".numero.seleccionado"))
        .map((btn) => String(btn.textContent).padStart(3, '0'));
}

function mostrarMensaje(texto, tipo = "exito") {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
}

function actualizarBarra(vendidos, porcentaje) {
    if (!barraProgresoRelleno) return;

    barraProgresoRelleno.style.width = `${porcentaje}%`;

    // Actualizamos el color según el porcentaje usando los nuevos colores
    let startColor, endColor;

    if (porcentaje < 50) {
        // Rojo (Bajo Progreso)
        startColor = "#E74C3C"; 
        endColor = "#C0392B"; 
    } else if (porcentaje < 90) {
        // Amarillo/Naranja (Medio Progreso)
        startColor = "#F39C12"; 
        endColor = "#E67E22";
    } else {
        // Verde (Alto Progreso)
        startColor = "#27AE60"; 
        endColor = "#2ECC71";
    }

    barraProgresoRelleno.style.background = `linear-gradient(90deg, ${startColor}, ${endColor})`;

    if (barraProgresoTexto) barraProgresoTexto.textContent = `Progreso: ${porcentaje}% vendido (${vendidos} de 1000)`;
}

/** Habilita/Deshabilita el formulario y la selección de números */
function toggleUI(disabled) {
    form.querySelector('button[type="submit"]').disabled = disabled;
    numerosContainer.querySelectorAll('button').forEach(btn => btn.disabled = disabled || btn.classList.contains("ocupado"));
}


// ===============================
// 🔄 FUNCIÓN DE ACTUALIZACIÓN CENTRAL
// ===============================

/** Carga números disponibles y actualiza la barra de progreso */
async function actualizarEstadoGlobal() {
    try {
        // Cargar números disponibles
        const resNumeros = await fetch("/api/tickets/numeros");
        if (!resNumeros.ok) throw new Error("No se pudieron cargar los números");

        const dataNumeros = await resNumeros.json();
        if (!dataNumeros.exito) throw new Error("Respuesta inválida de números");

        // Renderizar números
        numerosContainer.innerHTML = "";
        dataNumeros.numeros.forEach((item) => {
            const btn = document.createElement("button");
            
            btn.textContent = String(item.numero).padStart(3, '0');
            btn.className = item.disponible ? "numero disponible" : "numero ocupado";
            btn.disabled = !item.disponible;

            if (item.disponible) {
                // Al hacer clic, simplemente alternamos la clase 'seleccionado'
                btn.addEventListener("click", () => {
                    btn.classList.toggle("seleccionado");
                });
            }

            numerosContainer.appendChild(btn);
        });
        
        console.log("🎟️ Números cargados y renderizados.");

        // Cargar progreso
        const resConsulta = await fetch("/api/tickets/consulta");
        if (!resConsulta.ok) throw new Error("No se pudo cargar la consulta");
        const dataConsulta = await resConsulta.json();
        
        if (dataConsulta.exito) {
            actualizarBarra(dataConsulta.total, dataConsulta.porcentaje);
            console.log("📊 Progreso actualizado.");
        }

    } catch (err) {
        console.error("❌ Error en la actualización global:", err);
        mostrarMensaje("🚫 Error al sincronizar el estado del juego.", "error");
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

        // Validaciones
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
        toggleUI(true); // Deshabilitar UI durante la reserva

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
            const totalAmount = precio * numerosSeleccionados.length;

            // 2️⃣ Almacenar datos completos para el pago
            PAGO_PENDIENTE = {
                nombre: nombre,
                correo: correo,
                telefono: telefono,
                reference: data.reference,
                amount: totalAmount, // Monto total en COP
            };

            console.log("💾 Pendiente guardado. Referencia:", data.reference);

            // 3️⃣ Mostrar botón de pago y mantener formulario y números deshabilitados
            pagoBox?.classList.remove("hidden");
            mostrarMensaje(`✅ Números reservados por 15 minutos. Total a pagar: $${totalAmount.toLocaleString('es-CO')}. Presiona 'Pagar con Mercado Pago'.`, "exito");
            
            // Re-sincronizar el estado de la UI (solo los números ocupados por la reserva)
            await actualizarEstadoGlobal();
            toggleUI(true); // Asegurar que todo siga deshabilitado hasta el pago

        } catch (error) {
            console.error("❌ Error en flujo de reserva:", error);
            mostrarMensaje("🚫 Error al reservar: " + (error.message || "Intenta más tarde"), "error");
            toggleUI(false); // Re-habilitar UI en caso de error
        } finally {
            spinner?.classList.add("hidden");
        }
    });
}


// ===============================
// 🚀 INICIO DE PAGO CON MERCADO PAGO
// ===============================
if (mercadoPagoButton) {
    mercadoPagoButton.addEventListener('click', startMercadoPagoFlow);
}

async function startMercadoPagoFlow() {
    const { reference, amount, correo, nombre, telefono } = PAGO_PENDIENTE;

    if (!reference || amount === 0) {
        mostrarMensaje("⚠️ Primero debes reservar tus números.", "error");
        return;
    }

    mercadoPagoButton.disabled = true;
    spinner?.classList.remove("hidden");
    mostrarMensaje("⏳ Creando orden de pago...", "exito"); // Cambiado a exito/info para no alarmar

    try {
        // 1. Llamar al endpoint del backend para crear la preferencia
        const res = await fetch("/api/mercadopago/preference", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reference,
                monto: amount,
                nombre,
                correo,
                telefono,
            }),
        });

        const data = await res.json();

        if (!res.ok || !data.exito) {
            throw new Error(data.mensaje || "Error al generar la preferencia de pago.");
        }

        const { init_point } = data; 

        if (init_point) {
            // 2. Redirigir al usuario a la URL de Mercado Pago
            window.location.href = init_point;
        } else {
            throw new Error("El backend no devolvió la URL de pago.");
        }

    } catch (error) {
        console.error("❌ Error en flujo de pago:", error);
        mostrarMensaje("🚫 Error al iniciar el pago: " + (error.message || "Intenta más tarde"), "error");
        mercadoPagoButton.disabled = false;
        toggleUI(false); // Re-habilitar UI si falla el inicio de pago
    } finally {
        spinner?.classList.add("hidden");
    }
}


// ===============================
// 🚀 Al iniciar (Lógica sincronizada)
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    await cargarConfig();
    // 💡 Usamos la función de actualización central al inicio
    await actualizarEstadoGlobal(); 
});
