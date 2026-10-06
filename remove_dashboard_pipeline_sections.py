from __future__ import annotations

from pathlib import Path
import re
import shutil
from datetime import datetime

ROOT = Path(__file__).resolve().parents[0]

# Run this script from the repository root or place it in the repo root.
# When run from /mnt/data as downloaded, use --root to point at the project.
import argparse

parser = argparse.ArgumentParser(description="Remove dashboard pipeline KPIs/distribution from FieldVoice AI without touching lead functionality.")
parser.add_argument("--root", type=Path, required=True, help="FieldVoice project root")
args = parser.parse_args()

root = args.root.resolve()
app = root / "apps" / "web" / "src" / "App.tsx"
css = root / "apps" / "web" / "src" / "styles.css"

backend_candidates = [
    root / "backend" / "app" / "api" / "dashboard.py",
    root / "backend" / "app" / "dashboard.py",
]
backend = next((p for p in backend_candidates if p.exists()), None)

if not app.exists():
    raise SystemExit(f"App.tsx not found: {app}")
if not css.exists():
    raise SystemExit(f"styles.css not found: {css}")

stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup_dir = root / ".pipeline-removal-backup" / stamp
backup_dir.mkdir(parents=True, exist_ok=True)

for src in [app, css] + ([backend] if backend else []):
    shutil.copy2(src, backup_dir / src.name)

app_text = app.read_text(encoding="utf-8")
css_text = css.read_text(encoding="utf-8")
backend_text = backend.read_text(encoding="utf-8") if backend else None

# ---------- App.tsx ----------
# 1) Remove the PipelineBar component, if present.
app_text, n_bar = re.subn(
    r"\n// ─── PIPELINE CHART ─+\nfunction PipelineBar\([\s\S]*?\n}\n",
    "\n",
    app_text,
    count=1,
)

# 2) Remove KPI cards specifically carrying Pipeline / Open pipeline / Won value.
app_text, n_kpi = re.subn(
    r"^[ \t]*<Metric icon=\{(?:Target|Zap)\} label=\"(?:Pipeline|Open pipeline|Won value)\"[^\n]*\n",
    "",
    app_text,
    flags=re.MULTILINE,
)

# 3) Remove the Pipeline distribution panel, preserving surrounding grid/layout.
# Handles either single-line or multiline JSX formatting.
patterns = [
    r"\n[ \t]*<div className=\"panel\">\n[ \t]*<PanelTitle title=\"Pipeline distribution\" icon=\{Target\} />\n[ \t]*<PipelineBar pipeline=\{dashboard\?\.pipeline \|\| \[\]\} />\n[ \t]*</div>",
    r"\n[ \t]*<section className=\"panel\">\n[ \t]*<PanelTitle title=\"Pipeline distribution\" icon=\{Target\} />\n[ \t]*<PipelineBar pipeline=\{dashboard\?\.pipeline \|\| \[\]\} />\n[ \t]*</section>",
]
n_dist = 0
for pat in patterns:
    app_text, n = re.subn(pat, "", app_text)
    n_dist += n

# 4) Remove dashboard type fields only when they are the dedicated fields.
app_text = app_text.replace(
    "open_alerts: number; total_leads: number; pipeline_value: number;\n    won_value: number; high_opportunities: number; high_risks: number;",
    "open_alerts: number; total_leads: number;\n    high_opportunities: number; high_risks: number;",
)
app_text = app_text.replace(
    "open_alerts: number; total_leads: number; pipeline_value: number; won_value: number; high_opportunities: number; high_risks: number;",
    "open_alerts: number; total_leads: number; high_opportunities: number; high_risks: number;",
)

# ---------- styles.css ----------
# Remove only CSS used by the deleted pipeline bar.
css_text = re.sub(r"\.pipeline-row\{[^}]*\}", "", css_text)
css_text = re.sub(r"\.pipeline-row>div\{[^}]*\}", "", css_text)
css_text = re.sub(r"\.pipeline-row i\{[^}]*\}", "", css_text)
css_text = re.sub(r"\.pipeline-row strong\{[^}]*\}", "", css_text)
css_text = re.sub(r"\.pipeline-bar-track\{[^}]*\}", "", css_text)
css_text = re.sub(r"\.pipeline-bar-fill\{[^}]*\}", "", css_text)

# ---------- backend dashboard.py ----------
nb = 0
if backend_text is not None:
    # Remove pipeline_value and won_value query block.
    backend_text, n = re.subn(
        r"\n[ \t]*# -+\n[ \t]*# PIPELINE VALUE\n[ \t]*# -+\n\n[\s\S]*?\n[ \t]*won_value = db\.execute\([\s\S]*?\n[ \t]*\)\.scalar\(\)\n",
        "\n",
        backend_text,
        count=1,
    )
    nb += n

    # Remove lead pipeline distribution query/list.
    backend_text, n = re.subn(
        r"\n[ \t]*# -+\n[ \t]*# LEAD PIPELINE DISTRIBUTION\n[ \t]*# -+\n\n[\s\S]*?\n[ \t]*pipeline = \[[\s\S]*?\n[ \t]*\]\n",
        "\n",
        backend_text,
        count=1,
    )
    nb += n

    # Remove response fields.
    backend_text = re.sub(r"^\s*\"pipeline_value\": float\(pipeline_value or 0\),\n", "", backend_text, flags=re.MULTILINE)
    backend_text = re.sub(r"^\s*\"won_value\": float\(won_value or 0\),\n", "", backend_text, flags=re.MULTILINE)
    backend_text = re.sub(r"^\s*\"pipeline\": pipeline,\n", "", backend_text, flags=re.MULTILINE)

# Write changes.
app.write_text(app_text, encoding="utf-8")
css.write_text(css_text, encoding="utf-8")
if backend_text is not None:
    backend.write_text(backend_text, encoding="utf-8")

# Verify no targeted UI phrases/components remain in the edited files.
checks = {
    "App.tsx": ["Pipeline distribution", 'label="Open pipeline"', 'label="Won value"', 'label="Pipeline"', "PipelineBar", "pipeline_value", "won_value"],
    "styles.css": ["pipeline-row", "pipeline-bar-track", "pipeline-bar-fill"],
}
if backend is not None:
    checks[backend.name] = ["pipeline_value", "won_value", '"pipeline": pipeline', "LEAD PIPELINE DISTRIBUTION"]

remaining: dict[str, list[str]] = {}
contents = {"App.tsx": app_text, "styles.css": css_text}
if backend_text is not None:
    contents[backend.name] = backend_text
for filename, needles in checks.items():
    content = contents[filename]
    hits = [needle for needle in needles if needle in content]
    if hits:
        remaining[filename] = hits

print("Pipeline dashboard removal completed.")
print(f"Backups: {backup_dir}")
print(f"App PipelineBar removed: {n_bar}; KPI lines removed: {n_kpi}; distribution panels removed: {n_dist}")
if backend is not None:
    print(f"Backend dashboard blocks removed: {nb}")
else:
    print("Backend dashboard.py not found; frontend/CSS were updated.")
if remaining:
    print("Remaining targeted strings (review manually):")
    for k, v in remaining.items():
        print(f"  {k}: {', '.join(v)}")
else:
    print("No targeted pipeline dashboard strings remain in the edited files.")
