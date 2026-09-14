"""
MPLADS AI Platform — AI/ML Feature Modules

Six pure-logic modules that feed into the shared risk-scoring pipeline:
  - vision_analysis: duplicate photo detection, geotag verification
  - document_ocr: invoice/UC text extraction and field parsing
  - complaint_nlp: complaint triage and near-duplicate clustering
  - presanction_scoring: explainable pre-sanction risk scoring
  - collusion_network: vendor entity resolution and co-occurrence analysis
  - nl_query: data-grounded natural-language query assistant
"""

__version__ = "0.1.0"
