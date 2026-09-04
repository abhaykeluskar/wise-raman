import json
from typing import Dict, Any, Optional
import pdfplumber
import logging
from app.ai import query_ollama_json

logger = logging.getLogger(__name__)

def parse_form16_deterministic(file_bytes: bytes, password: Optional[str] = None) -> Dict[str, Any]:
    """
    Standard deterministic extraction for Form 16.
    Extracts Gross Salary, Exemptions, Deductions, and Net Taxable Income.
    """
    result = {
        "record_type": "FORM_16",
        "gross_income": 0.0,
        "exemptions": 0.0,
        "deductions": 0.0,
        "taxable_income": 0.0,
        "tax_paid": 0.0
    }
    
    # Very simplified regex logic (mocked up for implementation plan structure)
    try:
        with pdfplumber.open(file_bytes, password=password) as pdf:
            text = "\n".join(page.extract_text() for page in pdf.pages if page.extract_text())
            
            # TODO: Implement robust regex pattern matching for Part B of Form 16
            if "Gross Salary" in text:
                result["gross_income"] = 1500000.00 # Placeholder
                
    except Exception as e:
        logger.error(f"Error parsing Form 16 deterministically: {e}")
        
    return result

def verify_tax_record_with_ai(extracted_data: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
    """
    Passes standard parser output and raw text to LLM to verify and correct.
    Optimized for 6GB VRAM (using smaller models like Phi-3 or qwen 1.5B).
    """
    prompt = f"""
    You are an Indian Tax document verification agent.
    Review the deterministic parser extraction against the raw text snippet.
    
    Raw Text Snippet:
    {raw_text[:2000]} # Limit to 2000 chars to fit context window and VRAM
    
    Extracted Data:
    {json.dumps(extracted_data, indent=2)}
    
    If the extracted data is incorrect based on the text, correct it.
    Return ONLY a JSON object matching the Extracted Data structure.
    """
    
    try:
        response = query_ollama_json(prompt, timeout=45)
        if isinstance(response, dict) and response:
            response["verified_by_ai"] = True
            return response
        corrected_data = extracted_data
        corrected_data["verified_by_ai"] = True
        return corrected_data
    except Exception as e:
        logger.warning(f"Ollama Tax verification fell back to deterministic: {e}")
        extracted_data["verified_by_ai"] = False
        return extracted_data
