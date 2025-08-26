const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(express.json());

const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
});

wss.on('connection', (ws, request) => {
    const callId = request.url.split('/').pop();
    console.log(`Nueva conexión WebSocket para call_id: ${callId}`);
    
    ws.callId = callId;
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('Mensaje recibido de Retell:', data);
            
            await handleRetellMessage(ws, data);
        } catch (error) {
            console.error('Error procesando mensaje:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`Conexión cerrada para call_id: ${callId}`);
    });
    
    ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
    });
});

async function handleRetellMessage(ws, data) {
    const { event_type } = data;
    
    switch (event_type) {
        case 'ping_pong':
            console.log('Ping pong recibido');
            break;
            
        case 'update_only':
            console.log('Update only:', data);
            break;
            
        case 'response_required':
            console.log('Response required:', data);
            await handleResponseRequired(ws, data);
            break;
            
        case 'reminder_required':
            console.log('Reminder required:', data);
            await handleReminderRequired(ws, data);
            break;
            
        default:
            console.log('Evento desconocido:', event_type);
    }
}

async function handleResponseRequired(ws, data) {
    try {
        const response = await processWithN8N(data);
        
        const agentResponse = {
            event_type: 'response',
            response_id: data.response_id,
            content: response.content || 'Lo siento, no pude procesar tu solicitud.',
            content_complete: true,
            end_call: response.end_call || false
        };
        
        ws.send(JSON.stringify(agentResponse));
    } catch (error) {
        console.error('Error manejando response_required:', error);
        
        const errorResponse = {
            event_type: 'response',
            response_id: data.response_id,
            content: 'Disculpa, hay un problema técnico. ¿Podrías repetir tu consulta?',
            content_complete: true,
            end_call: false
        };
        
        ws.send(JSON.stringify(errorResponse));
    }
}

async function handleReminderRequired(ws, data) {
    const reminderResponse = {
        event_type: 'response',
        response_id: data.response_id,
        content: '¿En qué más puedo ayudarte hoy?',
        content_complete: true,
        end_call: false
    };
    
    ws.send(JSON.stringify(reminderResponse));
}

async function processWithN8N(data) {
    if (!process.env.N8N_WEBHOOK_URL) {
        throw new Error('N8N_WEBHOOK_URL no configurada');
    }
    
    const payload = {
        call_id: data.call_id,
        transcript: data.transcript,
        user_utterance: data.user_utterance,
        last_user_utterance: data.last_user_utterance,
        interaction_type: data.interaction_type || 'response_required'
    };
    
    try {
        const response = await axios.post(process.env.N8N_WEBHOOK_URL, payload, {
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Error llamando a n8n webhook:', error.message);
        throw error;
    }
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/webhook/retell', express.json(), (req, res) => {
    console.log('Webhook de Retell recibido:', req.body);
    res.json({ received: true });
});

const PORT = process.env.PORT || 3000;

// Manejo de errores globales
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
    console.log('Recibida señal SIGTERM, cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado correctamente');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Recibida señal SIGINT, cerrando servidor...');
    server.close(() => {
        console.log('Servidor cerrado correctamente');
        process.exit(0);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en puerto ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws/{call_id}`);
    console.log(`Health endpoint: http://localhost:${PORT}/health`);
});