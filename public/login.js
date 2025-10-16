document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Detiene el envío estándar del navegador

            errorMessage.textContent = ''; // Limpiar errores

            const formData = new FormData(form);
            const data = Object.fromEntries(formData); // {username: '...', password: '...'}

            try {
                // Petición asíncrona al servidor
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(data)
});


                // Si el servidor responde con un código de éxito (como 204)
                if (res.ok) {
                    // ¡Esto es lo que forzará la redirección a admin.html!
                    window.location.href = "https://rifa-2025.onrender.com/admin/dashboard";
                } else if (res.status === 401) {
                    errorMessage.textContent = 'Usuario o contraseña incorrectos.';
                } else {
                    errorMessage.textContent = 'Error interno del servidor. Intenta de nuevo.';
                }

            } catch (error) {
                console.error("Error de red/servidor:", error);
                errorMessage.textContent = 'Error de conexión. Verifica la URL de tu servicio.';
            }
        });
    }
});
