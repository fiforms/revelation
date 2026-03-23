# Configuración de proxy inverso

## Despliegue habitual

La forma habitual de ejecutar REVELation detrás de un proxy inverso es iniciarlo en modo **autónomo** dentro del submódulo `revelation/`:

```bash
cd revelation
npm run serve
```

---

Las rutas que conviene exponer a través del proxy son:

| Ruta | Notas |
|------|-------|
| `/socket.io` | Broker de Reveal Remote — **requiere actualización WebSocket** |
| `/presenter-plugins-socket` | Sincronización de plugins — **requiere actualización WebSocket** |
| `/_remote/ui/` | Interfaz estática del controlador telefónico/tableta de Reveal Remote |
| `/presentations_<clave>/` | Opcional — proxifica solo si deseas servir presentaciones completas desde la URL pública |

Todo lo demás (recursos de la interfaz de Vite, etc.) puede proxificarse o no, según tus necesidades.

---

## nginx

```nginx
server {
    listen 443 ssl;
    server_name revelation.ejemplo.local;

    # TLS — ajusta las rutas a tus certificados
    ssl_certificate     /etc/ssl/certs/revelation.crt;
    ssl_certificate_key /etc/ssl/private/revelation.key;

    # ── Socket.io — broker de Reveal Remote (WebSocket + sondeo HTTP) ─────
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Socket.io — sincronización de plugins del presentador ─────────────
    location /presenter-plugins-socket/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Interfaz del controlador Reveal Remote ────────────────────────────
    location /_remote/ui/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Contenido de presentaciones (opcional) ────────────────────────────
    # Sustituye <clave> por tu clave real de presentaciones.
    # location /presentations_<clave>/ {
    #     proxy_pass         http://127.0.0.1:8000;
    #     proxy_http_version 1.1;
    #     proxy_set_header   Host             $host;
    # }
}
```
---

> **Nota:** Los bloques de ubicación `/socket.io/` y `/presenter-plugins-socket/` deben aparecer **antes** de cualquier bloque comodín `/` para que nginx los resuelva primero.

---

## Caddy

```caddy
revelation.ejemplo.local {
    # Caddy gestiona las actualizaciones WebSocket automáticamente — sin configuración adicional.
    reverse_proxy /socket.io/* 127.0.0.1:8000 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
    reverse_proxy /presenter-plugins-socket/* 127.0.0.1:8000 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
    reverse_proxy /_remote/ui/* 127.0.0.1:8000 {
        header_up Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
    # Descomenta para proxificar el contenido de las presentaciones:
    # reverse_proxy /presentations_<clave>/* 127.0.0.1:8000
}
```

---

## URLs del código QR

El servidor de Reveal Remote construye las URLs del código QR a partir de las cabeceras `X-Forwarded-Host` y `X-Forwarded-Proto`. Reenvíalas si deseas que los códigos QR contengan la URL pública del proxy en lugar de la dirección interna `localhost:8000`.

---

## Poco habitual: proxificar el servidor de la interfaz Electron

Si ejecutas la **interfaz Electron** con un proxy inverso delante (caso poco frecuente), hay rutas adicionales activas que aplican controles de acceso basados en la comprobación de dirección de bucle local. Cuando un proxy en la misma máquina reenvía el tráfico, todas las solicitudes aparecen como bucle local — estas rutas **deben bloquearse en el proxy**:

---

| Ruta | Riesgo si queda expuesta |
|------|--------------------------|
| `/peer/status` | Expone la lista de dispositivos seguidores conectados |
| `/peer/command` | Permite difundir comandos arbitrarios a todos los seguidores |
| `/admin` | Expone la interfaz de administración (archivos estáticos, pero de uso local exclusivamente) |

---

Bloque nginx para añadir en este escenario:

```nginx
location ~ ^/(peer/status|peer/command|admin) {
    deny all;
    return 403;
}
```

Equivalente en Caddy:

```caddy
@blocked path /peer/status /peer/command /admin*
respond @blocked 403
```
