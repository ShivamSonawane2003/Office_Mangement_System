from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None

class SearchResult(BaseModel):
    id: int
    label: str
    item: Optional[str] = None
    amount: float
    category: str
    status: str
    similarity_score: float

class SearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[SearchResult]
    execution_time_ms: float

class ChatbotRequest(BaseModel):
    query: str
    conversation_history: Optional[List[Dict[str, str]]] = None

class ChatbotResponse(BaseModel):
    query: str
    response: str
    search_results: List[SearchResult] = []
    has_results: bool = False
