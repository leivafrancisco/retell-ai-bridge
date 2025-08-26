# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WebSocket bridge that connects Retell AI voice calls with n8n workflows. The application acts as a middleware service that receives real-time voice events from Retell AI and forwards them to n8n for processing, then returns the processed responses back to Retell AI.

## Architecture

The project follows a simple single-file architecture in `server.js` with these main components:

- **WebSocket Server**: Handles connections from Retell AI on path `/ws/{call_id}`
- **Event Handler**: Processes different types of Retell AI events (`ping_pong`, `update_only`, `response_required`, `reminder_required`)
- **n8n Integration**: Makes HTTP requests to n8n webhooks for AI processing
- **HTTP Endpoints**: Health check and webhook endpoints

## Common Development Commands

```bash
# Install dependencies
npm install

# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Environment setup
cp .env.example .env
```

## Key Environment Variables

The application requires these environment variables in `.env`:
- `PORT`: Server port (default: 3000)
- `RETELL_API_KEY`: Retell AI API key
- `N8N_WEBHOOK_URL`: Primary n8n webhook endpoint for processing
- `N8N_RESPONSE_URL`: Alternative n8n webhook (currently unused)
- `NODE_ENV`: Environment mode

## Event Flow

1. Retell AI connects via WebSocket to `/ws/{call_id}`
2. Events are parsed and routed through `handleRetellMessage()`
3. `response_required` events trigger `processWithN8N()` which posts to n8n
4. n8n processes the request and returns a response
5. The response is formatted and sent back to Retell AI via WebSocket

## Important Implementation Details

- WebSocket connections are identified by `call_id` extracted from the URL path
- The n8n integration uses a 5-second timeout for HTTP requests
- Error handling includes fallback responses to maintain call continuity
- The `reminder_required` event has a hardcoded Spanish response
- All console logging is in Spanish matching the business domain

## Testing the Integration

- Health check: `GET /health`
- Webhook test: `POST /webhook/retell`
- WebSocket connection: `ws://localhost:3000/ws/test_call_id`

## n8n Webhook Contract

The service expects n8n to return JSON with:
```json
{
  "content": "Agent response text",
  "end_call": false
}
```

## Deployment Options

### EasyPanel Deployment (Recommended)
1. Create Node.js application in EasyPanel
2. Set environment variables in the panel
3. Configure custom domain with automatic SSL
4. Use `npm start` as start command

### Manual VPS Deployment
1. Install Node.js 18+ and PM2
2. Upload project files to `/var/www/retell-ai-bridge/`
3. Configure environment variables in `.env`
4. Use PM2 for process management with `ecosystem.config.js`
5. Setup Nginx reverse proxy for port 3000
6. Configure SSL with Certbot

### Post-Deployment Verification
- Health check: `GET /health`
- WebSocket test: Connect to `ws://domain.com/ws/test_call`
- Monitor logs with `pm2 logs retell-ai-bridge`