# Caller Information Guide

This guide explains how the AVR system automatically fetches and uses caller phone numbers and other caller information.

## Overview

The AVR system automatically fetches caller information from the PBX/AMI when a session is initialized, including:
- Phone number (Caller ID)
- Caller name
- Channel information
- Context and extension details

## Implementation

### 1. Automatic Caller Information Fetching

The system automatically fetches caller information from the PBX/AMI when a WebSocket session is initialized:

```javascript
// When a session is initialized with just the UUID
{
  "type": "init",
  "uuid": "session-uuid-here"
}

// The system automatically fetches caller info from PBX/AMI
// No need to send caller information in the WebSocket message
```

### 2. Supported Caller Information Fields

The system accepts multiple field names for flexibility:

| Field | Alternative Names | Description |
|-------|------------------|-------------|
| Phone Number | `callerNumber`, `caller_id`, `phoneNumber` | The caller's phone number |
| Name | `callerName`, `caller_name` | The caller's display name |
| Caller ID | `callerId`, `caller_id` | Alternative caller identification |
| Channel | `channel` | Telephony channel information |
| Context | `context` | Call routing context |
| Extension | `extension` | Called extension number |

### 3. AI Agent Access to Caller Information

The AI agent can access caller information using the `avr_get_caller_info` tool:

```javascript
// The AI can call this tool to get caller information
{
  "name": "avr_get_caller_info",
  "arguments": {
    "info_type": "all"  // Options: "phone", "name", "all"
  }
}
```

### 4. API Integration

The system includes API client methods for fetching caller information:

```javascript
// In your API client
const callerInfo = await apiClient.getCallerInfo(sessionUuid);
```

## Usage Examples

### Example 1: Basic Caller Information

```javascript
// Telephony system sends this when call starts
const initMessage = {
  type: "init",
  uuid: "call-12345",
  callerNumber: "+1234567890",
  callerName: "John Smith"
};

// AI agent can then access this information
// The agent will have access to caller details throughout the conversation
```

### Example 2: Advanced Caller Information

```javascript
// More detailed caller information
const initMessage = {
  type: "init",
  uuid: "call-12345",
  callerNumber: "+1234567890",
  callerName: "John Smith",
  channel: "SIP/trunk-00000001",
  context: "from-external",
  extension: "100"
};
```

### Example 3: AI Agent Using Caller Information

The AI agent can use caller information to personalize responses:

```javascript
// AI agent can call the tool to get caller info
const callerInfo = await getCallerInfo("call-12345", { info_type: "all" });
// Returns: "Caller information - Phone: +1234567890, Name: John Smith"

// The agent can then use this information in responses
// "Hello John, I see you're calling from +1234567890. How can I help you today?"
```

## Configuration

### Environment Variables

Ensure your AMI (Asterisk Manager Interface) is configured to provide caller information:

```bash
# AMI URL for caller information queries
AMI_URL=http://127.0.0.1:6006
```

### Telephony System Integration

Your telephony system (Asterisk, FreePBX, etc.) should be configured to:

1. **Capture Caller ID**: Ensure caller ID information is available
2. **Pass to AVR**: Send caller information in the WebSocket init message
3. **AMI Integration**: Configure AMI to provide caller information via API

## Error Handling

The system includes robust error handling:

- If caller information is not available, the system continues to function
- Fallback mechanisms ensure the AI agent can still operate
- Error messages are logged for debugging

## Best Practices

1. **Always include phone number**: The phone number is the most important piece of caller information
2. **Use consistent field names**: Stick to one naming convention across your telephony system
3. **Handle missing data gracefully**: Not all calls will have complete caller information
4. **Log caller information**: Log caller information for debugging and analytics
5. **Respect privacy**: Ensure caller information is handled according to privacy regulations

## Troubleshooting

### Common Issues

1. **No caller information received**: Check that your telephony system is sending the init message with caller data
2. **AMI connection errors**: Verify AMI_URL is correct and AMI service is running
3. **Tool not available**: Ensure the `avr_get_caller_info` tool is properly loaded

### Debugging

Enable debug logging to see caller information:

```javascript
console.log("Caller information:", callerInfo);
```

Check the logs for caller information processing and any errors.

## Security Considerations

- Caller information may contain sensitive data
- Ensure proper access controls for caller information APIs
- Consider data retention policies for caller information
- Implement proper logging and audit trails

## Future Enhancements

Potential future improvements:

1. **Caller history**: Access to previous call history for the same caller
2. **Enhanced caller data**: Support for additional caller attributes
3. **Real-time updates**: Dynamic caller information updates during the call
4. **Integration with CRM**: Connect caller information with customer databases
