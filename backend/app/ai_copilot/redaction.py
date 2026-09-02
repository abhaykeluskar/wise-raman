import re

class PrivacyRedactor:
    """
    Masks PII before sending text to the LLM.
    """
    
    @staticmethod
    def redact_text(text: str) -> str:
        if not text:
            return text
            
        # Redact Account Numbers (looking for patterns like A/C XXXXXX1234 or just 10+ digits)
        text = re.sub(r'\b\d{10,18}\b', lambda m: 'X' * (len(m.group()) - 4) + m.group()[-4:], text)
        
        # Redact PAN (5 letters, 4 digits, 1 letter)
        text = re.sub(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', 'XXXXX1234X', text)
        
        # Redact Phone Numbers
        text = re.sub(r'\b[6-9]\d{9}\b', 'XXXXX67890', text)
        
        # Redact UPI IDs (basic pattern)
        text = re.sub(r'\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b', 'user@upi', text)
        
        # Redact Email
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', 'user@domain.com', text)
        
        return text
