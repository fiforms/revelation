# Modelo de seguridad

Los niveles de confianza que este software pretende hacer cumplir en la superficie HTTP/WebSocket
creada por [`../vite.plugins.js`](../vite.plugins.js) (con los módulos de [`../server/`](../server/)) y en el wrapper Electron
que la controla: qué puede hacer cada nivel y dónde residen realmente los límites en el código.

Este documento describe únicamente el modelo. Los hallazgos de auditoría que se midieron
contra él viven en otro lugar, identificados como `F1`–`F9`:

- **Corregidos** — consulta la sección de seguridad del
  [`CHANGELOG.md`](../../CHANGELOG.md) del wrapper.
- **Abiertos, diferidos o retirados** — consulta el
  [`TODO.md`](../../TODO.md) del wrapper.

Relacionado: [REVERSE_PROXY.md](REVERSE_PROXY.md) para usar un proxy con una instancia normal,
y [`doc/dev/PUBLIC_RELAY.md`](../../doc/dev/PUBLIC_RELAY.md) para ejecutar un
relay exclusivo de sockets.

Modelo revisado por última vez el 2026-09-20.

---

## El modelo de amenazas en un párrafo

La aplicación se ejecuta en el propio equipo del presentador. **Cualquiera con acceso local a la consola,
o con la `key` secreta de la aplicación, es plenamente de confianza**: puede leer todas las
presentaciones, controlar todas las pantallas y activar la conversión de medios, la escritura de archivos y la
ejecución de subprocesos. Esa es la naturaleza del producto y no es una
vulnerabilidad. Los límites que vale la pena defender son los dos niveles *externos*: un vecino de la LAN
que simplemente descubre el servicio y un miembro de la audiencia a quien se le dio un enlace a una
presentación.

---

Una excepción deliberada matiza ese segundo límite. Cuando un plugin de colaboración está habilitado, los espectadores que tienen un enlace
*deben* poder cambiar el espacio compartido de diapositivas: navegar por la presentación, dibujar en la pizarra,
enviar un versículo.
Consulta [la excepción de colaboración](#open-collaboration-plugins--accepted-design); esa excepción es
parte del modelo, no una brecha en él.

---

## Niveles de confianza

| Nivel | Quién | Debería poder | **No** debe poder |
|---|---|---|---|
| **T0 — Operador** | Usuario de consola de la máquina; cualquier cosa que llegue a la aplicación por loopback | Todo | — |
| **T1 — Poseedor de la clave** | Cualquiera que conozca `config.key` (aparece en cada URL de presentación compartida) | Leer presentaciones y medios; renderizar presentaciones | Acceder a la API de control, leer la configuración de la aplicación, ejecutar código en la aplicación Electron |
| **T2 — Espectador invitado** | Quien recibió el enlace de una presentación o multiplex | Ver ese contenido; seguir al presentador | Modificar el contenido, controlar las presentaciones de otros espectadores, enumerar la biblioteca |
| **T2c — Espectador colaborador** | Un espectador invitado, cuando un plugin de colaboración está habilitado | Todo lo que puede T2, **más** controlar el espacio compartido de diapositivas — consulta [la excepción de colaboración](#open-collaboration-plugins--accepted-design) | Ejecutar código, leer archivos, acceder a la API de control, enumerar la biblioteca |
| **T3 — Sondeador de LAN** | Descubre `http://<host>:8000/` sin enlace ni clave | Saber que hay una aplicación de presentador en ejecución | Enumerar presentaciones, leer archivos, obtener claves/PIN, activar cualquier operación |
| **T4 — Peer emparejado** | Una instancia seguidora emparejada por mDNS con el PIN | Recibir comandos de sincronización de diapositivas | Extraer material de firma o actuar como la aplicación ante terceros |

---

## Secretos y qué protege cada uno

| Secreto | Entropía | Protege | Dónde se filtra |
|---|---|---|---|
| `config.key` | 64 bits (`crypto`) | `/presentations_<key>/`, `/plugins_<key>/`, `/thumbs_<key>/`, servidor de API en :8900 | **Cada enlace de presentación compartido** (`/presentation.html?slug=…&key=…`) |
| `presentationPublishKey` | 64 bits (`crypto`) | `/publish/<key>.html` | El enlace de la pantalla de publicación por URL |
| `mdnsPairingPin` | 6 dígitos (`crypto`) | Solo `/peer/pair` (protocolo v2; `/peer/socket-info` y `/peer/challenge` exigen en su lugar una firma del seguidor) | Se muestra en el panel de información del presentador |
| `rsaPrivateKey` | RSA | Solo autenticación de publicación en WordPress | Nunca se sirve |
| `peerRsaPrivateKey` | RSA | Emparejamiento de peers y autenticación del socket de peers | Nunca se sirve |
| Reveal-remote `remoteId` | UUIDv4 | Canal de control remoto de una presentación | Código QR remoto del presentador |
| Reveal-remote `multiplexId` | UUIDv4 | Canal de seguidores/multiplex | Cada enlace de seguidor |
| `presenterLiveRoomId` | 128 bits (`crypto`, por sesión del servidor) | La sala de versículos en vivo de `bibletext-live` | Cada presentación, mediante `reveal-remote.js` |
| `/media-share/<token>` | 192 bits (`crypto`) | Un archivo de medios registrado | HTML de la presentación |

> **La clave es global, no por presentación.** Entregar a alguien el enlace de una
> presentación le entrega T1 sobre toda la biblioteca. Lo único que separa a un espectador T2
> del resto de la biblioteca es que `index.json` es solo de loopback, por lo que no puede
> *enumerar* slugs; aun así puede obtener cualquier slug que adivine o que alguna vez se le haya mencionado.
> Trata "compartir un enlace" como "compartir la biblioteca, sin listarla".

---

## Mecanismos de aplicación en uso

- **Comprobación de loopback** — `isLoopbackAddress(req.socket.remoteAddress)` en
  [`../server/network.js`](../server/network.js). Se usa para `/admin`,
  `/peer/status`, `*/index.json` y la compuerta de origen del sandbox. Los comandos a
  los seguidores no se envían por HTTP en absoluto: el proceso principal se los entrega al
  proceso de Vite mediante `parentPort`, de modo que ninguna página web puede alcanzar esa ruta.
- **Secreto en la ruta de la URL** — `/presentations_<key>/`, `/plugins_<key>/`,
  `/thumbs_<key>/`, `/publish/<publishKey>.html`, `/media-share/<token>`.
  No son enumerables: `serve-static` no genera listados de directorios y
  `index: false` está configurado en el montaje de presentaciones.
- **PIN + bloqueo** — `enforcePairingPin()` en [`../server/peer-server.js`](../server/peer-server.js):
  falla de forma cerrada, 3 fallos por dirección remota, bloqueo de 60 s, comparación con `timingSafeEqual`.
  Protege únicamente el registro (`/peer/pair`).
- **Firmas con la clave del seguidor** — tras el registro, el maestro guarda la clave pública
  de peer de cada seguidor (`peer-followers.json`). `/peer/socket-info` y
  `/peer/challenge` necesitan una firma del seguidor sobre un nonce emitido por el maestro, de un solo uso y
  autenticado con HMAC. El PIN no se vuelve a enviar y los seguidores se
  revocan uno por uno desde Settings.
- **Desafío/respuesta RSA** — el servidor Socket.IO `/peer-commands` exige
  un payload bearer `token:expiresAt:socketPath` firmado por el servidor, con el
  par de claves de peer dedicado y una firma con separación de dominio. Los tokens los emite
  el servidor y están vinculados al seguidor al que se emitieron.
- **Indicador de funcionalidad** — todo el árbol `/peer/*` responde 403 a menos que
  `config.mdnsPublish === true`.
- **Dirección de enlace** — en modo `localhost` Vite se inicia sin `--host`, de modo que
  nada salvo loopback puede conectarse. El servidor de API en :8900 siempre
  está enlazado a `127.0.0.1` y su puerto predeterminado queda fuera del rango de reserva de Vite.
- **CSP** — `presentation.html` incluye
  `script-src 'self'; object-src 'none'; base-uri 'self'`, que es lo que evita que el
  marcado inyectado se convierta en ejecución de código (consulta F3 en CHANGELOG.md).
- **`pip.html` (shell de imagen en imagen)** — accesible sin clave (T3) y abierto por el
  wrapper en una ventana que tiene el preload de la presentación, por lo que se trata como un límite de confianza.
  Su `?src=` debe ser una URL `http:`/`https:` absoluta (`js/pip-core.js`; `javascript:`,
  `data:`, `blob:`, `file:` y los valores relativos se rechazan), su `?color=` debe ser un
  color CSS válido y solo actúa sobre un `postMessage` si el remitente es el marco incrustado o la
  propia página *y* el origen es el de la propia página, de modo que una página externa mostrada en el marco
  no pueda hacer que el presentador envíe una URL a los peers emparejados ni cerrar la ventana. La página no tiene
  script en línea y tiene una CSP en una etiqueta meta (`default-src 'none'; script-src 'self'; frame-src http: https:;
  …`) como respaldo. Pruebas: `tests/unit/pip-core.test.cjs`, `pip-page.test.cjs`,
  `tests/server/pip.test.cjs`.

---

## Mapa de endpoints

"Modo de ruta personalizada" es el modo GUI normal del wrapper: el wrapper define `PRESENTATIONS_DIR_OVERRIDE` y `PLUGINS_DIR_OVERRIDE`, y entonces el servidor monta las rutas con clave `/presentations_<key>/`, `/plugins_<key>/`, `/thumbs_<key>/` y `/admin`. Un servidor autónomo sin esas variables no las monta.

| Ruta | Accesible por | Compuerta |
|---|---|---|
| `/`, `/presentation.html`, `/presentations.html`, `/@fs/*`, `/node_modules/*` | T3 | ninguna (raíz del servidor de desarrollo de Vite) |
| `/css/**`, `/oldcss/<ver>/**` | T3 | ninguna (temas compilados desde la raíz de Vite y `assets/`; sin secretos) |
| `/pip.html`, `/js/pip*.js` | T3 | ninguna, pero la página valida su propia entrada e incluye una CSP (consulta "Mecanismos de aplicación en uso"); no lo sirve el relay público |
| `/presentations_<key>/**` | T1 | clave en la ruta |
| `/plugins_<key>/**` | T1 | solo en modo de ruta personalizada; clave en la ruta — **sirve el código fuente de plugins del lado del servidor** (F7, abierto) |
| `/thumbs_<key>/**` | T1 | solo en modo de ruta personalizada; clave en la ruta — **lanza ffmpeg**: solo archivos de imagen/video dentro del directorio de presentaciones, 2 a la vez, 200 en cola, límite de 30 s |
| `**/index.json` | T0 | loopback; también cubre `_media/index.json`, por lo que los seguidores no pueden leer el índice de medios y pierden la búsqueda de la variante de alta calidad |
| `/admin/**` | T0 | loopback; solo en modo de ruta personalizada |
| `/peer/status` | T0 | loopback + `mdnsPublish` |
| `/peer/public-key` | T3 | solo `mdnsPublish` — pública por diseño, mismos datos que difunde mDNS |
| `/peer/auth-nonce` | T3 | solo `mdnsPublish` — nonce HMAC sin estado, sin datos |
| `/peer/pair` | T3→T4 | `mdnsPublish` + PIN (falla de forma cerrada, bloqueo tras 3 fallos) |
| `/peer/socket-info`, `/peer/challenge` | T4 | `mdnsPublish` + firma con la clave del seguidor registrado sobre un nonce de un solo uso |
| `/publish/<publishKey>.html` | T2 | clave de 64 bits en el nombre de archivo |
| `/media-share/<token>` | T2 | token de 192 bits |
| `/_remote/ui/**` | T3 | ninguna (solo interfaz estática) |
| `/socket.io` (Reveal Remote) | T3 | ninguna; UUID por canal |
| `/peer-commands` | T4 | bearer RSA, token vinculado a un seguidor registrado |
| `/presenter-plugins-socket` | T2c | solo el id de sala — **abierto por diseño**, consulta [la excepción de colaboración](#open-collaboration-plugins--accepted-design) |
| `http://127.0.0.1:8900/api/**` | T0 + clave | enlace a loopback + `key` |

---

<a id="open-collaboration-plugins--accepted-design"></a>

## Plugins de colaboración abierta — diseño aceptado

Cinco plugins usan el servidor Socket.IO `/presenter-plugins-socket` (con su propio `path`), y los cinco tratan
una sala compartida como **un espacio colaborativo en el que cada participante es un par**:

| Plugin | Qué puede hacer un participante | Id de sala |
|---|---|---|
| `slidecontrol` | Navegar la presentación para todos: siguiente/anterior, saltar a una diapositiva, pantalla en blanco, vista general | `remoteMultiplexId` |
| `markerboard` | Dibujar, borrar y restaurar la pizarra compartida | `remoteMultiplexId` |
| `bibletext-live` | Enviar el versículo en vivo que se muestra en cada diapositiva mágica | `presenterLiveRoomId` (por sesión del servidor) |
| `captions` | Enviar texto de subtítulos en vivo | `remoteMultiplexId` |
| `videostream` | Controlar la reproducción de video compartida | `remoteMultiplexId` |

---

**Este es un comportamiento previsto, no un defecto.** Ese servidor no tiene
autenticación ni separación entre publicar y suscribirse: poseer el id de sala es el
permiso. Un id de sala no es una capacidad que la aplicación intente proteger: está en
el enlace multiplex que se entrega a cada espectador.

En consecuencia, **T2c es el nivel operativo siempre que cualquiera de estos plugins esté
habilitado**: compartir el enlace de una presentación equivale a otorgar derechos de colaborador
en ese espacio de diapositivas. Las restricciones de T2 anteriores ("no debe modificar
el contenido ni controlar las presentaciones de otros espectadores") describen la aplicación solo cuando ninguno de
estos plugins está habilitado.

---

Estos cinco declaran `"collaboration": true` en su `plugin-manifest.json`,
junto con una cadena `collaboration_detail` que nombra las capacidades concretas que obtiene un
espectador. Settings los marca con una insignia, muestra el detalle cuando el plugin se
expande y exhibe un aviso permanente que enumera los que estén habilitados, de modo que la
regla operativa de abajo sea visible en el momento de elegir y no solo aquí. Un
plugin nuevo que acepte `presenter-plugin:event` de otros participantes debe
activar el mismo indicador; consulta [`doc/dev/PLUGINS.md`](../../doc/dev/PLUGINS.md).

---

### Ejecutar un relay público

Los servidores Socket.IO pueden alojarse en un servidor público para que los participantes
fuera de la LAN puedan unirse; eso es lo que es `revealremote.fiforms.org`. Ese
despliegue es el único lugar donde la debilidad del proxy inverso en las compuertas de loopback anteriores
realmente se manifiesta: detrás de un proxy en la misma máquina, cada solicitud reenviada se presenta como
`127.0.0.1`, de modo que cada compuerta `isLoopbackAddress()` se supera para todo
internet.

---

El **modo de relay público** existe precisamente para esto. Inicia el servidor con
`REVELATION_PUBLIC_SERVER=1` (o `--public-server`, o `npm run relay`) y solo
servirá:

| Ruta | Qué |
|---|---|
| `/socket.io` | Broker de Reveal Remote |
| `/presenter-plugins-socket` | Canal de plugins del presentador |
| `/_remote/ui/**` | La interfaz estática de control remoto (autocontenida) |
| `/` | Una cadena de una línea que indica que el servicio está activo, sin detalles del host |

---

Todo lo demás devuelve un `404` simple. El modo no protege con compuertas las funciones
de la máquina local: **nunca las registra**: no hay presentaciones, plugins, miniaturas
(por lo tanto, ni `ffmpeg`), tokens de medios, `/publish`, `/admin`, `/peer/*`, `index.json`,
vigilancia de archivos ni raíz estática de Vite ni `/@fs`. `peerServer.attachSocketServer()` y el middleware `/peer/*`
tampoco se montan, ya que el emparejamiento de peers se autentica contra un `config.json` que un
relay no tiene por qué contener. El directorio de presentaciones nunca se resuelve,
así que un relay no necesita ningún dato de presentaciones en disco.

Como no se monta nada protegido por loopback, la cuestión del proxy no se plantea:
no hay nada detrás de la compuerta a lo que acceder. No ejecutes un relay en el modo
normal de la aplicación intentando bloquear con un firewall las rutas adicionales: usa este modo.

Verificado contra un servidor real con 36 sondeos que cubren las rutas permitidas,
la raíz estática y los archivos fuente de Vite, `/@fs` y los escapes por recorrido de rutas, cada
ruta de la máquina local y los tres servidores Socket.IO.

---

### Regla operativa

> **Si algún plugin de colaboración está habilitado, comparte los enlaces de presentación y multiplex
> solo con un grupo pequeño de personas de confianza.** No hay permisos por espectador,
> ni modo de solo lectura, ni forma de expulsar a un participante. Cualquiera que
> obtenga el enlace, o lo reenvíe, puede controlar el espacio compartido para
> todos los que estén en él.

---

Dos consecuencias que conviene enunciar con claridad, porque es fácil subestimarlas:

- **Revocar significa invalidar el id de sala.** Dejar de compartir un enlace no
  hace nada por sí solo. Reinicia la aplicación para generar un nuevo `presenterLiveRoomId` para
  `bibletext-live`, o inicia una nueva sesión multiplex para los otros cuatro. (Antes
  de la corrección F3 esto significaba rotar `config.key`, lo que además rompía todos los enlaces
  compartidos y todas las URL publicadas.)
- **La sala está limitada a la LAN de forma predeterminada, pero no tiene por qué.** El tráfico permanece en
  el servidor Vite de esta máquina a menos que esté habilitada la opción *Route Live Features Through the Public Server*
  en Settings, que lo traslada a un relay público de internet; en ese
  punto un participante ya no necesita estar en tu red, solo poseer el
  id de sala.

---

### Lo que la excepción de colaboración *no* cubre

Aceptar la colaboración abierta significa aceptar que los participantes pueden cambiar lo que
muestra la sala. No se extiende a permitirles escapar de la sala:

- **Sin ejecución de código.** Un participante puede definir el *contenido* de la diapositiva, no ejecutar scripts
  en la página de otro espectador. El sanitizador de lista permitida de `bibletext-live` (F3) y la
  CSP de `presentation.html` lo hacen cumplir y siguen siendo esenciales.
- **Sin acceso a nada fuera del espacio compartido.** La biblioteca, los archivos locales,
  la configuración de la aplicación y la API de control siguen fuera de alcance: esos son límites T0/T1
  y esta excepción no los afecta.
- **Sin filtrar la clave de acceso.** Los ids de sala nunca deben derivarse de
  `config.key`. `bibletext-live` (antes parte de `bibletext`) llegó a nombrar su sala `live-<config.key>`, lo que puso
  el secreto maestro de la instalación en la tabla de salas del servidor de sockets; se corrigió en
  F3: las salas ahora usan un `presenterLiveRoomId` por sesión y los otros cuatro
  plugins usan el `remoteMultiplexId`. Un id de sala se comparte con todos los de la
  sala y con quien opere el servidor de sockets, por lo que no debe proteger nada salvo
  la sala.

---

### Diferido: separación de permisos de publicar/suscribirse

Un diseño futuro podría separar *publicar* de *suscribirse* en este servidor:
un token en poder del presentador que permita transmitir, con los espectadores suscritos en solo lectura
y la intención de navegación retransmitida a través del presentador. **No está planificado.** Hoy no hay
ningún caso de uso concreto para un espectador que deba ver el espacio compartido pero no
participar en él, y el modelo abierto es lo que hace posible que funcionen la pizarra
colaborativa y la navegación dirigida por la audiencia. Vuelve a considerarlo solo si aparece un
despliegue que necesite salas con permisos mixtos; por ejemplo, una transmisión pública
en la que la audiencia deba mirar pero no dibujar.

---

## Cómo reportar una vulnerabilidad

Reporta los problemas de seguridad de forma privada a los mantenedores en lugar de abrir una
incidencia pública.
