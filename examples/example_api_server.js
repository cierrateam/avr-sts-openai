/**
 * Example API server that receives call summaries
 * This demonstrates how to implement the /api/agents/:agentId/call-summary endpoint
 * 
 * Run with: node example_api_server.js
 */

const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

// Simple in-memory storage for demonstration
const callSummaries = [];

/**
 * Call summary endpoint
 * Receives POST requests with call transcripts and metadata
 */
app.post('/api/agents/:agentId/call-summary', (req, res) => {
  const { agentId } = req.params;
  const sessionUuid = req.headers['x-avr-uuid'];
  const callSummary = req.body;
  
  console.log('\n=== Call Summary Received ===');
  console.log(`Agent ID: ${agentId}`);
  console.log(`Session UUID: ${sessionUuid}`);
  console.log(`Call Duration: ${callSummary.callMetadata.durationSeconds} seconds`);
  console.log(`Caller: ${callSummary.callerInfo.callerName || 'Unknown'} (${callSummary.callerInfo.phoneNumber || 'Unknown'})`);
  console.log(`Transcript entries: ${callSummary.transcripts.length}`);
  console.log('\nTranscript:');
  
  callSummary.transcripts.forEach((entry, index) => {
    const role = entry.role === 'agent' ? '🤖' : '👤';
    console.log(`${role} ${entry.role}: ${entry.text}`);
  });
  
  console.log('===========================\n');
  
  // Store the summary
  callSummaries.push({
    agentId,
    sessionUuid,
    ...callSummary,
    receivedAt: new Date().toISOString()
  });
  
  // Process the data (examples):
  // - Save to database
  // - Send to analytics service
  // - Update CRM
  // - Generate reports
  // - Trigger notifications
  
  res.json({ 
    success: true, 
    message: 'Call summary received successfully',
    summaryId: callSummaries.length - 1
  });
});

/**
 * Get all received call summaries (for demo purposes)
 */
app.get('/api/call-summaries', (req, res) => {
  res.json({
    count: callSummaries.length,
    summaries: callSummaries
  });
});

/**
 * Get statistics about received calls
 */
app.get('/api/call-summaries/stats', (req, res) => {
  const totalCalls = callSummaries.length;
  const totalDuration = callSummaries.reduce((sum, call) => 
    sum + (call.callMetadata?.durationSeconds || 0), 0);
  const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
  const totalTranscripts = callSummaries.reduce((sum, call) => 
    sum + (call.transcripts?.length || 0), 0);
  
  res.json({
    totalCalls,
    totalDuration,
    averageDuration: Math.round(avgDuration),
    totalTranscripts,
    avgTranscriptsPerCall: totalCalls > 0 ? (totalTranscripts / totalCalls).toFixed(1) : 0
  });
});

app.listen(PORT, () => {
  console.log(`Example API server running on http://localhost:${PORT}`);
  console.log(`Endpoint: POST /api/agents/:agentId/call-summary`);
  console.log(`\nSet AGENT_API_BASE_URL=http://localhost:${PORT} in your AVR server\n`);
});
