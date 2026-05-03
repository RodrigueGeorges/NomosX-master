# NomosX LLM Routing

NomosX uses a provider router instead of binding agents to one vendor.

Recommended production setup:

```env
PRIMARY_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL_FAST=deepseek-v4-flash
DEEPSEEK_MODEL_REASONING=deepseek-v4-pro
```

Fallback options:

```env
QWEN_API_KEY=...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-max

ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o
```

## Routing Policy

The router maps legacy OpenAI model names to the configured provider.

If an agent still asks for `gpt-4o` and `PRIMARY_LLM_PROVIDER=deepseek`, the request is sent to:

- `DEEPSEEK_MODEL_REASONING` for analysis, strategic synthesis, critique and rewrite work
- `DEEPSEEK_MODEL_FAST` for short classification/extraction/citation tasks

Explicit model prefixes are respected:

- `deepseek-*` routes to DeepSeek
- `qwen*` or `Qwen/*` routes to Qwen
- `claude*` routes to Anthropic
- `gpt-*` routes to the configured primary provider unless `provider: "openai"` is explicitly set

## Recommended Agent Mix

| Task | Recommended |
| --- | --- |
| Topic classification | DeepSeek fast or Qwen turbo |
| Source extraction | DeepSeek fast or Qwen plus |
| Citation verification | DeepSeek fast or Qwen |
| Fact checking | Qwen or DeepSeek fast |
| Analyst synthesis | DeepSeek reasoning |
| Strategic reports | DeepSeek reasoning |
| Debate / Devil's Advocate | DeepSeek reasoning |
| Emergency fallback | Qwen, Anthropic, then OpenAI if configured |

## OpenAI Removal Notes

OpenAI is no longer required for chat/completion flows.

OpenAI may still be useful for embeddings until the semantic engine is migrated to an open embedding provider such as BGE-M3, Jina embeddings, Qwen embeddings, Together, or Fireworks.
