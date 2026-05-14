# Missional AI Video Guide

A static GitHub Pages guide for exploring Missional AI videos.

The site provides:

- A visual table of contents for the Missional AI video collection.
- Executive summaries and recommended audience/use cases.
- Theme and audience filters.
- Subtitle-token search with direct YouTube timestamp links.

## Data Source

The site is generated from public Missional AI YouTube video links and local subtitle files. The generated public search index does not republish full subtitle transcripts. It stores a token-to-timestamp map so users can search caption words and jump to the relevant YouTube moment.

## Update

```bash
MISSIONAL_AI_SOURCE_DIR=/path/to/local/source python3 scripts/build_data.py
```

Then commit and push.
