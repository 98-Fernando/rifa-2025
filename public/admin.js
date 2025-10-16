// Archivo admin.js

// ===============================
// 📌 Variables Globales
// ===============================
const tableBody = document.getElementById("tickets-table");
const searchInput = document.getElementById("search");
const logoutBtn = document.querySelector(".logout-btn");

// ===============================
// 1. Función Principal: Cargar y Renderizar Tickets
// ===============================
async function cargarTickets(filtro = "") {
    try {
        // Incluimos pendientes y resueltos para la vista completa del admin
        const res = await fetch("/api/admin/tickets"); 
        
        if (!res.ok) {
            // Manejar sesión expirada o no autorizado
            if (res.status === 401) {
                alert("Sesión expirada o no autorizado. Redirigiendo a login.");
                // 🛑 CORRECCIÓN CLAVE: Redirige a /admin, que sirve el login.html
                window.location.href = "/admin"; 
                return;
            }
            throw new Error("Error al obtener los tickets");
        }
        
        const data = await res.json();
        tableBody.innerHTML = "";

        if (data.exito && Array.isArray(data.tickets)) {
            const ticketsFiltrados = data.tickets.filter(ticket => {
                const query = filtro.toLowerCase();
                const nombre = ticket.nombre?.toLowerCase() || "";
                const correo = ticket.correo?.toLowerCase() || "";
                
                return nombre.includes(query) || correo.includes(query);
            });

            if (ticketsFiltrados.length === 0 && filtro) {
                tableBody.innerHTML = `<tr><td colspan="8">⚠️ No se encontraron resultados para "${filtro}"</td></tr>`;
                return;
            } else if (ticketsFiltrados.length === 0) {
                 tableBody.innerHTML = `<tr><td colspan="8">⚠️ No hay tickets registrados</td></tr>`;
                 return;
            }

            ticketsFiltrados.forEach(ticket => {
                // Formateo del monto y estado
                const monto = ticket.monto ? `$${ticket.monto.toLocaleString('es-CO')}` : "N/A";
                // Usamos estadoPago si existe, si no, inferimos de 'pagado' (para compatibilidad)
                let estado = ticket.estadoPago || (ticket.pagado ? 'pagado' : 'pendiente');
                let estadoDisplay = '';

                switch(estado.toLowerCase()) {
                    case 'pagado':
                    case 'approved':
                        estadoDisplay = '✅ Pagado';
                        break;
                    case 'pendiente':
                    case 'pending':
                        estadoDisplay = '⏳ Pendiente';
                        break;
                    default:
                        estadoDisplay = '❌ Error/Cancelado';
                }
                
                const numerosFormateados = Array.isArray(ticket.numeros) ? ticket.numeros.join(", ") : "-";
                
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${ticket.nombre || "-"}</td>
                    <td>${ticket.correo || "-"}</td>
                    <td>${ticket.telefono || "-"}</td>
                    <td class="numeros-cell">${numerosFormateados}</td>
                    <td>${monto}</td>
                    <td>${new Date(ticket.createdAt).toLocaleString()}</td>
                    <td class="status-${estado.toLowerCase()}">
                        ${estadoDisplay}
                    </td>
                    <td>
                        <button class="delete-btn" data-id="${ticket._id}" title="Eliminar Ticket">🗑️</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
    } catch (error) {
        console.error("❌ Error cargando tickets:", error);
        tableBody.innerHTML = `<tr><td colspan="8">❌ Error al cargar los datos</td></tr>`;
    }
}

// ===============================
// 2. Lógica para Eliminar un Ticket
// ===============================
document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("delete-btn")) {
        const id = e.target.getAttribute("data-id");
        if (confirm("⚠️ ¿Seguro que deseas eliminar este registro? Esta acción es irreversible.")) {
            try {
                const res = await fetch(`/api/admin/tickets/${id}`, { method: "DELETE" });
                const data = await res.json();

                if (data.exito) {
                    alert("✅ Registro eliminado exitosamente.");
                    cargarTickets(searchInput.value); // Refresca con el filtro actual
                } else {
                    alert("❌ Error eliminando: " + (data.mensaje || "Intenta de nuevo."));
                }
            } catch (err) {
                console.error("❌ Error en la eliminación:", err);
                alert("❌ Error en la eliminación");
            }
        }
    }
});

// ===============================
// 3. Lógica de Búsqueda
// ===============================
if (searchInput) {
    // Usamos debounce para no sobrecargar el servidor con cada tecla
    let timer;
    searchInput.addEventListener("keyup", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            cargarTickets(searchInput.value);
        }, 300); // Espera 300ms después de la última tecla
    });
}

// ===============================
// 4. Lógica de Logout
// ===============================
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm("¿Estás seguro que quieres cerrar la sesión?")) {
            try {
                // Llama a la ruta de logout en el backend
                await fetch("/api/admin/logout", { method: "POST" });
                // Redirige al login
                window.location.href = "/admin"; 
            } catch(e) {
                console.error("Error al cerrar sesión:", e);
                window.location.href = "/admin"; // Forzar la redirección si falla la API
            }
        }
    });
}


// ===============================
// 🚀 Inicialización
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    cargarTickets();
});
