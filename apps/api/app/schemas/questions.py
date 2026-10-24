from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionOption(BaseModel):
    value: str
    label: str
    is_auto_decide: bool = False


class QuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    category: str
    subject: str | None
    prompt: str
    options: list[QuestionOption]
    allow_custom: bool
    position: int
    answered: bool
    answer_value: str | None
    answered_at: datetime | None


class AnswerItem(BaseModel):
    question_id: str
    value: str = Field(min_length=1, max_length=2000)


class AnswersSubmit(BaseModel):
    answers: list[AnswerItem] = Field(min_length=1)
