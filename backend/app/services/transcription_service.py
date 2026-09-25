import os
import time
import subprocess
import tempfile
import shutil
from pathlib import Path

from dotenv import load_dotenv
from google import genai

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not configured")

client = genai.Client(api_key=GEMINI_API_KEY)

TRANSCRIPTION_MODEL = "gemini-3.5-transcribe"
MAX_WAIT_SECONDS = 90
POLL_INTERVAL_SECONDS = 2

# Resolve FFmpeg from environment or system PATH.
FFMPEG_PATH = os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg")

if not FFMPEG_PATH:
    raise RuntimeError(
        "FFmpeg is not installed or FFMPEG_PATH is not configured."
    )


def _file_state_name(file_obj) -> str:
    state = getattr(file_obj, "state", None)

    if state is None:
        return ""

    return str(getattr(state, "name", state)).upper()


def _wait_until_active(file_obj):
    name = getattr(file_obj, "name", None)

    if not name:
        raise RuntimeError(
            "Gemini Files API returned no file name."
        )

    started = time.monotonic()

    while True:
        state = _file_state_name(file_obj)

        if state == "ACTIVE":
            return file_obj

        if state == "FAILED":
            error = getattr(file_obj, "error", None)

            raise RuntimeError(
                "Gemini rejected the uploaded audio file during processing. "
                f"State: {state}. Error: {error}"
            )

        if time.monotonic() - started >= MAX_WAIT_SECONDS:
            raise TimeoutError(
                "Timed out waiting for Gemini audio file to become ACTIVE. "
                f"Last state: {state or 'UNKNOWN'}"
            )

        time.sleep(POLL_INTERVAL_SECONDS)

        file_obj = client.files.get(name=name)


def _convert_to_wav(input_path: Path, output_path: Path):
    if not Path(FFMPEG_PATH).exists():
        raise FileNotFoundError(
            f"FFmpeg executable not found at: {FFMPEG_PATH}"
        )

    command = [
        FFMPEG_PATH,
        "-y",
        "-i",
        str(input_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]

    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "FFmpeg audio conversion failed.\n"
            f"{result.stderr[-4000:]}"
        )

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError(
            "FFmpeg completed but produced an empty WAV file."
        )


def transcribe_audio(file_path: str) -> str:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"Audio file not found: {path}"
        )

    if path.stat().st_size == 0:
        raise ValueError("Audio file is empty.")

    # Browser recordings from Chrome/Edge commonly arrive as WebM.
    # Normalize them to WAV before sending to Gemini.
    needs_conversion = path.suffix.lower() in {
        ".webm",
        ".ogg",
        ".oga",
        ".opus",
    }

    converted_path = None

    try:
        upload_path = path

        if needs_conversion:
            fd, temp_name = tempfile.mkstemp(
                suffix=".wav",
                prefix="fieldvoice_",
            )
            os.close(fd)

            converted_path = Path(temp_name)

            _convert_to_wav(
                input_path=path,
                output_path=converted_path,
            )

            upload_path = converted_path

        audio_file = client.files.upload(
            file=str(upload_path)
        )

        audio_file = _wait_until_active(audio_file)

        interaction = client.interactions.create(
            model=TRANSCRIPTION_MODEL,
            input=[
                {
                    "type": "audio",
                    "uri": audio_file.uri,
                    "mime_type": audio_file.mime_type,
                }
            ],
        )

        transcript = (
            interaction.output_text or ""
        ).strip()

        if not transcript:
            raise RuntimeError(
                "Gemini transcription returned an empty transcript."
            )

        return transcript

    finally:
        # Temporary WAV is only an intermediate processing file.
        if converted_path and converted_path.exists():
            try:
                converted_path.unlink()
            except OSError:
                pass