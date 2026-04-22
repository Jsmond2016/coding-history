"""Work status calculation logic.

Port of backend/src/config/workStatus.config.ts
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

WorkStatusType = Literal[
    "relaxed", "normal", "busy", "crazy", "overtime", "superCrazyOvertime"
]


class WorkStatusThresholds(BaseModel):
    relaxed: int = 6
    normal: int = 10
    busy: int = 15
    superCrazy: int = 20


class WorkStatusConfig(BaseModel):
    thresholds: WorkStatusThresholds = WorkStatusThresholds()
    overtime_hour: int = 19


DEFAULT_WORK_STATUS_CONFIG = WorkStatusConfig()

WORK_STATUS_LABELS: dict[WorkStatusType, str] = {
    "relaxed": "轻松",
    "normal": "正常",
    "busy": "忙碌",
    "crazy": "疯狂",
    "overtime": "加班",
    "superCrazyOvertime": "超级疯狂加班",
}

WORK_STATUS_COLORS: dict[WorkStatusType, str] = {
    "relaxed": "green",
    "normal": "blue",
    "busy": "orange",
    "crazy": "red",
    "overtime": "red",
    "superCrazyOvertime": "magenta",
}


def calculate_work_status(
    total_commits: int,
    has_overtime: bool,
    config: WorkStatusConfig = DEFAULT_WORK_STATUS_CONFIG,
) -> WorkStatusType:
    """Calculate work status based on commit count and overtime flag."""
    if has_overtime:
        if total_commits >= config.thresholds.superCrazy:
            return "superCrazyOvertime"
        return "overtime"

    if total_commits < config.thresholds.relaxed:
        return "relaxed"
    elif total_commits < config.thresholds.normal:
        return "normal"
    elif total_commits < config.thresholds.busy:
        return "busy"
    elif total_commits < config.thresholds.superCrazy:
        return "crazy"
    else:
        return "crazy"
