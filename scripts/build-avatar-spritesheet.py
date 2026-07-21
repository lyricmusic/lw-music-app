#!/usr/bin/env python3
"""Convert a rectangular frame grid into a horizontal WebP sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", default=4, type=int)
    parser.add_argument("--rows", default=4, type=int)
    parser.add_argument("--frame-size", default=256, type=int)
    parser.add_argument(
        "--frame-order",
        help="Comma-separated 1-based source frame indexes for the output strip.",
    )
    parser.add_argument("--lossless", action="store_true")
    parser.add_argument("--quality", default=92, type=int)
    parser.add_argument(
        "--min-component-area",
        default=0,
        type=int,
        help="Remove isolated alpha components smaller than this many pixels per frame.",
    )
    parser.add_argument(
        "--auto-trim",
        action="store_true",
        help="Detect separated frame regions from the alpha channel and align their feet.",
    )
    return parser.parse_args()


def grid_edge(index: int, divisions: int, length: int) -> int:
    return round(index * length / divisions)


def active_runs(projection: tuple[int, ...]) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, active in enumerate((*projection, 0)):
        if active and start is None:
            start = index
        elif not active and start is not None:
            runs.append((start, index))
            start = None
    return runs


def get_frame_regions(
    grid: Image.Image,
    columns: int,
    rows: int,
    auto_trim: bool,
) -> list[tuple[int, int, int, int]]:
    if not auto_trim:
        return [
            (
                grid_edge(column, columns, grid.width),
                grid_edge(row, rows, grid.height),
                grid_edge(column + 1, columns, grid.width),
                grid_edge(row + 1, rows, grid.height),
            )
            for row in range(rows)
            for column in range(columns)
        ]

    opaque_mask = grid.getchannel("A").point(lambda alpha: 255 if alpha > 32 else 0)
    x_projection, y_projection = opaque_mask.getprojection()
    x_runs = active_runs(x_projection)
    y_runs = active_runs(y_projection)
    if len(x_runs) != columns or len(y_runs) != rows:
        raise SystemExit(
            "Could not detect the expected frame grid from alpha: "
            f"found {len(x_runs)} columns and {len(y_runs)} rows"
        )

    return [
        (left, top, right, bottom)
        for top, bottom in y_runs
        for left, right in x_runs
    ]


def remove_small_alpha_components(
    image: Image.Image,
    min_component_area: int,
) -> Image.Image:
    if min_component_area <= 0:
        return image

    alpha = image.getchannel("A")
    width, height = alpha.size
    alpha_bytes = bytearray(alpha.tobytes())
    active = bytearray(value > 8 for value in alpha_bytes)
    visited = bytearray(width * height)

    for start in range(width * height):
        if not active[start] or visited[start]:
            continue

        component: list[int] = []
        stack = [start]
        visited[start] = 1
        while stack:
            current = stack.pop()
            component.append(current)
            x = current % width
            y = current // width
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                row_offset = next_y * width
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row_offset + next_x
                    if active[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        stack.append(neighbor)

        if len(component) < min_component_area:
            for pixel_index in component:
                alpha_bytes[pixel_index] = 0

    cleaned = image.copy()
    cleaned.putalpha(Image.frombytes("L", alpha.size, bytes(alpha_bytes)))
    return cleaned


def reorder_frames(
    frames: list[Image.Image],
    frame_order: str | None,
) -> list[Image.Image]:
    if not frame_order:
        return frames

    try:
        indexes = [int(value.strip()) for value in frame_order.split(",")]
    except ValueError as error:
        raise SystemExit("frame-order must contain only comma-separated integers") from error

    if not indexes or any(index < 1 or index > len(frames) for index in indexes):
        raise SystemExit(
            f"frame-order indexes must be between 1 and {len(frames)}"
        )

    return [frames[index - 1] for index in indexes]


def main() -> None:
    args = parse_args()
    if args.columns < 1 or args.rows < 1 or args.frame_size < 1:
        raise SystemExit("columns, rows and frame-size must be positive")
    if args.min_component_area < 0:
        raise SystemExit("min-component-area cannot be negative")
    if not 0 <= args.quality <= 100:
        raise SystemExit("quality must be between 0 and 100")

    with Image.open(args.input) as source:
        grid = source.convert("RGBA")

    frame_regions = get_frame_regions(
        grid,
        args.columns,
        args.rows,
        args.auto_trim,
    )
    frames: list[Image.Image] = []
    for region in frame_regions:
        cell = remove_small_alpha_components(
            grid.crop(region),
            args.min_component_area,
        )
        content_bounds = cell.getchannel("A").point(
            lambda alpha: 255 if alpha > 8 else 0
        ).getbbox()
        if content_bounds is None:
            raise SystemExit(f"Empty frame region detected: {region}")
        frames.append(cell.crop(content_bounds))

    frames = reorder_frames(frames, args.frame_order)

    frame_count = len(frames)
    sheet = Image.new(
        "RGBA",
        (args.frame_size * frame_count, args.frame_size),
        (0, 0, 0, 0),
    )

    baseline = args.frame_size - 18
    scale = min(
        (args.frame_size - 32) / max(frame.width for frame in frames),
        (baseline - 16) / max(frame.height for frame in frames),
    )
    for frame_index, frame in enumerate(frames):
        rendered_width = max(1, round(frame.width * scale))
        rendered_height = max(1, round(frame.height * scale))
        rendered = frame.resize(
            (rendered_width, rendered_height),
            Image.Resampling.LANCZOS,
        )
        x = frame_index * args.frame_size + (args.frame_size - rendered_width) // 2
        y = baseline - rendered_height
        sheet.alpha_composite(rendered, (x, y))

    pixels = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0 and (red or green or blue):
                pixels[x, y] = (0, 0, 0, 0)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(
        args.output,
        format="WEBP",
        lossless=args.lossless,
        quality=args.quality,
        method=6,
    )
    print(
        f"Wrote {args.output} "
        f"({sheet.width}x{sheet.height}, {frame_count} frames, "
        f"{'lossless' if args.lossless else f'quality {args.quality}'})"
    )


if __name__ == "__main__":
    main()
