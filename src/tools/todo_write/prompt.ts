export const DESCRIPTION = 'Replace the todo list managed by the agent';

export const PROMPT = `Replace the agent-managed todo list with a new array of todos.

Guidelines:
- Always provide structured IDs, titles, and statuses
- Only ONE item may have "in_progress" status at any time
- IDs should be unique and descriptive
- Titles should be clear and actionable

Todo Structure:
- id (required): Unique identifier for the todo
- title (required): Clear description of the task
- status (required): "pending" | "in_progress" | "completed"
- assignee (optional): Who is responsible
- notes (optional): Additional context or details

Safety/Limitations:
- This operation replaces the entire todo list
- Previous todos not included in the new list will be removed
- Returns error if todo service is not enabled`;
