import dotenv from "dotenv";
import { Server } from "./server";

// Cargar variables de entorno
dotenv.config();

// Verificar variables de entorno requeridas
const requiredEnvVars = [
  'RETELL_API_KEY',
  'OPENAI_APIKEY',
  'N8N_WEBHOOK_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Variables de entorno faltantes:', missingVars.join(', '));
  process.exit(1);
}

const server = new Server();
const PORT = parseInt(process.env.PORT || "3000");

// Manejo de errores globales
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  console.log('🔄 Recibida señal SIGTERM, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Recibida señal SIGINT, cerrando servidor...');
  process.exit(0);
});

console.log('🚀 Iniciando servidor...');
console.log('📋 Variables de entorno:');
console.log(`   - PORT: ${process.env.PORT || '3000'}`);
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   - RETELL_API_KEY: ${process.env.RETELL_API_KEY ? '✅ Configurada' : '❌ Faltante'}`);
console.log(`   - OPENAI_APIKEY: ${process.env.OPENAI_APIKEY ? '✅ Configurada' : '❌ Faltante'}`);
console.log(`   - N8N_WEBHOOK_URL: ${process.env.N8N_WEBHOOK_URL || '❌ No configurada'}`);

server.listen(PORT);