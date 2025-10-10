require("dotenv").config();

const axios = require("axios");

module.exports = {
  name: "avr_get_caller_info",
  description: "Retrieves caller information including phone number, name, and other call details for the current session.",
  input_schema: {
    type: "object",
    properties: {
      info_type: {
        type: "string",
        description: "The type of caller information to retrieve. Options: 'phone', 'name', 'all'",
        enum: ["phone", "name", "all"]
      }
    },
    required: []
  },
  handler: async (uuid, { info_type = "all" }, callerInfo = null) => {
    console.log("Getting caller information for UUID:", uuid);
    console.log("Info type requested:", info_type);
    console.log("Caller info from session:", callerInfo);

    try {
      // If caller info is already available from session, use it
      if (callerInfo && (callerInfo.phoneNumber || callerInfo.callerId)) {
        console.log("Using caller info from session");
        
        if (info_type === "phone") {
          const phone = callerInfo.phoneNumber || callerInfo.callerId || 'Unknown';
          return `Caller phone number: ${phone}`;
        } else if (info_type === "name") {
          const name = callerInfo.callerName || callerInfo.caller_name || 'Unknown';
          return `Caller name: ${name}`;
        } else {
          const phone = callerInfo.phoneNumber || callerInfo.callerId || 'Unknown';
          const name = callerInfo.callerName || callerInfo.caller_name || 'Unknown';
          const channel = callerInfo.channel || 'Unknown';
          const context = callerInfo.context || 'Unknown';
          return `Caller information - Phone: ${phone}, Name: ${name}, Channel: ${channel}, Context: ${context}`;
        }
      }

      // Fallback: try to get caller info from AMI
      const url = process.env.AMI_URL || "http://127.0.0.1:6006";
      const res = await axios.post(`${url}/variables`, {
        uuid,
        info_type
      });
      
      console.log("Caller info response from AMI:", res.data);
      
      if (info_type === "phone") {
        return `Caller phone number: ${res.data.phoneNumber || res.data.caller_id || 'Unknown'}`;
      } else if (info_type === "name") {
        return `Caller name: ${res.data.callerName || res.data.caller_name || 'Unknown'}`;
      } else {
        const phone = res.data.phoneNumber || res.data.caller_id || 'Unknown';
        const name = res.data.callerName || res.data.caller_name || 'Unknown';
        const channel = res.data.channel || 'Unknown';
        const context = res.data.context || 'Unknown';
        return `Caller information - Phone: ${phone}, Name: ${name}, Channel: ${channel}, Context: ${context}`;
      }
    } catch (error) {
      console.error("Error getting caller information:", error.message);
      return `Caller information not available. Error: ${error.message}`;
    }
  },
};
