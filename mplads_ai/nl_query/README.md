# Natural-Language Query Assistant

## What it does

Answers plain-language questions from officials (e.g., "which districts are trending worse this quarter?") grounded strictly in the platform's own structured data. The LLM only sees data explicitly passed into the `QueryContext` and is instructed to say "not available in the current data" rather than guess.

### Capabilities

| Function | Purpose |
|---|---|
| `answer_query()` | Data-grounded Q&A with hallucination validation |
| `to_risk_signals()` | Convert warnings into `RiskSignal` objects |

### LLM integration

The LLM is **dependency-injected** as a callable `(system_prompt: str, user_prompt: str) -> str`. Example:

```python
from mplads_ai.nl_query.query import answer_query, QueryContext

context = QueryContext(
    data_summary="District A: 45 projects, 12 delayed. District B: 30 projects, 2 delayed.",
    available_metrics=["project_count", "delayed_count", "completion_rate"],
    time_range="Q3 2024",
)
result = answer_query("Which district has more delays?", context, my_llm_callable)
print(result.answer)      # "District A has 12 delayed projects out of 45..."
print(result.confidence)  # "HIGH"
```

### Response validation

- **Hallucination guard**: Numbers in the answer that don't appear anywhere in the supplied data context are flagged as warnings.
- **Refusal detection**: If the LLM says "not available", confidence is set to LOW (correct behaviour, not an error).

## Known false-positive / false-negative failure modes

| Mode | Description |
|---|---|
| **False positive (hallucination)** | Computed/derived numbers (e.g., LLM calculates a percentage from raw counts) are flagged as hallucinations because the exact number doesn't appear in the source data |
| **False negative (hallucination)** | The LLM may invent a plausible-looking number that happens to coincidentally match a number in the context |
| **False positive (refusal)** | A valid answer containing the phrase "not available" in a different context (e.g., "the vendor was not available for inspection") may be marked as a refusal |
| **Blind spot** | The module cannot verify factual correctness of qualitative statements (e.g., "District A is performing well") — only numeric hallucinations are checked |

## v1 → v2 migration path

| Change | Details |
|---|---|
| **SQL generation** | Add a text-to-SQL layer so the assistant can query the database directly instead of requiring pre-fetched data |
| **Retrieval** | Implement RAG (Retrieval-Augmented Generation) to automatically fetch relevant data slices based on the question |
| **Validation** | Replace lexical number checking with a semantic consistency model that can validate derived computations |
| **Caching** | Cache frequent query patterns and their data contexts to reduce LLM calls |
| **Audit trail** | Log every query, context, and response for compliance and model monitoring |
