# XML-Style Tool Call Format Support

This document demonstrates the new XML-style tool call format support that has been added to the streaming tool call parser.

## Format Specification

The XML-style tool call format uses the following delimiters:

- `<|tool_calls_section_begin|>` - Marks the beginning of a tool calls section
- `<|tool_call_begin|>` - Marks the beginning of an individual tool call
- `<|tool_call_argument_begin|>` - Marks the beginning of tool call arguments
- `<|tool_call_end|>` - Marks the end of an individual tool call
- `<|tool_calls_section_end|>` - Marks the end of a tool calls section

## Examples

### Single Tool Call

```
<|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0<|tool_call_argument_begin|>{"path": "/Users/rbisri/Documents/test-kolosal-code/sentiment-classification"}<|tool_call_end|><|tool_calls_section_end|>
```

This will be parsed as:
- Function name: `list_directory`
- ID: `0`
- Arguments: `{"path": "/Users/rbisri/Documents/test-kolosal-code/sentiment-classification"}`

### Multiple Tool Calls

```
<|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0<|tool_call_argument_begin|>{"path": "/path1"}<|tool_call_end|><|tool_call_begin|>functions.read_file:1<|tool_call_argument_begin|>{"filePath": "/path2"}<|tool_call_end|><|tool_calls_section_end|>
```

This will be parsed as two separate function calls:
1. `list_directory` with ID `0` and arguments `{"path": "/path1"}`
2. `read_file` with ID `1` and arguments `{"filePath": "/path2"}`

### Tool Call Without ID

```
<|tool_calls_section_begin|><|tool_call_begin|>functions.read_file<|tool_call_argument_begin|>{"filePath": "/path/to/file"}<|tool_call_end|><|tool_calls_section_end|>
```

The ID is optional. If not provided, only the function name and arguments will be parsed.

## Function Name Parsing

The function specification supports namespaced functions:
- `functions.list_directory:0` → function name: `list_directory`, ID: `0`
- `system.functions.nested.tool:1` → function name: `tool`, ID: `1`
- `simple_func:2` → function name: `simple_func`, ID: `2`

The parser extracts the last part after the final dot as the function name.

## Streaming Support

The parser supports streaming across multiple chunks. Tool calls can be fragmented across multiple content chunks and will be properly assembled.

## Integration

The XML-style parser is integrated into the `OpenAIContentConverter` and will automatically detect XML-style tool call markers in content. It works alongside the existing OpenAI JSON-style tool call format, so both formats are supported simultaneously.

## Error Handling

The parser handles various error cases:
- Empty tool call arguments result in an error
- Invalid JSON in arguments results in an error
- Missing function names result in an error
- Malformed XML structure is handled gracefully

## Usage

The XML-style tool call parser is automatically used when XML-style markers are detected in streaming content. No additional configuration is required.