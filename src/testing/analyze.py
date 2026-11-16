#!/usr/bin/env python3
"""Ringkasan hasil pengujian response time & latency dari CSV GTL Test.

Contoh:
    python src/testing/analyze.py hasil.csv

Tidak butuh library tambahan (hanya pustaka standar Python 3).
"""
from __future__ import annotations

import argparse
import csv
import math
import statistics
from collections import defaultdict
from pathlib import Path

METRICS = {
    "interaction": ["response_ms", "latency_ms", "frame_wait_ms", "paint_est_ms"],
    "video-start": ["video_start_ms"],
    "transition": ["transition_ms", "after_design_ms", "design_delay_ms"],
}


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return float("nan")
    index = min(len(sorted_values) - 1, math.ceil(p * len(sorted_values)) - 1)
    return sorted_values[index]


def parse_number(value: str) -> float | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def format_number(value: float | None) -> str:
    if value is None or not math.isfinite(value):
        return "-"
    return f"{value:.1f}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Ringkasan CSV GTL Test")
    parser.add_argument("csv_file", type=Path, help="File CSV hasil ekspor")
    args = parser.parse_args()

    if not args.csv_file.exists():
        print(f"File tidak ditemukan: {args.csv_file}")
        return 1

    groups: dict[tuple[str, str, str], dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    rows = 0

    with args.csv_file.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            metric_names = METRICS.get(row.get("type", ""), [])
            if not metric_names:
                continue
            key = (
                row.get("type", ""),
                row.get("scenario", ""),
                row.get("source", ""),
            )
            for metric in metric_names:
                value = parse_number(row.get(metric, ""))
                if value is not None:
                    groups[key][metric].append(value)
            rows += 1

    if not groups:
        print("Tidak ada data pengukuran yang bisa dianalisis.")
        return 0

    print(f"File   : {args.csv_file}")
    print(f"Baris  : {rows}")
    print()

    for (kind, scenario, source), metrics in sorted(groups.items()):
        print(f"[{kind}] {scenario} / {source}")

        for metric, values in metrics.items():
            if not values:
                continue
            values.sort()
            mean = statistics.fmean(values)
            median = statistics.median(values)
            sd = statistics.stdev(values) if len(values) > 1 else 0.0
            p95 = percentile(values, 0.95)
            print(
                f"  {metric:16s} n={len(values):3d}  "
                f"mean={format_number(mean):>7s}  "
                f"median={format_number(median):>7s}  "
                f"p95={format_number(p95):>7s}  "
                f"sd={format_number(sd):>6s}  "
                f"min={format_number(min(values)):>7s}  "
                f"max={format_number(max(values)):>7s}"
            )

        print()

    print("Catatan:")
    print("- response_ms    : input diterima -> feedback siap")
    print("- latency_ms     : input diterima -> frame berikutnya dijadwalkan")
    print("- frame_wait_ms  : latency_ms - response_ms")
    print("- video_start_ms : START -> frame video pertama")
    print("- transition_ms  : jawaban -> scene segmen baru siap (termasuk 1200 ms)")
    print("- after_design_ms: transisi tanpa jeda desain 1200 ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
