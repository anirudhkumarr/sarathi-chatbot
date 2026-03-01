
import os
import logging
from typing import Any, Dict, List, Text

import httpx

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


RAG_API_URL = os.getenv("RAG_API_URL", "http://localhost:8000/query/")
RAG_API_TIMEOUT_SECONDS = float(os.getenv("RAG_API_TIMEOUT_SECONDS", "180"))
RAG_QUERY_SOURCE = os.getenv("RAG_QUERY_SOURCE", "rasa_action_server")
RAG_SEND_PROGRESS_MESSAGE = os.getenv("RAG_SEND_PROGRESS_MESSAGE", "false").lower() == "true"


class ActionRetrieveAndAnswer(Action):
    def name(self) -> Text:
        return "action_retrieve_and_answer"

    async def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        latest_message = tracker.latest_message or {}
        user_message = latest_message.get("text")
        sender_id = tracker.sender_id or "anonymous"
        metadata = latest_message.get("metadata") or {}
        intent_name = (latest_message.get("intent") or {}).get("name", "unknown")

        logger.info(
            "Action '%s' triggered. sender_id=%s intent=%s",
            self.name(),
            sender_id,
            intent_name,
        )

        if not user_message:
            dispatcher.utter_message(text="I'm sorry, I didn't get your question. Could you please repeat it?")
            return []

        if RAG_SEND_PROGRESS_MESSAGE:
            dispatcher.utter_message(text="Searching my knowledge base for an answer...")
        request_payload = {
            "query_text": user_message,
            "sender_id": sender_id,
            "metadata": {
                **metadata,
                "source": RAG_QUERY_SOURCE,
                "intent": intent_name,
            },
        }

        try:

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    RAG_API_URL,
                    json=request_payload,
                    timeout=httpx.Timeout(RAG_API_TIMEOUT_SECONDS, connect=10.0),
                )


                response.raise_for_status()

                result = response.json()


                if "answer" in result:
                    dispatcher.utter_message(text=result["answer"])
                    logger.info(
                        "Successfully sent RAG response to user. latency_ms=%s",
                        result.get("latency_ms", "n/a"),
                    )
                else:
                    error_detail = result.get("error", "Unknown error from RAG API.")
                    dispatcher.utter_message(text=f"Sorry, I encountered an issue retrieving the answer: {error_detail}")
                    logger.error("RAG API returned an error payload: %s", error_detail)

        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.json().get("detail", "")
            except Exception:
                detail = e.response.text
            logger.error("RAG API returned HTTP %s: %s", e.response.status_code, detail, exc_info=True)
            dispatcher.utter_message(
                text="Sorry, I ran into an error while processing your request. Please try again."
            )
        except httpx.RequestError as e:

            error_message = f"Sorry, I couldn't connect to my knowledge base. Please ensure the RAG server is running."
            logger.error("HTTP request to RAG API failed: %s", e, exc_info=True)
            dispatcher.utter_message(text=error_message)
        except Exception as e:
            error_message = f"An unexpected error occurred while trying to get an answer."
            logger.error("Unexpected error in '%s': %s", self.name(), e, exc_info=True)
            dispatcher.utter_message(text=error_message)

        return []
