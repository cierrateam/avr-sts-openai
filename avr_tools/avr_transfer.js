require("dotenv").config();

const axios = require("axios");

const transferApiBaseUrl = (process.env.TRANSFER_API_BASE_URL || '').replace(/\/$/, '');

module.exports = {
  name: "avr_transfer",
  description: "Transfers a call to a specific extension with optional context.",
  input_schema: {
    type: "object",
    properties: {
      transfer_extension: {
        type: "string",
        description: "The transfer extension to transfer the call to.",
      },
      transfer_context: {
        type: "string",
        description: "The context to transfer the call to.",
      },
      transfer_priority: {
        type: "string",
        description: "The priority of the transfer.",
      },
      transfer_reason: {
        type: "string",
        description: "Short description of the purpose of the transfer to share with the helper agent.",
      },
    },
    required: ["transfer_extension"],
  },
  handler: async (
    uuid,
    { transfer_extension, transfer_context, transfer_priority, transfer_reason }
  ) => {
    console.log("Transfering call to:", transfer_extension);
    console.log("UUID:", uuid);

    if (transferApiBaseUrl) {
      try {
        const res = await axios.post(`${transferApiBaseUrl}/redirect`, {
          uuid,
          exten: transfer_extension,
          context: transfer_context,
          priority: transfer_priority,
          metadata: {
            transfer_reason,
          },
        });
        console.log("Transfer helper response:", res.data);
        return res.data.message || "Transfer initiated.";
      } catch (error) {
        console.error("Error during helper transfer:", error.message);
        return `Transfer helper failed: ${error.message}`;
      }
    }

    try {
      const url = process.env.AMI_URL || "http://127.0.0.1:6006";
      const res = await axios.post(`${url}/transfer`, {
        uuid,
        exten: transfer_extension,
        context: transfer_context || "demo",
        priority: transfer_priority || 1,
      });
      console.log("Transfer response (legacy):", res.data);
      return res.data.message;
    } catch (error) {
      console.error("Error during transfer:", error.message);
      return `Error during transfer: ${error.message}`;
    }
  },
};
