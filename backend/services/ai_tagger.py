import os
import json
import google.generativeai as genai
from typing import Optional

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


TAGGING_PROMPT = """You are analyzing a personal video journal transcript.
Based on the vibe, emotions, and content of this entry, generate:

1. A short title (1-5 words) that captures the essence/mood of the entry
2. Exactly 3 relevant tags that describe the themes, emotions, or topics
3. A brief summary (1-3 sentences) of what this journal entry is about

The title should feel personal and capture the "vibe" - not just summarize the content.
Tags should be lowercase, single words or short phrases.
The summary should be concise and capture the key points/mood of the entry.
{existing_tags_instruction}
Transcript:
{transcript}

Respond ONLY with valid JSON in this exact format:
{{"title": "Your Title Here", "tags": ["tag1", "tag2", "tag3"], "summary": "Brief summary here."}}"""


class TaggingResult:
    def __init__(self, title: str, tags: list[str], summary: str = ""):
        self.title = title
        self.tags = tags
        self.summary = summary


def generate_title_and_tags(transcript: str, existing_tags: list[str] = None) -> TaggingResult:
    """Use Gemini Flash to generate a title, tags, and summary from transcript."""
    if not transcript or not transcript.strip():
        return TaggingResult(title="Untitled Entry", tags=["unprocessed"], summary="")

    model = genai.GenerativeModel("gemini-2.0-flash")

    # Build existing tags instruction if tags exist
    existing_tags_instruction = ""
    if existing_tags and len(existing_tags) > 0:
        tags_list = ", ".join(existing_tags)
        existing_tags_instruction = f"\nIMPORTANT: Prefer using tags from this existing list when relevant: [{tags_list}]\nOnly create new tags if none of the existing ones fit the content well.\n"

    prompt = TAGGING_PROMPT.format(
        transcript=transcript[:8000],  # Limit transcript length
        existing_tags_instruction=existing_tags_instruction
    )

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=500,
            ),
        )

        # Parse JSON response
        text = response.text.strip()

        # Handle potential markdown code blocks
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])

        result = json.loads(text)
        print(f"[AI] Raw Gemini response: {text[:500]}", flush=True)

        title = result.get("title", "Untitled Entry")
        tags = result.get("tags", [])
        summary = result.get("summary", "")
        print(f"[AI] Parsed - title: {title}, tags: {tags}, summary: {summary[:100] if summary else 'NONE'}", flush=True)

        # Validate and clean tags
        tags = [str(tag).lower().strip() for tag in tags if tag]
        tags = tags[:3]  # Exactly 3 tags

        # Validate title
        if not title or len(title) > 50:
            title = "Untitled Entry"

        # Validate summary
        if summary and len(summary) > 500:
            summary = summary[:500] + "..."

        return TaggingResult(title=title, tags=tags, summary=summary)

    except json.JSONDecodeError:
        # If JSON parsing fails, try to extract manually
        return TaggingResult(title="Processing Error", tags=["error"], summary="")
    except Exception as e:
        print(f"Gemini API error: {e}")
        return TaggingResult(title="Processing Error", tags=["error"], summary="")


def generate_title_and_tags_safe(transcript: str, existing_tags: list[str] = None) -> TaggingResult:
    """Safe wrapper that never throws."""
    try:
        return generate_title_and_tags(transcript, existing_tags)
    except Exception:
        return TaggingResult(title="Untitled Entry", tags=["unprocessed"], summary="")
