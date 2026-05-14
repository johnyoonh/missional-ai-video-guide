#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path


SOURCE_ROOT_ENV = "MISSIONAL_AI_SOURCE_DIR"
SOURCE_ROOT_VALUE = os.environ.get(SOURCE_ROOT_ENV)
if not SOURCE_ROOT_VALUE:
    raise SystemExit(f"Set {SOURCE_ROOT_ENV} to the local Missional AI project directory before running.")
SOURCE_ROOT = Path(SOURCE_ROOT_VALUE)
INBOX = SOURCE_ROOT / "inbox"
OUT = Path(__file__).resolve().parents[1] / "data" / "videos.json"

STOPWORDS = {
    "about", "after", "again", "against", "also", "because", "been", "being",
    "between", "could", "does", "doing", "down", "from", "have", "into",
    "just", "like", "more", "most", "much", "need", "only", "other", "over",
    "really", "should", "some", "than", "that", "their", "them", "then",
    "there", "these", "they", "thing", "this", "those", "through", "very",
    "want", "were", "what", "when", "where", "which", "while", "with",
    "would", "your", "christian", "christians", "missional", "2026",
    "professor", "professors", "faculty",
    "able", "actually", "around", "best", "better", "every", "going",
    "good", "here", "it's", "just", "kind", "know", "make", "many",
    "okay", "people", "right", "said", "says", "say", "see", "that's",
    "there's", "things", "think", "used", "using", "we're", "well",
    "will", "work", "you're",
    "come", "don't", "give", "today", "together", "we've", "yeah",
    "year", "years",
    "book", "even", "god's", "heard", "little", "something", "week",
}


def parse_links() -> dict[str, dict[str, str]]:
    links = {}
    pattern = re.compile(r"^\| \[(?P<file>.+?\.srt)\]\((?P<link>https://www\.youtube\.com/watch\?v=[^)]+)\) \| (?P<date>[^|]+) \|")
    for line in (INBOX / "youtube-links.md").read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if not match:
            continue
        file_name = match.group("file")
        url = match.group("link")
        video_id = url.split("v=", 1)[1].split("&", 1)[0]
        links[file_name] = {
            "url": url,
            "videoId": video_id,
            "uploadDate": match.group("date").strip(),
        }
    return links


def srt_time_to_seconds(value: str) -> int:
    hours, minutes, rest = value.split(":")
    seconds = rest.split(",", 1)[0]
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds)


def parse_srt(path: Path) -> list[dict[str, object]]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"\n\s*\n", raw.strip())
    cues = []
    time_pattern = re.compile(r"(?P<start>\d\d:\d\d:\d\d,\d{3})\s+-->\s+(?P<end>\d\d:\d\d:\d\d,\d{3})")
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        time_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if time_index is None:
            continue
        match = time_pattern.search(lines[time_index])
        if not match:
            continue
        text = " ".join(lines[time_index + 1 :])
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            cues.append({"start": srt_time_to_seconds(match.group("start")), "text": text})
    return cues


def title_from_file(path: Path) -> str:
    name = path.name
    if name.endswith(".en.srt"):
        name = name[:-7]
    return (
        name.replace("：", ":")
        .replace("｜", "|")
        .replace("？", "?")
        .replace("＂", '"')
    )


def speaker_from_title(title: str) -> str:
    if "|" in title:
        return title.rsplit("|", 1)[1].strip()
    if " - " in title and "Season" not in title:
        return title.rsplit(" - ", 1)[1].strip()
    if "Dr. John Lennox" in title:
        return "Dr. John Lennox"
    return "Missional AI"


def infer_tags(title: str, text_sample: str) -> list[str]:
    hay = f"{title} {text_sample}".lower()
    rules = [
        ("theological anthropology", ["imago", "human", "lennox", "machine age"]),
        ("ai ethics", ["ethics", "responsible", "guardrail", "evaluators", "control problem"]),
        ("bible translation", ["translation", "languages", "scripture", "youversion", "chosen", "biblingo"]),
        ("global missions", ["mission", "global", "kingdom", "great commission", "underground", "iran"]),
        ("church technology", ["church", "pastor", "sermon", "flock", "trellis", "agents", "chipp"]),
        ("theological education", ["education", "seminar", "discipling", "souls", "formation"]),
        ("ai builders", ["builders", "coding", "innovation", "labs", "data commons", "open source"]),
        ("leadership", ["burden", "calling", "nehemiah", "creative resistance", "investing"]),
        ("spiritual formation", ["prayer", "lord's prayer", "truth", "discipleship"]),
    ]
    tags = [tag for tag, keys in rules if any(key in hay for key in keys)]
    return tags[:4] or ["missional ai"]


def recommended_for(tags: list[str]) -> str:
    if "theological anthropology" in tags:
        return "theology, ethics, and doctrine audiences"
    if "bible translation" in tags:
        return "Bible translation, missions, and language program leaders"
    if "church technology" in tags:
        return "church technology, ministry operations, and practical theology audiences"
    if "global missions" in tags:
        return "missiology, evangelism, and global missions audiences"
    if "ai builders" in tags:
        return "technologists, innovation leaders, and ministry builders"
    return "viewers exploring AI, mission, and theological formation"


def summary_for(title: str, speaker: str, tags: list[str]) -> str:
    lower = title.lower()
    if "hallucinates" in lower:
        return (
            "A practical session on why AI systems can produce confident but unreliable answers, "
            "with direct relevance for Bible tools, theological education, and ministry chat systems. "
            "Use it to introduce the difference between fluency and truthfulness. "
            "It is especially useful for conversations about verification, source grounding, and human review."
        )
    if "imago dei" in lower or "human" in lower or "lennox" in lower:
        return (
            f"{speaker} frames AI through the question of human identity rather than mere productivity. "
            "The talk connects AI adoption to theological anthropology, personhood, and moral agency. "
            "It is a strong starting point for asking what humans are before asking what machines can do. "
            "Use it to establish boundaries around simulated intelligence and embodied Christian formation."
        )
    if "translation" in lower or "languages" in lower or "youversion" in lower or "chosen" in lower or "biblingo" in lower:
        return (
            "This video focuses on AI's role in translation, language access, and Scripture-related media workflows. "
            "It shows why AI can accelerate mission communication while still requiring human review and cultural judgment. "
            "Use it to discuss speed, fidelity, minority languages, and the difference between draft generation and trustworthy ministry output. "
            "It is especially relevant for Bible translation, missions, and intercultural studies."
        )
    if "underground" in lower or "iran" in lower or "global" in lower or "western bubble" in lower:
        return (
            "This session highlights how AI may affect global mission contexts beyond Western church assumptions. "
            "It is useful for discussing digital outreach, contextualization, language access, and ministry in sensitive or restricted settings. "
            "Use it to move beyond tool fascination toward questions of local trust, risk, and embodied follow-up. "
            "The strongest classroom use is in missiology and global Christianity."
        )
    if "labs" in lower or "trellis" in lower or "flock" in lower or "chipp" in lower or "data commons" in lower:
        return (
            "This video presents a concrete ministry technology or platform rather than a purely theoretical argument. "
            "It shows what AI-enabled ministry infrastructure looks like in practice. "
            "The value is in evaluating the problem being solved, the human workflow around the tool, and the risks of scaling ministry communication. "
            "It is best used as a case study for technical discernment."
        )
    if "prayer" in lower or "lord's prayer" in lower or "truth" in lower:
        return (
            "This session brings spiritual formation and prayer into the AI conversation. "
            "It reminds technical and ministry audiences that AI adoption is not only an operational question but a discipleship question. "
            "Use it to discuss how tools shape attention, dependence, and habits of discernment. "
            "It works well as a counterweight to purely technical sessions."
        )
    if "responsible" in lower or "ethics" in lower or "evaluators" in lower or "control problem" in lower:
        return (
            "This video helps frame responsible AI as a question of governance, evaluation, and accountability. "
            "It is useful for moving beyond enthusiasm or fear into concrete criteria for trustworthy systems. "
            "The session pairs well with discussions of human oversight, institutional policy, and public-facing ministry risk. "
            "It is especially relevant for ethics, leadership, and technology courses."
        )
    return (
        f"This session contributes to the broader Missional AI conversation by connecting {', '.join(tags[:2])} with practical ministry questions. "
        "Use it as a selective entry point for seeing how AI is already being discussed by mission-minded builders and leaders. "
        "The video is most useful when paired with questions about human responsibility, theological boundaries, and concrete contribution paths. "
        "It belongs in a curated viewing path rather than as a standalone technology novelty."
    )


def why_watch(title: str, tags: list[str]) -> str:
    if "bible translation" in tags:
        return "Shows how AI can accelerate translation and media access while preserving the need for expert review."
    if "theological anthropology" in tags:
        return "Establishes the human identity questions that should govern technical adoption."
    if "church technology" in tags:
        return "Provides a practical case study for evaluating AI-enabled ministry infrastructure."
    if "global missions" in tags:
        return "Moves the AI conversation into cross-cultural and sensitive mission contexts."
    if "ai ethics" in tags:
        return "Helps viewers frame safety, accountability, and governance questions."
    return "Helps viewers place AI in relation to mission, formation, and faithful technical stewardship."


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9][a-z0-9'-]{2,}", text.lower())
    return [token.strip("'") for token in tokens if token not in STOPWORDS and len(token) >= 4]


def main() -> None:
    links = parse_links()
    videos = []
    index = defaultdict(list)

    for path in sorted(INBOX.glob("*.en.srt")):
        file_name = path.name
        if file_name not in links:
            continue
        title = title_from_file(path)
        speaker = speaker_from_title(title)
        cues = parse_srt(path)
        sample = " ".join(str(cue["text"]) for cue in cues[:80])
        tags = infer_tags(title, sample)
        duration = max((int(cue["start"]) for cue in cues), default=0)
        word_counts = Counter(tokenize(sample + " " + " ".join(str(cue["text"]) for cue in cues[80:220])))
        top_terms = [term for term, _ in word_counts.most_common(10)]

        meta = links[file_name]
        videos.append(
            {
                "id": meta["videoId"],
                "title": title,
                "speaker": speaker,
                "uploadDate": meta["uploadDate"],
                "url": meta["url"],
                "durationSecondsApprox": duration,
                "tags": tags,
                "recommendedFor": recommended_for(tags),
                "summary": summary_for(title, speaker, tags),
                "whyWatch": why_watch(title, tags),
                "topTerms": top_terms,
            }
        )

        seen_pairs = set()
        for cue in cues:
            start = int(cue["start"])
            bucket = (start // 5) * 5
            for token in set(tokenize(str(cue["text"]))):
                pair = (meta["videoId"], bucket)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                index[token].append([meta["videoId"], bucket])

    videos.sort(key=lambda item: (item["uploadDate"], item["title"]), reverse=True)
    graph = build_term_graph(videos)
    output = {
        "sourceLabel": "Missional AI public YouTube videos",
        "generatedNote": "Subtitle search is built from a token-to-timestamp index. Full subtitle text is not republished.",
        "videoCount": len(videos),
        "videos": videos,
        "termGraph": graph,
        "subtitleTokenIndex": {token: hits[:80] for token, hits in sorted(index.items()) if len(hits) >= 1},
    }
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} with {len(videos)} videos and {len(output['subtitleTokenIndex'])} searchable tokens")


def build_term_graph(videos: list[dict[str, object]]) -> dict[str, list[dict[str, object]]]:
    tag_counts = Counter()
    term_counts = Counter()
    edge_counts = Counter()

    for video in videos:
        tags = [str(tag) for tag in video.get("tags", [])]
        terms = [str(term) for term in video.get("topTerms", [])[:8]]
        tag_counts.update(tags)
        term_counts.update(terms)
        for tag in tags:
            for term in terms:
                if term != tag and term not in STOPWORDS:
                    edge_counts[(tag, term)] += 1

    selected_tags = [tag for tag, _ in tag_counts.most_common(10)]
    selected_terms = [term for term, _ in term_counts.most_common(18) if term not in selected_tags]

    nodes = []
    for tag in selected_tags:
        nodes.append({"id": tag, "label": tag, "kind": "theme", "count": tag_counts[tag]})
    for term in selected_terms:
        nodes.append({"id": term, "label": term, "kind": "term", "count": term_counts[term]})

    node_ids = {node["id"] for node in nodes}
    links = [
        {"source": source, "target": target, "count": count}
        for (source, target), count in edge_counts.most_common(48)
        if source in node_ids and target in node_ids
    ]
    return {"nodes": nodes, "links": links}


if __name__ == "__main__":
    main()
