# Examples

This directory contains example implementations for integrating with the AVR Speech-to-Speech system.

## example_api_server.js

A simple Express.js server that demonstrates how to implement the call summary API endpoint.

### Running the Example

```bash
# Install express if not already installed
npm install express

# Run the example server
node examples/example_api_server.js
```

The server will start on port 3000 and listen for call summaries at:
```
POST http://localhost:3000/api/agents/:agentId/call-summary
```

### Testing with AVR

Configure your AVR server to use this example endpoint:

```bash
# In your .env file
AGENT_ID=test-agent
AGENT_API_BASE_URL=http://localhost:3000
```

When calls end, you'll see the call summaries logged in the example server console.

### Available Endpoints

- `POST /api/agents/:agentId/call-summary` - Receives call summaries
- `GET /api/call-summaries` - Lists all received summaries
- `GET /api/call-summaries/stats` - Shows statistics about received calls

### What It Does

The example server:
1. Receives call summary POST requests
2. Logs the call details to the console (agent, caller, duration, transcript)
3. Stores summaries in memory
4. Provides stats endpoints for analysis

Use this as a starting point for your own implementation!
