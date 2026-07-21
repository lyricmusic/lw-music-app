from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
LOCAL_PACKAGES = ROOT / ".tools" / "avatar-interpolation"
if LOCAL_PACKAGES.exists():
    sys.path.insert(0, str(LOCAL_PACKAGES))

try:
    import cv2
except ImportError as error:
    raise SystemExit(
        "OpenCV is required. Install scripts/requirements-avatar-interpolation.txt "
        "into .tools/avatar-interpolation before running this script."
    ) from error


SOURCE_FRAME_COUNT = 16
SOURCE_FRAME_SIZE = 256
SOURCE_FPS = 8
TARGET_FPS = 60
TARGET_FRAME_COUNT = 120
TARGET_FRAME_SIZE = 192
SOURCE_GRID_COLUMNS = 4
SOURCE_GRID_ROWS = 4
SOURCE_CHARACTER_HEIGHT = 220
SOURCE_CHARACTER_BASELINE = 238
SOURCE_FACE_CENTER_X = 128
FEMALE_FACE_CENTER_X = 133
BACKGROUND_RGB = np.array([27, 12, 50], dtype=np.float32)
FRAME_DURATIONS_MS = [17, 17, 16] * 40

SPRITES = (
    "base-idle-v1",
    "base-side-step-v1",
    "female-idle-v1",
    "female-side-step-v1",
)

SIDE_STEP_FRAME_ORDER = (0, 2, 1, 4, 6, 5, 6, 8, 8, 9, 10, 12, 9, 10, 14, 15)


def find_content_bands(active_pixels: np.ndarray) -> list[tuple[int, int]]:
    indexes = np.flatnonzero(active_pixels)
    if not len(indexes):
        return []

    split_indexes = np.flatnonzero(np.diff(indexes) > 1)
    starts = np.concatenate(([indexes[0]], indexes[split_indexes + 1]))
    ends = np.concatenate((indexes[split_indexes] + 1, [indexes[-1] + 1]))
    return list(zip(starts.tolist(), ends.tolist(), strict=True))


def find_face_center_x(frame: Image.Image) -> float:
    rgba = np.asarray(frame, dtype=np.uint8)
    alpha = rgba[..., 3]
    content_rows = np.flatnonzero(np.any(alpha > 16, axis=1))
    upper_body_limit = content_rows[0] + round(
        (content_rows[-1] + 1 - content_rows[0]) * 0.6
    )
    row_indexes = np.indices(alpha.shape)[0]
    light_pixels = (
        (rgba[..., 0] > 165)
        & (rgba[..., 1] > 145)
        & (rgba[..., 2] > 170)
        & (alpha > 64)
        & (row_indexes < upper_body_limit)
    ).astype(np.uint8)
    component_count, _, component_stats, component_centroids = (
        cv2.connectedComponentsWithStats(light_pixels)
    )
    face_components = [
        index
        for index in range(1, component_count)
        if component_stats[index, cv2.CC_STAT_AREA] > 20
    ]
    if not face_components:
        raise ValueError("Unable to locate the character face in a source frame")

    face_component = max(
        face_components,
        key=lambda index: component_stats[index, cv2.CC_STAT_AREA],
    )
    return float(component_centroids[face_component, 0])


def normalize_source_frame(
    frame: Image.Image,
    target_face_center_x: int,
) -> np.ndarray:
    width, height = frame.size
    scale = SOURCE_CHARACTER_HEIGHT / height
    resized_width = round(width * scale)
    resized = frame.resize(
        (resized_width, SOURCE_CHARACTER_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    alpha = np.asarray(resized, dtype=np.uint8)[..., 3]
    content_rows = np.flatnonzero(np.any(alpha > 16, axis=1))
    face_center_x = find_face_center_x(resized)
    destination_x = round(target_face_center_x - face_center_x)
    destination_y = SOURCE_CHARACTER_BASELINE - (content_rows[-1] + 1)

    canvas = Image.new("RGBA", (SOURCE_FRAME_SIZE, SOURCE_FRAME_SIZE))
    canvas.alpha_composite(
        resized,
        (destination_x, destination_y),
    )
    return np.asarray(canvas, dtype=np.uint8)


def load_frames(path: Path) -> list[np.ndarray]:
    with Image.open(path) as source_grid:
        source_grid = source_grid.convert("RGBA")
        alpha = np.asarray(source_grid, dtype=np.uint8)[..., 3]
        column_bands = find_content_bands(np.any(alpha > 16, axis=0))
        row_bands = find_content_bands(np.any(alpha > 16, axis=1))

        if len(column_bands) != SOURCE_GRID_COLUMNS or len(row_bands) != SOURCE_GRID_ROWS:
            raise ValueError(
                f"{path} must contain a separated "
                f"{SOURCE_GRID_COLUMNS} x {SOURCE_GRID_ROWS} frame grid"
            )

        target_face_center_x = (
            FEMALE_FACE_CENTER_X
            if path.name.startswith("female-")
            else SOURCE_FACE_CENTER_X
        )
        return [
            normalize_source_frame(
                source_grid.crop((left, top, right, bottom)),
                target_face_center_x,
            )
            for top, bottom in row_bands
            for left, right in column_bands
        ]


def motion_input(frame: np.ndarray) -> np.ndarray:
    alpha = frame[..., 3:4].astype(np.float32) / 255
    rgb = frame[..., :3].astype(np.float32)
    composited = rgb * alpha + BACKGROUND_RGB * (1 - alpha)
    return cv2.cvtColor(composited.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def calculate_flow(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    return cv2.calcOpticalFlowFarneback(
        motion_input(first),
        motion_input(second),
        None,
        0.5,
        5,
        31,
        5,
        7,
        1.5,
        cv2.OPTFLOW_FARNEBACK_GAUSSIAN,
    )


def premultiply(frame: np.ndarray) -> np.ndarray:
    rgba = frame.astype(np.float32) / 255
    rgba[..., :3] *= rgba[..., 3:4]
    return rgba


def warp(frame: np.ndarray, flow: np.ndarray, amount: float) -> np.ndarray:
    height, width = frame.shape[:2]
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )
    return cv2.remap(
        frame,
        grid_x - flow[..., 0] * amount,
        grid_y - flow[..., 1] * amount,
        cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )


def interpolate(
    first: np.ndarray,
    second: np.ndarray,
    forward_flow: np.ndarray,
    backward_flow: np.ndarray,
    progress: float,
) -> np.ndarray:
    warped_first = warp(premultiply(first), forward_flow, progress)
    warped_second = warp(premultiply(second), backward_flow, 1 - progress)
    blended = warped_first * (1 - progress) + warped_second * progress

    alpha = np.clip(blended[..., 3:4], 0, 1)
    rgb = np.divide(
        blended[..., :3],
        np.maximum(alpha, 1 / 255),
        out=np.zeros_like(blended[..., :3]),
        where=alpha > 0,
    )
    rgba = np.concatenate((np.clip(rgb, 0, 1), alpha), axis=2)
    return np.rint(rgba * 255).astype(np.uint8)


def generate_frames(source_frames: list[np.ndarray]) -> list[Image.Image]:
    flows = [
        (
            calculate_flow(source_frames[index], source_frames[(index + 1) % SOURCE_FRAME_COUNT]),
            calculate_flow(source_frames[(index + 1) % SOURCE_FRAME_COUNT], source_frames[index]),
        )
        for index in range(SOURCE_FRAME_COUNT)
    ]

    generated: list[Image.Image] = []
    for output_index in range(TARGET_FRAME_COUNT):
        source_position = output_index * SOURCE_FPS / TARGET_FPS
        first_index = math.floor(source_position) % SOURCE_FRAME_COUNT
        progress = source_position - math.floor(source_position)
        second_index = (first_index + 1) % SOURCE_FRAME_COUNT

        if progress < 1e-6:
            rgba = source_frames[first_index]
        else:
            forward_flow, backward_flow = flows[first_index]
            rgba = interpolate(
                source_frames[first_index],
                source_frames[second_index],
                forward_flow,
                backward_flow,
                progress,
            )

        generated.append(
            Image.fromarray(rgba, "RGBA").resize(
                (TARGET_FRAME_SIZE, TARGET_FRAME_SIZE),
                Image.Resampling.LANCZOS,
            )
        )

    return generated


def save_animation(frames: list[Image.Image], path: Path) -> None:
    temporary_path = path.with_name(f"{path.stem}.tmp{path.suffix}")
    frames[0].save(
        temporary_path,
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATIONS_MS,
        loop=0,
        minimize_size=True,
        quality=92,
        method=4,
    )
    temporary_path.replace(path)


def parse_sprite_names() -> tuple[str, ...]:
    parser = argparse.ArgumentParser(
        description="Generate optical-flow avatar animations as animated WebP files."
    )
    parser.add_argument(
        "sprites",
        nargs="*",
        choices=SPRITES,
        help="Sprite names to generate; all sprites are generated when omitted.",
    )
    return tuple(parser.parse_args().sprites) or SPRITES


def main() -> None:
    source_directory = ROOT / "docs" / "avatar-mvp"
    sprite_directory = ROOT / "public" / "avatars" / "animated"
    for sprite_name in parse_sprite_names():
        source_path = source_directory / f"{sprite_name.removesuffix('-v1')}-grid-v1.png"
        output_path = sprite_directory / f"{sprite_name}.webp"
        source_frames = load_frames(source_path)
        if "side-step" in sprite_name:
            source_frames = [source_frames[index] for index in SIDE_STEP_FRAME_ORDER]
        save_animation(generate_frames(source_frames), output_path)
        print(f"Generated {output_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
