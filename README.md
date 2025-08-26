# Retell AI Bridge

Puente WebSocket entre Retell AI y n8n para llamadas de voz con IA.

## Características

- ✅ Conexión WebSocket con Retell AI
- ✅ Manejo de eventos (`ping_pong`, `update_only`, `response_required`, `reminder_required`)
- ✅ Integración con webhooks de n8n
- ✅ Manejo de errores robusto
- ✅ Variables de entorno configurables

## Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd retell-ai-bridge

# Instalar dependencias
npm install

# Copiar archivo de configuración
cp .env.example .env
```

## Configuración

Edita el archivo `.env` con tus valores:

```env
PORT=3000
RETELL_API_KEY=tu_clave_api_retell_aqui
N8N_WEBHOOK_URL=https://tu-instancia-n8n.com/webhook/retell
N8N_RESPONSE_URL=https://tu-instancia-n8n.com/webhook/response
NODE_ENV=development
```

## Uso

```bash
# Modo desarrollo (con recarga automática)
npm run dev

# Modo producción
npm start
```

## Endpoints

### WebSocket
- `ws://localhost:3000/ws/{call_id}` - Conexión WebSocket para Retell AI

### HTTP
- `GET /health` - Health check del servidor
- `POST /webhook/retell` - Webhook para eventos de Retell

## Integración con Retell AI

Configura tu agente en Retell AI con:
- WebSocket URL: `ws://tu-servidor.com/ws/`
- El `call_id` se añadirá automáticamente al final de la URL

## Integración con n8n

Tu workflow de n8n debe:
1. Recibir POST requests en el webhook configurado
2. Procesar el payload con la información de la llamada
3. Devolver una respuesta JSON con:
   ```json
   {
     "content": "Respuesta del agente",
     "end_call": false
   }
   ```

## Eventos Soportados

- `ping_pong` - Keepalive
- `update_only` - Actualizaciones sin respuesta requerida
- `response_required` - El agente debe responder
- `reminder_required` - Recordatorio para mantener la conversación

## Estructura del Proyecto

```
retell-ai-bridge/
├── server.js          # Servidor principal
├── package.json       # Dependencias y scripts
├── .env.example       # Plantilla de configuración
├── .env              # Configuración (no incluir en git)
└── README.md         # Este archivo
```