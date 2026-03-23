# Reverse Proxy Configuration

## Typical deployment

The normal way to run REVELation behind a reverse proxy is to start it **standalone** inside the `revelation/` submodule:

```bash
cd revelation
npm run serve
```

---

The paths worth exposing through a proxy are:

| Path | Notes |
|------|-------|
| `/socket.io` | Reveal Remote broker — **requires WebSocket upgrade** |
| `/presenter-plugins-socket` | Plugin sync — **requires WebSocket upgrade** |
| `/_remote/ui/` | Static UI for the Reveal Remote phone/tablet controller |
| `/presentations_<key>/` | Optional — proxy only if you want to serve full presentations over the public URL |

Everything else (Vite UI assets, etc.) can be proxied or left unproxied depending on your needs.

---

## nginx

```nginx
server {
    listen 443 ssl;
    server_name revelation.example.local;

    # TLS — adjust to your cert paths
    ssl_certificate     /etc/ssl/certs/revelation.crt;
    ssl_certificate_key /etc/ssl/private/revelation.key;

    # ── Socket.io — Reveal Remote broker (WebSocket + HTTP polling) ────────
    location /socket.io/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Socket.io — Presenter plugin sync (WebSocket + HTTP polling) ───────
    location /presenter-plugins-socket/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Reveal Remote controller UI ────────────────────────────────────────
    location /_remote/ui/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Presentation content (optional) ───────────────────────────────────
    # Replace <key> with your actual presentations key.
    # location /presentations_<key>/ {
    #     proxy_pass         http://127.0.0.1:8000;
    #     proxy_http_version 1.1;
    #     proxy_set_header   Host             $host;
    # }
}
```
---

> **Note:** The `/socket.io/` and `/presenter-plugins-socket/` location blocks must appear **before** any catch-all `/` block so nginx matches them first.

---

## Caddy

```caddy
revelation.example.local {
    # Caddy handles WebSocket upgrades automatically — no extra config needed.
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
    # Uncomment to proxy presentation content:
    # reverse_proxy /presentations_<key>/* 127.0.0.1:8000
}
```

---

## QR code URLs

The Reveal Remote server builds QR code URLs from the `X-Forwarded-Host` and `X-Forwarded-Proto` headers. Forward these if you want QR codes to contain the public proxy URL rather than the internal `localhost:8000` address.

---

## Uncommon: proxying the Electron GUI server

If you run the **Electron GUI** with a reverse proxy in front of it (unusual), additional paths are active that carry access controls based on loopback address checks. When a same-machine proxy forwards traffic, all requests appear loopback — these paths **must be blocked at the proxy**:

---

| Path | Risk if exposed |
|------|----------------|
| `/peer/status` | Exposes the list of connected follower devices |
| `/peer/command` | Allows broadcasting arbitrary commands to all followers |
| `/admin` | Exposes the admin UI (static files, but intended for local use only) |

---

nginx block to add in this scenario:

```nginx
location ~ ^/(peer/status|peer/command|admin) {
    deny all;
    return 403;
}
```

Caddy equivalent:

```caddy
@blocked path /peer/status /peer/command /admin*
respond @blocked 403
```
