from app.db.models import Series, utcnow
from app.schemas.common import SeriesState

STATE_ORDER = [
    SeriesState.UPLOADED,
    SeriesState.ANALYZED,
    SeriesState.QUESTIONS,
    SeriesState.BIBLE_LOCKED,
    SeriesState.STORYBOARD,
    SeriesState.APPROVED,
    SeriesState.RENDERING,
    SeriesState.ASSEMBLED,
    SeriesState.DONE,
]


def state_index(series: Series) -> int:
    return STATE_ORDER.index(SeriesState(series.state))


def advance_state(series: Series, target: SeriesState) -> None:
    target_index = STATE_ORDER.index(target)
    if target_index > state_index(series):
        series.state = target.value
        series.updated_at = utcnow()
