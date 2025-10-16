// ===============================
// 📌 Variables globales y elementos DOM
// ===============================
const form = document.getElementById("formulario");
const mensaje = document.getElementById("mensaje");
const spinner = document.getElementById("spinner");
const barraProgreso = document.querySelector(".relleno");
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
// 📥 Envío de formulario (RESERVAR)
// ===============================
if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = document.getElementById("nombre")?.value.trim();
        const correo = document.getElementById("correo")?.value.trim();
        const telefono = document.getElementById("telefono")?.value.trim();
        
        // 🚨 IMPORTANTE: Obtenemos los números como strings '007', '123', etc.
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

        spinner?.classList.remove("hidden");
        mensaje.textContent = "";
        pagoBox?.classList.add("hidden");

        try {
            // 1️⃣ Guardar pendiente en el backend
            const res = await fetch("/api/tickets/guardar-pendiente", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Enviamos los números como strings de 3 dígitos (ej: ['001', '010'])
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

            // 3️⃣ Mostrar botón de pago y deshabilitar formulario
            pagoBox?.classList.remove("hidden");
            form.querySelector('button[type="submit"]').disabled = true;
            numerosContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);

            mostrarMensaje(`✅ Números reservados. Presiona 'Pagar con Mercado Pago'.`, "exito");

        } catch (error) {
            console.error("❌ Error en flujo de reserva:", error);
            mostrarMensaje("🚫 Error al reservar: " + (error.message || "Intenta más tarde"), "error");
        } finally {
            spinner?.classList.add("hidden");
        }
    });
}


// ===============================
// 🔹 Renderizar números disponibles (CORREGIDO PARA COLOR)
// ===============================
async function cargarNumeros() {
    try {
        const res = await fetch("/api/tickets/numeros");
        if (!res.ok) throw new Error("No se pudieron cargar los números");

        const data = await res.json();
        if (!data.exito) throw new Error("Respuesta inválida");

        numerosContainer.innerHTML = "";
        data.numeros.forEach((item) => {
            const btn = document.createElement("button");
            
            // ✅ CORRECCIÓN 1: Aseguramos que el contenido sea un string de 3 dígitos.
            // (El backend debería enviarlo así, pero es bueno ser consistente).
            btn.textContent = String(item.numero).padStart(3, '0');
            
            // ✅ CORRECCIÓN 2: Usamos la clase base 'numero' y 'disponible' u 'ocupado'
            btn.className = item.disponible ? "numero disponible" : "numero ocupado";
            btn.disabled = !item.disponible;

            if (item.disponible) {
                btn.addEventListener("click", () => {
                    // ✅ CORRECCIÓN 3: Alternar la clase 'seleccionado'. 
                    // El CSS ya tiene la alta prioridad para que el color cambie.
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
// ✅ Funciones utilitarias (CORREGIDO PARA RANGO 000-999)
// ===============================

function obtenerNumerosSeleccionados() {
    // ✅ CORRECCIÓN: Obtenemos el texto y lo aseguramos como string de 3 dígitos (ej: '007')
    return Array.from(document.querySelectorAll(".numero.seleccionado"))
        .map((btn) => String(btn.textContent).padStart(3, '0'));
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
// 🚀 INICIO DE PAGO CON MERCADO PAGO
// ===============================
async function startMercadoPagoFlow() {
    const { reference, amount, correo, nombre, telefono } = PAGO_PENDIENTE;

    if (!reference || amount === 0) {
        mostrarMensaje("⚠️ Primero debes reservar tus números.", "error");
        return;
    }

    mercadoPagoButton.disabled = true;
    spinner?.classList.remove("hidden");
    mostrarMensaje("⏳ Creando orden de pago...", "info");

    try {
        // 1. Llamar al NUEVO endpoint del backend para crear la preferencia
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

        const { init_point } = data; // La URL de redirección (Checkout Pro)

        if (init_point) {
            // 2. Redirigir al usuario a la URL de Mercado Pago
            window.location.href = init_point;

            // NOTA: El control regresa cuando Mercado Pago redirige a success/failure/pending URL.
        } else {
            throw new Error("El backend no devolvió la URL de pago.");
        }

    } catch (error) {
        console.error("❌ Error en flujo de pago:", error);
        mostrarMensaje("🚫 Error al iniciar el pago: " + (error.message || "Intenta más tarde"), "error");
        mercadoPagoButton.disabled = false;
    } finally {
        spinner?.classList.add("hidden");
    }
}


// ===============================
// 🚀 Al iniciar (Lógica sincronizada)
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
    await cargarConfig();
    await cargarNumeros();

    // 💰 Lógica del botón de Pago con Mercado Pago
    if (mercadoPagoButton) {
        mercadoPagoButton.addEventListener('click', startMercadoPagoFlow);
    }

    try {
        const res = await fetch("/api/tickets/consulta");
        if (!res.ok) throw new Error("No se pudo cargar los datos");
        const data = await res.json();
        if (data.exito) actualizarBarra(data.porcentaje);
    } catch (error) {
        console.error("❌ Error cargando porcentaje:", error);
    }
});
