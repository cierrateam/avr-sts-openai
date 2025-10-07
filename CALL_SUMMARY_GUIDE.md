# Call Summary Guide

This guide explains how the AVR system automatically sends call summaries with complete transcripts and metadata to the agent API after each call ends.

## Overview

After every call, the system automatically sends a comprehensive call summary to the API endpoint:
```
POST /api/agents/{agentId}/call-summary
```

This summary includes:
- Complete call transcript (both user and agent messages)
- Caller information (phone number, name, etc.)
- Call metadata (start time, end time, duration)
- Session UUID for correlation

## Call Summary Structure

The call summary is sent as a JSON payload with the following structure:

```json
{
  "sessionUuid": "unique-session-identifier",
  "callerInfo": {
    "phoneNumber": "+1234567890",
    "callerName": "John Doe",
    "channel": "SIP/trunk-00000001",
    "context": "from-external",
    "extension": "100"
  },
  "callMetadata": {
    "startTime": "2024-01-15T10:30:00.000Z",
    "endTime": "2024-01-15T10:32:30.000Z",
    "durationSeconds": 150
  },
  "transcripts": [
    {
      "role": "agent",
      "text": "Hello, how can I help you today?",
      "timestamp": "2024-01-15T10:30:05.000Z"
    },
    {
      "role": "user",
      "text": "I need to schedule a maintenance appointment.",
      "timestamp": "2024-01-15T10:30:10.000Z"
    },
    {
      "role": "agent",
      "text": "I'd be happy to help you schedule that.",
      "timestamp": "2024-01-15T10:30:15.000Z"
    }
  ]
}
```

## When Call Summaries Are Sent

Call summaries are automatically sent in the following scenarios:

1. **Normal call completion**: When the agent or user ends the call normally
2. **Hangup tool execution**: When the `avr_hangup` tool is called
3. **Connection loss**: When the WebSocket connection is closed unexpectedly
4. **Client disconnect**: When the client terminates the connection

## API Endpoint Requirements

Your API endpoint should:

1. **Accept POST requests** to `/api/agents/{agentId}/call-summary`
2. **Include the session UUID header**: `X-AVR-UUID: {sessionUuid}`
3. **Return a response** (any JSON response is acceptable)
4. **Handle errors gracefully** (if the endpoint fails, it's logged but doesn't affect call handling)

### Example API Implementation

```javascript
app.post('/api/agents/:agentId/call-summary', (req, res) => {
  const { agentId } = req.params;
  const sessionUuid = req.headers['x-avr-uuid'];
  const callSummary = req.body;
  
  // Store the call summary in your database
  console.log(`Received call summary for agent ${agentId}, session ${sessionUuid}`);
  console.log(`Call duration: ${callSummary.callMetadata.durationSeconds} seconds`);
  console.log(`Transcript entries: ${callSummary.transcripts.length}`);
  
  // Process the data as needed
  // - Store in database
  // - Generate analytics
  // - Trigger notifications
  // - Update CRM systems
  
  res.json({ success: true, message: 'Call summary received' });
});
```

## Configuration

To enable call summary sending, ensure these environment variables are set:

```bash
# Required: Agent ID to identify which agent's calls to track
AGENT_ID=your-agent-id

# Required: Base URL for your API
AGENT_API_BASE_URL=https://your-api.com
```

If either of these is not configured, call summaries will not be sent (logged as skipped).

## Data Fields

### Session UUID
- Unique identifier for the call session
- Used for correlating call data across systems

### Caller Information
All caller information fields may be `null` if not available:
- **phoneNumber**: Caller's phone number (E.164 format recommended)
- **callerName**: Display name of the caller
- **channel**: Telephony channel information
- **context**: Call routing context
- **extension**: Called extension number

### Call Metadata
- **startTime**: ISO 8601 timestamp when the call started
- **endTime**: ISO 8601 timestamp when the call ended
- **durationSeconds**: Total call duration in seconds

### Transcripts
Array of transcript entries in chronological order:
- **role**: Either "user" or "agent"
- **text**: The transcribed text
- **timestamp**: ISO 8601 timestamp when the message was spoken

## Use Cases

### Call Analytics
Track call patterns, common questions, and conversation flows:
```javascript
// Analyze conversation length
const avgWordsPerMessage = callSummary.transcripts
  .reduce((sum, t) => sum + t.text.split(' ').length, 0) / 
  callSummary.transcripts.length;
```

### Quality Assurance
Review call transcripts for quality and compliance:
```javascript
// Check for greeting
const hasGreeting = callSummary.transcripts
  .some(t => t.role === 'agent' && t.text.includes('hello'));
```

### CRM Integration
Automatically update customer records with call information:
```javascript
// Update CRM with call details
await crm.updateContact(callSummary.callerInfo.phoneNumber, {
  lastCallDate: callSummary.callMetadata.endTime,
  lastCallDuration: callSummary.callMetadata.durationSeconds,
  lastConversation: callSummary.transcripts
});
```

### Training & Improvement
Use transcripts to improve agent responses and identify areas for improvement.

## Error Handling

The system handles errors gracefully:

- **API endpoint unavailable**: Logged as error, call handling continues normally
- **Missing configuration**: Logged as "skipped", no error thrown
- **Network timeout**: Logged as error, doesn't block call termination

All errors are logged to help with debugging:
```
Error sending call summary: Connection timeout
Failed to send call summary during cleanup: Error: ...
```

## Privacy & Compliance

**Important considerations:**

1. **Data Privacy**: Call transcripts contain sensitive information
2. **Retention Policies**: Implement appropriate data retention policies
3. **Access Controls**: Ensure proper authentication/authorization on your API
4. **GDPR/Compliance**: Handle call data according to applicable regulations
5. **Encryption**: Use HTTPS for all API communications

## Troubleshooting

### Call summary not being sent

1. Check that `AGENT_ID` is set in environment variables
2. Verify `AGENT_API_BASE_URL` is configured correctly
3. Check server logs for "Skipping call summary" messages
4. Ensure your API endpoint is accessible

### Empty transcript array

1. Verify transcripts are being logged during the call
2. Check that calls are long enough to generate transcripts
3. Ensure OpenAI transcription is enabled and working

### Missing caller information

1. Verify PBX/AMI is sending caller information
2. Check AMI_URL configuration
3. Review logs for "Caller info fetched from PBX" messages

## Best Practices

1. **Process asynchronously**: Handle call summary data in a background job to avoid blocking the API response
2. **Validate data**: Check for null values in caller information
3. **Index properly**: Index sessionUuid and phoneNumber for quick lookups
4. **Archive old data**: Implement data archival for old call summaries
5. **Monitor failures**: Set up alerts for failed call summary submissions
