const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * In-memory registry for API-provided tool handlers
 */
const apiToolHandlers = new Map();

/**
 * Registers API-provided tools so their handlers can be resolved at runtime
 * @param {Array} apiTools - Array of tools from API (each contains a handler object)
 */
function setApiTools(apiTools = []) {
  apiToolHandlers.clear();
  apiTools.forEach(t => {
    if (t && t.name && t.handler && t.handler.url) {
      apiToolHandlers.set(t.name, t.handler);
    }
  });
}

/**
 * Builds OpenAI tool definitions from API tools (strips handler info)
 * @param {Array} apiTools
 * @returns {Array}
 */
function buildApiToolDefinitions(apiTools = []) {
  return apiTools
    .filter(t => t && t.name)
    .map(t => ({
      type: 'function',
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema || {},
    }));
}

/**
 * Loads all available tools from both avr_tools and tools directories, plus optional API tools
 * @param {Array} apiTools - Optional array of tools fetched from API
 * @returns {Array} List of all available tools
 */
function loadTools(apiTools = []) {
  // Define tool directory paths
  const avrToolsDir = path.join(__dirname, 'avr_tools');  // Project-provided tools
  const toolsDir = path.join(__dirname, 'tools');         // User custom tools
  
  let allTools = [];
  
  // Helper function to load tools from a directory
  const loadToolsFromDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) return [];
    
    return fs.readdirSync(dirPath)
      .map(file => {
        const tool = require(path.join(dirPath, file));
        return {
          type: 'function',
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || {},
        };
      });
  };

  // Load tools from both directories
  allTools = [
    ...loadToolsFromDir(avrToolsDir),  // Project tools
    ...loadToolsFromDir(toolsDir),     // Custom tools
    ...buildApiToolDefinitions(apiTools) // API tools (definitions only)
  ];

  // Warning if no tools found
  if (allTools.length === 0) {
    console.warn(`No tools found in ${avrToolsDir} or ${toolsDir}`);
  }

  return allTools;
}

/**
 * Gets the handler for a specific tool
 * @param {string} name - Name of the tool
 * @returns {Function} Tool handler
 * @throws {Error} If the tool is not found
 */
function getToolHandler(name) {
  // Possible paths for the tool file
  const possiblePaths = [
    path.join(__dirname, 'avr_tools', `${name}.js`),  // First check in avr_tools
    path.join(__dirname, 'tools', `${name}.js`)       // Then check in tools
  ];

  // Find the first valid path
  const toolPath = possiblePaths.find(path => fs.existsSync(path));
  
  // If local tool exists, return its handler
  if (toolPath) {
    const tool = require(toolPath);
    return tool.handler;
  }

  // Otherwise, check if it's an API-provided tool
  if (apiToolHandlers.has(name)) {
    const handlerCfg = apiToolHandlers.get(name);
    // Generic API tool handler: always POST with provided headers
    return async function apiToolHandler(sessionUuid, args, callerInfo = null) {
      const url = handlerCfg.url;
      let headersObj = { 'Content-Type': 'application/json' };
      if (Array.isArray(handlerCfg.headers)) {
        headersObj = handlerCfg.headers.reduce((acc, kv) => {
          if (kv && kv.key) acc[kv.key] = kv.value;
          return acc;
        }, headersObj);
      } else if (handlerCfg.headers && typeof handlerCfg.headers === 'object') {
        headersObj = { ...headersObj, ...handlerCfg.headers };
      }

      // Always include session UUID if not explicitly overridden
      if (sessionUuid && !headersObj['X-AVR-UUID']) {
        headersObj['X-AVR-UUID'] = sessionUuid;
      }

      // Include caller information in the request payload
      const payload = {
        ...(args || {}),
        callerInfo: callerInfo
      };

      const response = await axios.post(url, payload, { headers: headersObj });
      // Expecting a string or object that can be used as instructions
      return response.data;
    };
  }

  throw new Error(`Tool "${name}" not found in any available directory or API registry`);
}

module.exports = { loadTools, getToolHandler, setApiTools };