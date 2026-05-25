from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from app.core.config import get_settings
from app.llm.providers.base import ProviderAdapter


class AnthropicProvider(ProviderAdapter):
    provider = "anthropic"

    async def stream(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        system = "\n".join(m["content"] for m in messages if m["role"] == "system") or None
        anthropic_messages = [m for m in messages if m["role"] in {"user", "assistant"}]
        response = await client.messages.create(
            model=model,
            max_tokens=800,
            system=system,
            messages=anthropic_messages,
        )
        text = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
        for token in text.split(" "):
            yield token + " "
