import express, { Request, Response } from "express";
import expressWs from "express-ws";
import { RawData, WebSocket } from "ws";
import { createServer, Server as HTTPServer } from "http";
import cors from "cors";
import { Retell } from "retell-sdk";
import { CustomLlmRequest, CustomLlmResponse } from "./types";
import { DentalClinicLlmClient } from "./llms/dental_clinic_llm";

export class Server {
  private httpServer: HTTPServer;
  public app: expressWs.Application;

  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    this.handleRetellLlmWebSocket();
    this.handleWebhook();
    this.handleHealthCheck();
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log(`🦷 Servidor de Clínica Dental ejecutándose en puerto ${port}`);
    console.log(`📞 WebSocket endpoint: ws://localhost:${port}/llm-websocket/{call_id}`);
    console.log(`💚 Health endpoint: http://localhost:${port}/health`);
  }

  handleHealthCheck() {
    this.app.get("/health", (req: Request, res: Response) => {
      console.log("Health check solicitado");
      res.json({ 
        status: "ok", 
        service: "Retell AI - Clínica Dental",
        timestamp: new Date().toISOString() 
      });
    });

    this.app.get("/", (req: Request, res: Response) => {
      res.json({ 
        message: "Retell AI - Clínica Dental funcionando correctamente",
        status: "ok",
        endpoints: {
          websocket: "/llm-websocket/{call_id}",
          webhook: "/webhook",
          health: "/health"
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  handleWebhook() {
    this.app.post("/webhook", (req: Request, res: Response) => {
      if (
        !Retell.verify(
          JSON.stringify(req.body),
          process.env.RETELL_API_KEY!,
          req.headers["x-retell-signature"] as string,
        )
      ) {
        console.error("❌ Firma inválida en webhook");
        return res.status(401).json({ error: "Invalid signature" });
      }
      
      const content = req.body;
      switch (content.event) {
        case "call_started":
          console.log("📞 Llamada iniciada:", content.data.call_id);
          break;
        case "call_ended":
          console.log("📞 Llamada finalizada:", content.data.call_id);
          break;
        case "call_analyzed":
          console.log("📊 Llamada analizada:", content.data.call_id);
          break;
        default:
          console.log("❓ Evento desconocido:", content.event);
      }
      
      res.json({ received: true });
    });
  }

  handleRetellLlmWebSocket() {
    this.app.ws(
      "/llm-websocket/:call_id",
      async (ws: WebSocket, req: Request) => {
        try {
          const callId = req.params.call_id;
          console.log(`🔗 Nueva conexión WebSocket para call_id: ${callId}`);

          // Enviar configuración a Retell server
          const config: CustomLlmResponse = {
            response_type: "config",
            config: {
              auto_reconnect: true,
              call_details: true,
            },
          };
          ws.send(JSON.stringify(config));

          // Inicializar cliente LLM para clínica dental
          const llmClient = new DentalClinicLlmClient();

          ws.on("error", (err) => {
            console.error("❌ Error en WebSocket:", err);
          });
          
          ws.on("close", () => {
            console.log(`🔌 Conexión WebSocket cerrada para: ${callId}`);
          });

          ws.on("message", async (data: RawData, isBinary: boolean) => {
            if (isBinary) {
              console.error("❌ Mensaje binario recibido en lugar de texto");
              ws.close(1007, "Cannot process binary messages.");
              return;
            }
            
            try {
              const request: CustomLlmRequest = JSON.parse(data.toString());

              switch (request.interaction_type) {
                case "call_details":
                  console.log("📋 Detalles de llamada:", request.call);
                  llmClient.BeginMessage(ws);
                  break;
                  
                case "response_required":
                case "reminder_required":
                  console.log(`💬 ${request.interaction_type}:`, {
                    response_id: (request as any).response_id,
                    transcript_length: request.transcript?.length || 0
                  });
                  await llmClient.DraftResponse(request, ws);
                  break;
                  
                case "ping_pong":
                  const pingpongResponse: CustomLlmResponse = {
                    response_type: "ping_pong",
                    timestamp: request.timestamp,
                  };
                  ws.send(JSON.stringify(pingpongResponse));
                  break;
                  
                case "update_only":
                  // Procesar actualización de transcripción si es necesario
                  break;
                  
                default:
                  console.log("❓ Tipo de interacción desconocida:", (request as any).interaction_type);
              }
            } catch (parseError) {
              console.error("❌ Error parseando mensaje WebSocket:", parseError);
            }
          });
        } catch (err) {
          console.error("❌ Error en manejo de WebSocket:", err);
          ws.close(1011, "Error interno del servidor");
        }
      },
    );
  }
}