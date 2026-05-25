import os

import pytest

from app.llm.providers.anthropic import AnthropicProvider
from app.llm.providers.openai import OpenAIProvider


@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OPENAI_API_KEY not configured")
def test_openai_provider_adapter_is_available():
    assert OpenAIProvider().provider == "openai"


@pytest.mark.skipif(not os.getenv("ANTHROPIC_API_KEY"), reason="ANTHROPIC_API_KEY not configured")
def test_anthropic_provider_adapter_is_available():
    assert AnthropicProvider().provider == "anthropic"
