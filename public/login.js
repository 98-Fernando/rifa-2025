document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evita que el formulario recargue la página

            errorMessage.textContent = ''; // Limpia mensajes previos

            const username = document.querySelector('input[name="username"]').value.trim();
            const password = document.querySelector('input[name="password"]').value.trim();

            if (!username || !password) {
                errorMessage.textContent = 'Por favor, completa todos los campos.';
                return;
            }

            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username, password })
                });

                if (res.ok) {
                    // El backend debe devolver { success: true }
                    const data = await res.json();
                    if (data.success) {
                        // Redirige al panel de administración
                        window.location.href = "https://rifa-2025.onrender.com/admin.html";
                    } else {
                        errorMessage.textContent = 'Error desconocido.';
                    }
                } else if (res.status === 401) {
                    errorMessage.textContent = 'Usuario o contraseña incorrectos.';
                } else {
                    errorMessage.textContent = 'Error interno del servidor. Intenta de nuevo.';
                }
            } catch (error) {
                console.error("Error de red/servidor:", error);
                errorMessage.textContent = 'Error de conexión. Verifica la URL del servidor.';
            }
        });
    }
});
