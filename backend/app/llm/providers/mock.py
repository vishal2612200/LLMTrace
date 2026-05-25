import asyncio
from collections.abc import AsyncIterator

from app.llm.providers.base import ProviderAdapter


class MockProvider(ProviderAdapter):
    provider = "mock"

    async def stream(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        latest = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        response = (
            "Mock response: I received your message and logged this inference with provider, "
            f"model, latency, token, status, and redacted preview metadata. You said: {latest[:160]}"
        )
        for word in response.split(" "):
            await asyncio.sleep(0.025)
            yield word + " "
