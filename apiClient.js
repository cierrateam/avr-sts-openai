/**
 * apiClient.js
 * API client for fetching agent configuration from the AVR system.
 * Handles system instructions, tools, and greeting endpoints.
 */

const axios = require("axios");

class AgentApiClient {
  constructor() {
    this.baseUrl = process.env.AGENT_API_BASE_URL;
    if (this.baseUrl) {
      this.baseUrl = this.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    }
  }

  /**
   * Checks if the API client is properly configured
   * @returns {boolean} True if base URL is configured
   */
  isConfigured() {
    return !!this.baseUrl;
  }

  /**
   * Makes a GET request to the agent API
   * @param {string} endpoint - API endpoint path
   * @param {string} sessionUuid - Session UUID for headers
   * @returns {Promise<Object>} API response data
   */
  async _makeRequest(endpoint, sessionUuid) {
    if (!this.isConfigured()) {
      throw new Error("AGENT_API_BASE_URL is not configured");
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        "X-AVR-UUID": sessionUuid,
      },
    });
    return response.data;
  }

  /**
   * Fetches system instructions for an agent
   * @param {string} agentId - Agent ID
   * @param {string} sessionUuid - Session UUID
   * @returns {Promise<Object>} System instructions data
   */
  async getSystemInstructions(agentId, sessionUuid) {
    return await this._makeRequest(`/api/agents/${agentId}/system-instructions`, sessionUuid);
  }

  /**
   * Fetches available tools for an agent
   * @param {string} agentId - Agent ID
   * @param {string} sessionUuid - Session UUID
   * @returns {Promise<Object>} Tools configuration data
   */
  async getTools(agentId, sessionUuid) {
    return await this._makeRequest(`/api/agents/${agentId}/tools`, sessionUuid);
  }

  /**
   * Fetches greeting configuration for an agent
   * @param {string} agentId - Agent ID
   * @param {string} sessionUuid - Session UUID
   * @returns {Promise<Object>} Greeting configuration data
   */
  async getGreeting(agentId, sessionUuid) {
    return await this._makeRequest(`/api/agents/${agentId}/greeting`, sessionUuid);
  }


  /**
   * Fetches all agent configuration (instructions, tools, greeting)
   * @param {string} agentId - Agent ID
   * @param {string} sessionUuid - Session UUID
   * @returns {Promise<Object>} Complete agent configuration
   */
  async getAgentConfig(agentId, sessionUuid) {
    try {
      const [instructions, tools, greeting] = await Promise.all([
        this.getSystemInstructions(agentId, sessionUuid),
        this.getTools(agentId, sessionUuid),
        this.getGreeting(agentId, sessionUuid),
      ]);

      return {
        instructions,
        tools,
        greeting,
      };
    } catch (error) {
      console.error(`Error fetching agent configuration for ${agentId}:`, error.message);
      throw error;
    }
  }
}

module.exports = AgentApiClient;
