import OpenAI from "openai";
import { WebSocket } from "ws";
import axios from "axios";
import {
  CustomLlmResponse,
  FunctionCall,
  ReminderRequiredRequest,
  ResponseRequiredRequest,
  Utterance,
} from "../types";

const beginSentence = `Hola, soy María, la recepcionista de la Clínica Dental San Rafael. ¿En qué puedo ayudarte hoy?`;

const systemPrompt = `
## Objetivo
Eres María, la recepcionista virtual de la Clínica Dental San Rafael. Tu trabajo es ayudar a los pacientes a agendar, reagendar o cancelar citas dentales de manera amigable y profesional en español.

## Personalidad
- Amable, empática y profesional
- Hablas en español natural y cálido
- Eres paciente con personas mayores o nerviosas
- Mantienes la conversación enfocada en las citas

## Información de la Clínica
- Horarios: Lunes a Viernes 8:00-18:00, Sábados 8:00-13:00
- Servicios: Limpieza, obturaciones, endodoncias, ortodoncias, implantes
- Especialistas disponibles: Dr. González (Endodoncista), Dra. Martínez (Ortodoncista)

## Estilo de Conversación
- Responde de forma concisa y natural
- Usa frases cortas y claras
- Haz preguntas específicas para obtener información
- Confirma todos los datos antes de proceder
- Si no entiendes algo, pide aclaración de forma amigable

## Reglas Importantes
- NUNCA inventes horarios disponibles
- SIEMPRE usa las funciones para verificar disponibilidad y agendar citas
- Recolecta información completa: nombre, teléfono, tipo de consulta, fecha/hora preferida
- Si no puedes resolver algo, ofrece que un humano los contacte
- Mantén la información confidencial
- No des consejos médicos, solo agenda citas

## Manejo de Errores de Voz
- Si no entiendes algo, usa frases como "no te escuché bien", "podrías repetir", "se cortó un poco"
- Nunca menciones "error de transcripción"
- Sé coloquial y natural
`;

export class DentalClinicLlmClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_APIKEY,
    });
  }

  BeginMessage(ws: WebSocket) {
    const res: CustomLlmResponse = {
      response_type: "response",
      response_id: 0,
      content: beginSentence,
      content_complete: true,
      end_call: false,
    };
    ws.send(JSON.stringify(res));
  }

  private ConversationToChatRequestMessages(conversation: Utterance[]) {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    for (const turn of conversation) {
      result.push({
        role: turn.role === "agent" ? "assistant" : "user",
        content: turn.content,
      });
    }
    return result;
  }

  private PreparePrompt(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    funcResult?: FunctionCall,
  ) {
    const transcript = this.ConversationToChatRequestMessages(
      request.transcript,
    );
    const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        {
          role: "system",
          content: systemPrompt,
        },
      ];
    
    for (const message of transcript) {
      requestMessages.push(message);
    }

    if (funcResult) {
      requestMessages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: funcResult.id,
            type: "function",
            function: {
              name: funcResult.funcName,
              arguments: JSON.stringify(funcResult.arguments),
            },
          },
        ],
      });
      requestMessages.push({
        role: "tool",
        tool_call_id: funcResult.id,
        content: funcResult.result || "",
      });
    }

    if (request.interaction_type === "reminder_required") {
      requestMessages.push({
        role: "user",
        content: "(El paciente no ha respondido en un momento, podrías decir algo para continuar la conversación)",
      });
    }
    
    return requestMessages;
  }

  async DraftResponse(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    ws: WebSocket,
    funcResult?: FunctionCall,
  ) {
    const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      this.PreparePrompt(request, funcResult);

    let funcCall: FunctionCall | undefined;
    let funcArguments = "";

    try {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "check_availability",
            description: "Verificar disponibilidad de citas en fechas específicas",
            parameters: {
              type: "object",
              properties: {
                date: {
                  type: "string",
                  description: "Fecha solicitada en formato YYYY-MM-DD",
                },
                time: {
                  type: "string",
                  description: "Hora preferida en formato HH:MM",
                },
                service_type: {
                  type: "string",
                  description: "Tipo de consulta: general, limpieza, endodoncia, ortodoncia, implante",
                },
              },
              required: ["date"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "book_appointment",
            description: "Agendar una cita dental después de verificar disponibilidad",
            parameters: {
              type: "object",
              properties: {
                patient_name: {
                  type: "string",
                  description: "Nombre completo del paciente",
                },
                phone: {
                  type: "string",
                  description: "Teléfono de contacto del paciente",
                },
                date: {
                  type: "string",
                  description: "Fecha de la cita en formato YYYY-MM-DD",
                },
                time: {
                  type: "string",
                  description: "Hora de la cita en formato HH:MM",
                },
                service_type: {
                  type: "string",
                  description: "Tipo de consulta solicitada",
                },
                is_new_patient: {
                  type: "boolean",
                  description: "Si es un paciente nuevo o existente",
                },
              },
              required: ["patient_name", "phone", "date", "time", "service_type"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "cancel_appointment",
            description: "Cancelar una cita existente",
            parameters: {
              type: "object",
              properties: {
                patient_name: {
                  type: "string",
                  description: "Nombre del paciente",
                },
                phone: {
                  type: "string",
                  description: "Teléfono del paciente para verificar identidad",
                },
                appointment_date: {
                  type: "string",
                  description: "Fecha de la cita a cancelar",
                },
              },
              required: ["patient_name", "phone"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "end_call",
            description: "Finalizar la llamada solo cuando el paciente lo solicite explícitamente",
            parameters: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "Mensaje de despedida antes de finalizar la llamada",
                },
              },
              required: ["message"],
            },
          },
        },
      ];

      const events = await this.client.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: requestMessages,
        stream: true,
        temperature: 0.3,
        max_tokens: 200,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        tools: tools,
      });

      for await (const event of events) {
        if (event.choices.length >= 1) {
          const delta = event.choices[0].delta;
          if (!delta) continue;

          if (delta.tool_calls && delta.tool_calls.length >= 1) {
            const toolCall = delta.tool_calls[0];
            if (toolCall.id) {
              if (funcCall) {
                break;
              } else {
                funcCall = {
                  id: toolCall.id,
                  funcName: toolCall.function?.name || "",
                  arguments: {},
                };
              }
            } else {
              funcArguments += toolCall.function?.arguments || "";
            }
          } else if (delta.content) {
            const res: CustomLlmResponse = {
              response_type: "response",
              response_id: request.response_id,
              content: delta.content,
              content_complete: false,
              end_call: false,
            };
            ws.send(JSON.stringify(res));
          }
        }
      }
    } catch (err) {
      console.error("Error in GPT stream: ", err);
    } finally {
      if (funcCall != null) {
        await this.handleFunctionCall(funcCall, funcArguments, request, ws);
      } else {
        const res: CustomLlmResponse = {
          response_type: "response",
          response_id: request.response_id,
          content: "",
          content_complete: true,
          end_call: false,
        };
        ws.send(JSON.stringify(res));
      }
    }
  }

  private async handleFunctionCall(
    funcCall: FunctionCall,
    funcArguments: string,
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    ws: WebSocket
  ) {
    funcCall.arguments = JSON.parse(funcArguments);

    // Enviar invocación de función
    const functionInvocationResponse: CustomLlmResponse = {
      response_type: "tool_call_invocation",
      tool_call_id: funcCall.id,
      name: funcCall.funcName,
      arguments: JSON.stringify(funcCall.arguments)
    };
    ws.send(JSON.stringify(functionInvocationResponse));

    let functionResult = "";

    switch (funcCall.funcName) {
      case "end_call":
        const res: CustomLlmResponse = {
          response_type: "response",
          response_id: request.response_id,
          content: funcCall.arguments.message,
          content_complete: true,
          end_call: true,
        };
        ws.send(JSON.stringify(res));
        return;

      case "check_availability":
        functionResult = await this.checkAvailabilityWithN8N(funcCall.arguments);
        break;

      case "book_appointment":
        functionResult = await this.bookAppointmentWithN8N(funcCall.arguments);
        break;

      case "cancel_appointment":
        functionResult = await this.cancelAppointmentWithN8N(funcCall.arguments);
        break;

      default:
        functionResult = "Función no reconocida";
    }

    // Enviar resultado de función
    const functionResultResponse: CustomLlmResponse = {
      response_type: "tool_call_result",
      tool_call_id: funcCall.id,
      content: functionResult,
    };
    ws.send(JSON.stringify(functionResultResponse));

    funcCall.result = functionResult;
    this.DraftResponse(request, ws, funcCall);
  }

  private async checkAvailabilityWithN8N(args: any): Promise<string> {
    try {
      if (!process.env.N8N_WEBHOOK_URL) {
        return "Error de configuración del sistema";
      }

      const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
        action: "check_availability",
        date: args.date,
        time: args.time,
        service_type: args.service_type,
      }, { timeout: 5000 });

      return response.data.message || "Disponibilidad verificada";
    } catch (error) {
      console.error("Error checking availability:", error);
      return "No pude verificar la disponibilidad en este momento. Un momento por favor.";
    }
  }

  private async bookAppointmentWithN8N(args: any): Promise<string> {
    try {
      if (!process.env.N8N_WEBHOOK_URL) {
        return "Error de configuración del sistema";
      }

      const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
        action: "book_appointment",
        patient_name: args.patient_name,
        phone: args.phone,
        date: args.date,
        time: args.time,
        service_type: args.service_type,
        is_new_patient: args.is_new_patient,
      }, { timeout: 10000 });

      return response.data.message || "Cita agendada exitosamente";
    } catch (error) {
      console.error("Error booking appointment:", error);
      return "Hubo un problema al agendar la cita. Un momento por favor.";
    }
  }

  private async cancelAppointmentWithN8N(args: any): Promise<string> {
    try {
      if (!process.env.N8N_WEBHOOK_URL) {
        return "Error de configuración del sistema";
      }

      const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
        action: "cancel_appointment",
        patient_name: args.patient_name,
        phone: args.phone,
        appointment_date: args.appointment_date,
      }, { timeout: 5000 });

      return response.data.message || "Cita cancelada exitosamente";
    } catch (error) {
      console.error("Error canceling appointment:", error);
      return "No pude cancelar la cita en este momento. Un momento por favor.";
    }
  }
}