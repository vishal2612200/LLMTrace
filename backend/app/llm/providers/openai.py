from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.llm.providers.base import ProviderAdapter


class OpenAIProvider(ProviderAdapter):
    provider = "openai"

    async def stream(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        settings = get_settings()
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        stream = await client.chat.completions.create(model=model, messages=messages, stream=True)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
