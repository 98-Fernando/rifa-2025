// =====================================================
// 🧾 admin.js — Panel de Administración de Tickets
// =====================================================

// -------------------------------
// 📌 Elementos del DOM
// -------------------------------
const tableBody = document.getElementById("tickets-table");
const searchInput = document.getElementById("search");
const logoutBtn = document.querySelector(".logout-btn");

// =====================================================
// 1️⃣ Función Principal: Cargar Tickets
// =====================================================
async function cargarTickets(filtro = "") {
  try {
    const res = await fetch("/api/admin/tickets", { credentials: "include" });

    if (res.status === 401) {
      alert("⚠️ Sesión expirada o no autorizada. Por favor inicia sesión nuevamente.");
      window.location.href = "/admin";
      return;
    }

    if (!res.ok) throw new Error("Error al obtener los tickets");

    const data = await res.json();
    tableBody.innerHTML = "";

    if (!data.exito || !Array.isArray(data.tickets) || data.tickets.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8">⚠️ No hay tickets registrados</td></tr>`;
      return;
    }

    // 🔍 Filtrado en base al texto ingresado
    const query = filtro.toLowerCase();
    const ticketsFiltrados = data.tickets.filter(ticket => {
      const nombre = ticket.nombre?.toLowerCase() || "";
      const correo = ticket.correo?.toLowerCase() || "";
      return nombre.includes(query) || correo.includes(query);
    });

    if (ticketsFiltrados.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8">⚠️ No se encontraron resultados para "${filtro}"</td></tr>`;
      return;
    }

    // 🧩 Renderizamos cada fila
    ticketsFiltrados.forEach(ticket => {
      const monto = ticket.monto ? `$${ticket.monto.toLocaleString("es-CO")}` : "N/A";
      const numeros = Array.isArray(ticket.numeros) ? ticket.numeros.join(", ") : "-";

      // Estado de pago
      let estado = ticket.estadoPago || (ticket.pagado ? "pagado" : "pendiente");
      let estadoDisplay = "";
      switch (estado.toLowerCase()) {
        case "pagado":
        case "approved":
          estadoDisplay = "✅ Pagado";
          break;
        case "pendiente":
        case "pending":
          estadoDisplay = "⏳ Pendiente";
          break;
        default:
          estadoDisplay = "❌ Cancelado / Error";
      }

      // Fecha formateada
      const fecha = ticket.createdAt
        ? new Date(ticket.createdAt).toLocaleString("es-CO", {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "-";

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${ticket.nombre || "-"}</td>
        <td>${ticket.correo || "-"}</td>
        <td>${ticket.telefono || "-"}</td>
        <td class="numeros-cell">${numeros}</td>
        <td>${monto}</td>
        <td>${fecha}</td>
        <td class="status-${estado.toLowerCase()}">${estadoDisplay}</td>
        <td>
          <button class="delete-btn" data-id="${ticket._id}" title="Eliminar Ticket">🗑️</button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error("❌ Error cargando tickets:", error);
    tableBody.innerHTML = `<tr><td colspan="8">❌ Error al cargar los datos. Intenta nuevamente.</td></tr>`;
  }
}

// =====================================================
// 2️⃣ Eliminar Ticket
// =====================================================
document.addEventListener("click", async e => {
  if (!e.target.classList.contains("delete-btn")) return;

  const id = e.target.getAttribute("data-id");
  if (!id) return alert("ID de ticket inválido.");

  if (!confirm("⚠️ ¿Seguro que deseas eliminar este registro? Esta acción no se puede deshacer.")) return;

  try {
    const res = await fetch(`/api/admin/tickets/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = await res.json();

    if (res.status === 401) {
      alert("⚠️ Sesión expirada. Redirigiendo al login...");
      window.location.href = "/admin";
      return;
    }

    if (data.exito) {
      alert("✅ Registro eliminado exitosamente.");
      cargarTickets(searchInput.value);
    } else {
      alert("❌ Error al eliminar: " + (data.mensaje || "Intenta nuevamente."));
    }
  } catch (err) {
    console.error("❌ Error en la eliminación:", err);
    alert("❌ No se pudo eliminar el ticket. Revisa la conexión o intenta de nuevo.");
  }
});

// =====================================================
// 3️⃣ Búsqueda (con debounce)
// =====================================================
if (searchInput) {
  let timer;
  searchInput.addEventListener("keyup", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      cargarTickets(searchInput.value.trim());
    }, 300);
  });
}

// =====================================================
// 4️⃣ Logout del Administrador
// =====================================================
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    if (!confirm("¿Estás seguro de cerrar sesión?")) return;
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.warn("⚠️ Error al cerrar sesión:", e);
    } finally {
      window.location.href = "/admin";
    }
  });
}

// =====================================================
// 🚀 Inicialización
// =====================================================
document.addEventListener("DOMContentLoaded", cargarTickets);
