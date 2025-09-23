/**
 * index.js
 * Entry point for the OpenAI Speech-to-Speech streaming WebSocket server.
 * This server handles real-time audio streaming between clients and OpenAI's API,
 * performing necessary audio format conversions and WebSocket communication.
 *
 * Client Protocol:
 * - Send {"type": "init", "uuid": "uuid"} to initialize session
 * - Send {"type": "audio", "audio": "base64_encoded_audio"} to stream audio
 * - Receive {"type": "audio", "audio": "base64_encoded_audio"} for responses
 * - Receive {"type": "error", "message": "error_message"} for errors
 *
 */

const WebSocket = require("ws");
const { create } = require("@alexanderolsen/libsamplerate-js");
const { loadTools, getToolHandler, setApiTools } = require("./loadTools");
const AgentApiClient = require("./apiClient");
const axios = require("axios");

require("dotenv").config();

/**
 * Creates and configures a WebSocket connection to OpenAI's real-time API.
 *
 * @returns {WebSocket} Configured WebSocket instance
 */
const connectToOpenAI = () => {
  const model = process.env.OPENAI_MODEL || "gpt-4o-realtime-preview";
  return new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
};

/**
 * Stream Processing
 */

// Global audio resamplers - created once and shared across all connections
let globalDownsampler = null;
let globalUpsampler = null;

/**
 * Fetches caller information from PBX/AMI for a given session UUID
 * @param {string} sessionUuid - Session UUID
 * @returns {Promise<Object>} Caller information object
 */
const fetchCallerInfo = async (sessionUuid) => {
  try {
    const amiUrl = process.env.AMI_URL || "http://127.0.0.1:6006";
    const response = await axios.post(`${amiUrl}/caller-info`, {
      uuid: sessionUuid
    });
    
    console.log("Caller info fetched from PBX:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error fetching caller info from PBX:", error.message);
    return {
      phoneNumber: null,
      callerName: null,
      callerId: null,
      channel: null,
      context: null,
      extension: null
    };
  }
};

/**
 * Initializes global audio resamplers for format conversion.
 * Called once at server startup.
 */
const initializeResamplers = async () => {
  try {
    globalDownsampler = await create(1, 24000, 8000); // 1 channel, 24kHz to 8kHz
    globalUpsampler = await create(1, 8000, 24000); // 1 channel, 8kHz to 24kHz
    console.log("Global audio resamplers initialized");
  } catch (error) {
    console.error("Error initializing resamplers:", error);
    process.exit(1);
  }
};

/**
 * Handles incoming client WebSocket connection and manages communication with OpenAI's API.
 * Implements buffering for audio chunks received before WebSocket connection is established.
 *
 * @param {WebSocket} clientWs - Client WebSocket connection
 */
const handleClientConnection = (clientWs) => {
  console.log("New client WebSocket connection received");
  let sessionUuid = null;
  let callerInfo = null; // Store caller information for the session

  let audioBuffer8k = [];
  let ws = null;
  let isInitialized = false;
  let lastSentOpenAIResponsePayload = null;

  /**
   * Processes OpenAI audio chunks by downsampling and extracting frames.
   * Converts 24kHz audio to 8kHz and extracts 20ms frames (160 samples).
   *
   * @param {Buffer} inputBuffer - Raw audio buffer from OpenAI
   * @returns {Buffer[]} Array of 20ms audio frames
   */
  function processOpenAIAudioChunk(inputBuffer) {
    // Convert Buffer to Int16Array for processing
    const inputSamples = new Int16Array(
      inputBuffer.buffer,
      inputBuffer.byteOffset,
      inputBuffer.length / 2
    );

    // Downsample from 24kHz to 8kHz using global downsampler
    const downsampledSamples = globalDownsampler.full(inputSamples);

    // Accumulate samples in buffer
    audioBuffer8k = audioBuffer8k.concat(Array.from(downsampledSamples));

    // Extract 20ms frames (160 samples = 320 bytes)
    const audioFrames = [];
    while (audioBuffer8k.length >= 160) {
      const frame = audioBuffer8k.slice(0, 160);
      audioBuffer8k = audioBuffer8k.slice(160);

      // Convert to PCM16LE Buffer (320 bytes)
      audioFrames.push(Buffer.from(Int16Array.from(frame).buffer));
    }

    return audioFrames;
  }

  /**
   * Flushes any remaining audio samples in the buffer.
   * This ensures all audio is sent to the client, preventing cut-off words.
   */
  function flushAudioBuffer() {
    if (audioBuffer8k.length > 0) {
      console.log(`Flushing remaining ${audioBuffer8k.length} audio samples`);
      
      // Process all remaining samples in complete frames
      while (audioBuffer8k.length >= 160) {
        const frame = audioBuffer8k.slice(0, 160);
        audioBuffer8k = audioBuffer8k.slice(160);
        
        if (clientWs.readyState === WebSocket.OPEN) {
          const frameBuffer = Buffer.from(Int16Array.from(frame).buffer);
          clientWs.send(
            JSON.stringify({
              type: "audio",
              audio: frameBuffer.toString("base64"),
            })
          );
        }
      }
      
      // If there are remaining samples, pad with silence and send
      if (audioBuffer8k.length > 0) {
        const paddedFrame = new Int16Array(160);
        paddedFrame.set(audioBuffer8k.slice(0, Math.min(audioBuffer8k.length, 160)));
        
        if (clientWs.readyState === WebSocket.OPEN) {
          const frameBuffer = Buffer.from(paddedFrame.buffer);
          clientWs.send(
            JSON.stringify({
              type: "audio",
              audio: frameBuffer.toString("base64"),
            })
          );
        }
      }
      
      // Add additional silence frames to ensure complete word delivery
      // This helps prevent cut-off at sentence endings
      const silenceFrames = 5; // Send 5 additional silence frames (100ms total)
      for (let i = 0; i < silenceFrames; i++) {
        const silenceFrame = new Int16Array(160); // All zeros = silence
        
        if (clientWs.readyState === WebSocket.OPEN) {
          const frameBuffer = Buffer.from(silenceFrame.buffer);
          clientWs.send(
            JSON.stringify({
              type: "audio",
              audio: frameBuffer.toString("base64"),
            })
          );
        }
      }
      
      console.log("Audio buffer flushed and cleared");
    }
    
    // Always clear the buffer, even if it was empty
    audioBuffer8k = [];
  }

  /**
   * Converts 8kHz audio to 24kHz for sending to OpenAI API.
   *
   * @param {Buffer} inputBuffer - 8kHz audio buffer
   * @returns {Buffer} 24kHz audio buffer
   */
  function convert8kTo24k(inputBuffer) {
    const inputSamples = new Int16Array(
      inputBuffer.buffer,
      inputBuffer.byteOffset,
      inputBuffer.length / 2
    );
    const upsampledSamples = globalUpsampler.full(inputSamples);
    return Buffer.from(Int16Array.from(upsampledSamples).buffer);
  }

  // Handle client WebSocket messages
  clientWs.on("message", async (data) => {
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case "init":
          sessionUuid = message.uuid;
          console.log("Session UUID:", sessionUuid);
          
          // Fetch caller information from PBX/AMI
          try {
            callerInfo = await fetchCallerInfo(sessionUuid);
            console.log("Caller information fetched from PBX:", callerInfo);
          } catch (error) {
            console.error("Error fetching caller info:", error);
            callerInfo = {
              phoneNumber: null,
              callerName: null,
              callerId: null,
              channel: null,
              context: null,
              extension: null
            };
          }
          
          // Initialize OpenAI connection when client is ready
          if (!isInitialized) {
            initializeOpenAIConnection();
            isInitialized = true;
          } else {
            console.log("Session already initialized, reusing connection");
            // Send ready signal to client
            clientWs.send(JSON.stringify({
              type: "ready",
              message: "Session ready"
            }));
          }
          break;

        case "audio":
          // Handle audio data from client
          if (message.audio && ws && ws.readyState === WebSocket.OPEN) {
            const audioBuffer = Buffer.from(message.audio, "base64");
            const upsampledAudio = convert8kTo24k(audioBuffer);
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: upsampledAudio.toString("base64"),
              })
            );
          } else if (message.audio && !ws) {
            console.log("OpenAI connection not ready, buffering audio");
            // Could implement audio buffering here if needed
          }
          break;

        case "reset":
          // Reset session for new conversation
          console.log("Resetting session for new conversation");
          // Flush any remaining audio before reset
          flushAudioBuffer();
          audioBuffer8k = [];
          if (ws && ws.readyState === WebSocket.OPEN) {
            // Send conversation reset to OpenAI
            ws.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{
                  type: "input_text",
                  text: ""
                }]
              }
            }));
          }
          break;

        default:
          console.log("Unknown message type from client:", message.type);
          break;
      }
    } catch (error) {
      console.error("Error processing client message:", error);
    }
  });

  // Initialize OpenAI WebSocket connection
  const initializeOpenAIConnection = () => {
    // Close existing connection if any
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    
    ws = connectToOpenAI();

    // Configure WebSocket event handlers
    ws.on("open", async () => {
      console.log("WebSocket connected to OpenAI");
      const apiClient = new AgentApiClient();

      // Initialize session with audio format specifications
      const obj = {
        type: "session.update",
        session: {
          input_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
            language: "de", // Set German as default language for transcription
          },
          output_audio_format: "pcm16",
          instructions:
            "You are a helpful assistant that can answer questions and help with tasks. Please respond in German unless specifically asked to use another language.",
          temperature: +process.env.OPENAI_TEMPERATURE || 0.8,
          max_response_output_tokens: +process.env.OPENAI_MAX_TOKENS || "inf",
        },
      };

      // Load instructions from AGENT_ID endpoint
      if (process.env.AGENT_ID) {
        console.log(`Loading instructions for agent ID: ${process.env.AGENT_ID}`);
        
        if (!apiClient.isConfigured()) {
          console.warn(
            "AGENT_API_BASE_URL is not set. Skipping agent instructions fetch and using default instructions."
          );
          obj.session.instructions =
            "You are a helpful assistant that can answer questions and help with tasks.";
        } else {
          try {
            const data = await apiClient.getSystemInstructions(process.env.AGENT_ID, sessionUuid);
            console.log("Loaded instructions from agent endpoint:", data);
            obj.session.instructions = data.system || data.instructions || data;
          } catch (error) {
            console.error(
              `Error loading instructions for agent ${process.env.AGENT_ID}: ${error.message}`
            );
            console.log("Falling back to default instructions");
            obj.session.instructions =
              "You are a helpful assistant that can answer questions and help with tasks.";
          }
        }
      } else {
        console.log("No AGENT_ID provided, using default instructions");
        obj.session.instructions =
          "You are a helpful assistant that can answer questions and help with tasks.";
      }

      // Load available tools for OpenAI
      try {
        let apiTools = [];
        if (process.env.AGENT_ID && apiClient.isConfigured()) {
          try {
            apiTools = await apiClient.getTools(process.env.AGENT_ID, sessionUuid);
            if (!Array.isArray(apiTools)) {
              apiTools = [];
            }
          } catch (error) {
            console.error(`Error fetching API tools for agent ${process.env.AGENT_ID}: ${error.message}`);
            apiTools = [];
          }
        }

        // Register API tool handlers and build combined tool list
        setApiTools(apiTools);
        obj.session.tools = loadTools(apiTools);
        console.log(`Loaded ${obj.session.tools.length} tools for OpenAI (including ${apiTools.length} from API)`);
      } catch (error) {
        console.error(`Error loading tools for OpenAI: ${error.message}`);
      }

      console.log(obj.session);

      ws.send(JSON.stringify(obj));

      // If a greeting is configured on the API, say it as the first utterance
      try {
        if (process.env.AGENT_ID && apiClient.isConfigured()) {
          console.log(`Fetching greeting for agent ${process.env.AGENT_ID}...`);
          const greetingData = await apiClient.getGreeting(process.env.AGENT_ID, sessionUuid);
          console.log("Greeting data received:", greetingData);
          
          const greetingText = (greetingData && (greetingData.greeting || greetingData.text || greetingData)) || "";
          console.log("Extracted greeting text:", greetingText);
          
          if (typeof greetingText === "string" && greetingText.trim().length > 0) {
            const exactGreeting = greetingText.trim();
            console.log(`Sending greeting as first utterance: "${exactGreeting}"`);
            let greetingInstructions = `Du hast grade den Hörer abgenommen. Sage genau und ausschließlich folgendes, ohne Zusätze: \"${exactGreeting}\"`;
            if (typeof greetingInstructions !== "string") {
              greetingInstructions = String(greetingInstructions);
            }
            const greetingPayload = {
              type: "response.create",
              response: {
                instructions: greetingInstructions,
              },
            };
            console.log("OpenAI payload (greeting) instructions type:", typeof greetingPayload.response.instructions);
            lastSentOpenAIResponsePayload = greetingPayload;
            ws.send(JSON.stringify(greetingPayload));
          } else {
            console.log("No greeting text found or greeting is empty");
          }
        } else {
          console.log("No AGENT_ID or API not configured, skipping greeting");
        }
      } catch (error) {
        console.error("Failed to fetch or send greeting:", error.message);
      }
    });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case "error":
            console.error("OpenAI API error:", message.error);
          if (lastSentOpenAIResponsePayload) {
            console.error("Last sent response.create payload:", lastSentOpenAIResponsePayload);
          }
            clientWs.send(
              JSON.stringify({
                type: "error",
                message: message.error.message,
              })
            );
            break;

          case "session.updated":
            console.log("Session updated:", message);
            break;

          case "response.audio.delta":
            const audioChunk = Buffer.from(message.delta, "base64");
            const audioFrames = processOpenAIAudioChunk(audioChunk);
            // Send audio frames to client
            audioFrames.forEach((frame) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: "audio",
                    audio: frame.toString("base64"),
                  })
                );
              }
            });
            break;

          case "response.audio_started":
            // New response started, ensure buffer is clean
            console.log("New audio response started, clearing buffer");
            audioBuffer8k = [];
            break;

          case "response.audio.done":
            // Flush any remaining audio when response audio is complete
            console.log("Response audio completed, flushing buffer");
            // Immediate flush to ensure all audio is sent
            flushAudioBuffer();
            break;

          case "response.done":
            // Also flush on overall response completion
            console.log("Response completed, ensuring buffer is flushed");
            // Immediate flush to ensure all audio is sent
            flushAudioBuffer();
            break;

          case "response.function_call_arguments.done":
            console.log("Function call arguments streaming completed", message);
            // Get the appropriate handler for the tool
            const handler = getToolHandler(message.name);
            if (!handler) {
              console.error(`No handler found for tool: ${message.name}`);
              return;
            }

            try {
              // Execute the tool handler with the provided arguments and caller info
              const content = await handler(
                sessionUuid,
                JSON.parse(message.arguments),
                callerInfo // Pass caller information to the tool handler
              );
              console.log("Tool response:", content);
              const responseText =
                (content && typeof content === "object"
                  ? (content.message || content.text || JSON.stringify(content))
                  : String(content));
              console.log(`Tool response for ${message.name}:`, content);
              console.log(`Sending tool response text: "${responseText}"`);
              let instructionsText = responseText;
              if (typeof instructionsText !== "string") {
                instructionsText = (instructionsText == null) ? "" : (typeof instructionsText.toString === "function" ? instructionsText.toString() : JSON.stringify(instructionsText));
              }
              const toolResponsePayload = {
                type: "response.create",
                response: {
                  instructions: instructionsText,
                },
              };
              console.log("OpenAI payload (tool) instructions type:", typeof toolResponsePayload.response.instructions);
              lastSentOpenAIResponsePayload = toolResponsePayload;
              ws.send(JSON.stringify(toolResponsePayload));
            } catch (error) {
              // Handle errors during tool execution
              console.error(`Error executing tool ${message.name}:`, error);
              return;
            }
            break;

          case "response.audio_transcript.done":
            const agentData = {
              type: "transcript",
              role: "agent",
              text: message.transcript,
            };
            clientWs.send(JSON.stringify(agentData));
            console.log("Agent transcript:", agentData);
            break;

          case "input_audio_buffer.speech_started":
            console.log("Audio streaming started");
            clientWs.send(JSON.stringify({ type: "interruption" }));
            break;

          case "conversation.item.input_audio_transcription.completed":
            const userData = {
              type: "transcript",
              role: "user",
              text: message.transcript,
            };
            clientWs.send(JSON.stringify(userData));
            console.log("User transcript:", userData);
            break;

          default:
            console.log("Received message type:", message.type);
            break;
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("OpenAI WebSocket connection closed");
      // Flush any remaining audio before closing
      flushAudioBuffer();
      // Reset initialization state to allow reconnection
      isInitialized = false;
    });

    ws.on("error", (err) => {
      console.error("OpenAI WebSocket error:", err);
      cleanup();
    });
  };

  // Handle client WebSocket close
  clientWs.on("close", () => {
    console.log("Client WebSocket connection closed");
    cleanup();
  });

  clientWs.on("error", (err) => {
    console.error("Client WebSocket error:", err);
    cleanup();
  });

  /**
   * Cleans up resources and resets session state.
   */
  function cleanup() {
    // Flush any remaining audio before cleanup
    flushAudioBuffer();
    
    // Reset session state but keep connections alive for reuse
    audioBuffer8k = [];
    sessionUuid = null;
    callerInfo = null;
    isInitialized = false;
    
    // Only close OpenAI connection if it exists and is not already closed
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    
    // Close client connection only if it's still open
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  }
};

/**
 * Global cleanup function to destroy resamplers when the process is terminated.
 */
const cleanupGlobalResources = () => {
  console.log("Cleaning up global resources...");
  if (globalDownsampler) {
    globalDownsampler.destroy();
    globalDownsampler = null;
  }
  if (globalUpsampler) {
    globalUpsampler.destroy();
    globalUpsampler = null;
  }
  console.log("Global resources cleaned up");
};

// Handle process termination signals
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  cleanupGlobalResources();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  cleanupGlobalResources();
  process.exit(0);
});

// Initialize resamplers and start server
const startServer = async () => {
  try {
    await initializeResamplers();

    // Create WebSocket server
    const PORT = process.env.PORT || 6030;
    const wss = new WebSocket.Server({ port: PORT });

    wss.on("connection", (clientWs) => {
      console.log("New client connected");
      handleClientConnection(clientWs);
    });

    console.log(
      `OpenAI Speech-to-Speech WebSocket server running on port ${PORT}`
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();
