#!/usr/bin/env python3
"""Run the IrisView SDK with an explicit unsupported-host override.

The shipped Developer Kit only declares Ubuntu 22.04/26.04 support. This
launcher does **not** modify the Kit. It imports the SDK's own host predicate
and patches it in memory before the command runs; the on-disk Kit and its
checksum manifests stay untouched by the override itself.

Gated by IRISVIEW_ALLOW_UNSUPPORTED_HOST, which the TypeScript toolchain sets
to the detected distribution id only when the host is not a declared target.
Set IRISVIEW_STRICT_HOST=1 in the toolchain to disable the override.
"""

from __future__ import annotations

import os
import runpy
import sys
from pathlib import Path


def main() -> int:
    raw_root = os.environ.get("FUSIONUI_DEVELOPER_KIT_ROOT")
    if not raw_root:
        print(
            "ERROR: FUSIONUI_DEVELOPER_KIT_ROOT is unset; use the toolchain entry point",
            file=sys.stderr,
        )
        return 2
    kit_root = Path(raw_root).resolve()
    sdk_root = kit_root / "sdk" / "fusionui-app-sdk"
    sdk_script = sdk_root / "fusionui_sdk.py"
    if not sdk_script.is_file():
        print(f"ERROR: IrisView SDK is missing: {sdk_script}", file=sys.stderr)
        return 2

    sys.path.insert(0, str(sdk_root))
    import developer_kit_host  # noqa: E402  (path assembled above)

    allow = os.environ.get("IRISVIEW_ALLOW_UNSUPPORTED_HOST", "")
    if allow:
        host_id, host_version = developer_kit_host.os_release()
        allowed = {item.strip() for item in allow.split(",") if item.strip()}
        if host_id in allowed or "*" in allowed:
            original = developer_kit_host.is_supported_host

            def is_supported_host(candidate_id: str, candidate_version: str) -> bool:
                return original(candidate_id, candidate_version) or candidate_id == host_id

            developer_kit_host.is_supported_host = is_supported_host
            print(
                "WARNING: unsupported host override active for "
                f"{host_id} {host_version}; the officially supported host is "
                "Ubuntu 22.04/26.04 x86_64",
                file=sys.stderr,
            )
        else:
            print(
                f"ERROR: IRISVIEW_ALLOW_UNSUPPORTED_HOST={allow!r} does not name "
                f"detected host {host_id!r}",
                file=sys.stderr,
            )
            return 2

    sys.argv[0] = str(sdk_script)
    runpy.run_path(str(sdk_script), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
