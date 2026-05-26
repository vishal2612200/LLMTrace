from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.core.runtime_config import current_provider_api_key
from app.llm.providers.base import ProviderAdapter


class OpenAIProvider(ProviderAdapter):
    provider = "openai"

    async def stream(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        api_key = current_provider_api_key("openai")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        client = AsyncOpenAI(api_key=api_key)
        stream = await client.chat.completions.create(model=model, messages=messages, stream=True)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
