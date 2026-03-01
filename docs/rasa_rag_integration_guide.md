# Rasa + RAG Integration Guide (Alpha)

This project uses the recommended Rasa pattern for external retrieval/generation:

1. User sends message to Rasa channel.
2. Rasa predicts a custom action (`action_retrieve_and_answer`).
3. Action server calls the external RAG API (`rag_pipeline/main.py`).
4. RAG API retrieves from Chroma + generates answer.
5. Action returns answer to user.

## Why this pattern

- Rasa docs recommend integrating external systems through custom actions and the action server.
- This keeps dialogue policy in Rasa and keeps heavy RAG dependencies outside Rasa runtime.

References:
- https://rasa.com/docs/reference/integrations/action-server/actions/
- https://rasa.com/docs/reference/primitives/default-actions/

## Current repository mapping

- Custom action: `actions/actions.py`
- Action endpoint config: `endpoints.yml`
- RAG API endpoint: `rag_pipeline/main.py` (`POST /query/`)
- RAG core logic: `rag_pipeline/ragcore.py`
- Routing rule to RAG action: `data/rules.yml` (`ask_knowledge_question -> action_retrieve_and_answer`)

## Frontend integration options

### Option A (fastest alpha): Socket.IO widget

- Keep `socketio` channel in `credentials.yml`.
- Use a widget that connects to `http://<rasa-host>:5005`.
- For a new chat session, generate a new session id/sender id on page load.
- For resumed chats, reuse previous sender id.

Reference:
- https://rasa.com/docs/reference/channels/your-own-website/

### Option B (recommended for full control): Custom website widget over REST

- Use Rasa REST channel (`rest:` in `credentials.yml`).
- Frontend posts to `POST /webhooks/rest/webhook` with:
  - `sender`: unique session/user id
  - `message`: user message
- Display bot responses from returned message list.

This gives exact control over:
- session lifecycle
- new chat/reset behavior
- browser persistence policy
- UI/UX customization

Reference:
- https://rasa.com/docs/reference/channels/rest/

## Session behavior recommendations

Use Rasa `sender_id` as the single source of conversation identity.

- New chat: generate new `sender_id`.
- Continue chat: reuse old `sender_id`.
- Force reset for same `sender_id`: send `/restart`.

Domain session config is already available to control session expiration:
- `session_expiration_time`
- `carry_over_slots_to_new_session`

Reference:
- https://rasa.com/docs/reference/config/domain/

## What was added for alpha readiness

- Action now sends `sender_id` and message metadata to RAG API.
- RAG API accepts optional `sender_id` and `metadata`.
- RAG logs now include sender/session context for easier debugging.
- Socket.IO channel now explicitly sets:
  - `session_persistence: false`
  - `metadata_key: customData`

## Next implementation task

If you are rebuilding the website widget, implement a tiny session manager:

1. On page load, create `sender_id = crypto.randomUUID()`.
2. Store in `sessionStorage` (or do not store if you want always-fresh chat on reload).
3. Send this id with every message.
4. Add a "New Chat" button that regenerates `sender_id` and clears UI transcript.
