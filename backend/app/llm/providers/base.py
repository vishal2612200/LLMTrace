from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class ProviderAdapter(ABC):
    provider: str

    @abstractmethod
    async def stream(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        raise NotImplementedError


def estimate_tokens(text: str) -> int:
    return max(1, len(text.split()))
