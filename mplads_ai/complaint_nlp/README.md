# Complaint NLP

## What it does

Triages citizen complaints by urgency (HIGH / MEDIUM / LOW) and category using an LLM call with strict JSON output validation, falling back to a keyword-based classifier when LLM parsing fails. Also clusters near-duplicate complaints using TF-IDF cosine similarity to identify multiple reports about the same underlying issue.

### Capabilities

| Function | Purpose |
|---|---|
| `triage_complaint()` | LLM-based urgency + category classification with keyword fallback |
| `cluster_complaints()` | TF-IDF + cosine similarity near-duplicate grouping |
| `to_risk_signals()` | Convert results into uniform `RiskSignal` objects |

### LLM integration

The LLM is **dependency-injected** as a callable `(system_prompt: str, user_prompt: str) -> str`. This module never imports an LLM SDK. Example wiring:

```python
import openai

def my_llm(system_prompt: str, user_prompt: str) -> str:
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content

result = triage_complaint("Road is collapsing near school", llm_callable=my_llm)
```

## Known false-positive / false-negative failure modes

| Mode | Description |
|---|---|
| **False positive (urgency)** | Keyword fallback may flag "the road is *broken* in several places" as MEDIUM when the actual situation is cosmetic |
| **False positive (clustering)** | TF-IDF treats lexically similar but semantically different complaints as duplicates (e.g., "water tank leaking" vs. "water tank needed") |
| **False negative (urgency)** | Code-switched complaints (Hindi-English mix) or complaints in regional languages pass through the keyword fallback with LOW urgency |
| **False negative (clustering)** | Semantically identical complaints phrased very differently (e.g., "no streetlights" vs. "road is dark at night") won't cluster |
| **Blind spot** | LLM may occasionally return valid JSON with a plausible but wrong category; there is no ground-truth check |

## v1 → v2 migration path

| Change | Details |
|---|---|
| **Triage** | Fine-tune a small classifier (BERT or IndicBERT) on labelled MPLADS complaints to replace both the LLM call (cost) and keyword fallback (accuracy) |
| **Clustering** | Replace TF-IDF with sentence embeddings (e.g., `sentence-transformers`) for semantic similarity |
| **Multi-language** | Add language detection and translation pre-processing for Hindi, Tamil, Telugu, etc. |
| **Feedback loop** | Allow officials to correct triage results; feed corrections back as training data |
