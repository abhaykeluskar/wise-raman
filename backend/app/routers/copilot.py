import json
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.ai import query_financial_rag, stream_ollama_chat
from app.ai_copilot.agent import FinancialCopilotAgent
from app.telemetry import backend_telemetry, ai_telemetry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["AI & Copilot"])

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    evidence: Optional[Dict[str, Any]] = None

@router.post("/chat", response_model=ChatResponse)
def chat_with_history(request: ChatRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    try:
        agent = FinancialCopilotAgent(db)
        copilot_result = agent.process_query(current_user.id, request.message)
        evidence = copilot_result.get("evidence", {})
        calc = evidence.get("calculation", {})
        if calc.get("count", 0) > 0:
            return ChatResponse(
                response=copilot_result["response"],
                evidence=evidence
            )
    except Exception as agent_err:
        logger.warning(f"Deterministic copilot fallback to RAG: {agent_err}")
        
    response_text = query_financial_rag(db, request.message, current_user.id)
    return ChatResponse(response=response_text)

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, current_user = Depends(get_current_user)):
    system_prompt = (
        "You are WiseRaman, an expert personal finance assistant. "
        "Answer questions concisely and directly in professional Markdown."
    )
    messages = [{"role": "user", "content": request.message}]
    
    async def token_generator():
        try:
            async for token in stream_ollama_chat(messages, system=system_prompt):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
            
    return StreamingResponse(token_generator(), media_type="text/event-stream")

@router.post("/copilot/query")
def copilot_query_api(request: ChatRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    agent = FinancialCopilotAgent(db)
    return agent.process_query(current_user.id, request.message)

@router.get("/copilot/monthly-review")
def copilot_monthly_review_api(month: Optional[str] = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    agent = FinancialCopilotAgent(db)
    month_str = month or "the past month"
    review = agent.generate_monthly_review(current_user.id, month_str)
    return {"month": month_str, "review": review}

@router.get("/ai/logs")
async def stream_ai_logs():
    async def log_generator():
        async for item in ai_telemetry.subscribe():
            yield f"data: {json.dumps(item)}\n\n"
    return StreamingResponse(log_generator(), media_type="text/event-stream")

@router.get("/backend/logs")
async def stream_backend_logs():
    async def log_generator():
        async for item in backend_telemetry.subscribe():
            yield f"data: {json.dumps(item)}\n\n"
    return StreamingResponse(log_generator(), media_type="text/event-stream")
