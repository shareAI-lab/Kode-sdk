export const DESCRIPTION = 'Read the current todo list managed by the agent';

export const PROMPT = `Retrieve the canonical list of todos that this agent maintains.

Guidelines:
- Use this before planning or reprioritizing work
- The returned list reflects the current state of all tracked tasks
- Each todo includes: id, title, status, and optional assignee/notes

Todo Status Values:
- pending: Not yet started
- in_progress: Currently being worked on
- completed: Finished

Limitations:
- Returns empty list if todo service is not enabled for this agent`;
